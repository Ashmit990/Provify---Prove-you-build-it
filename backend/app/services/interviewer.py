import logging
from typing import TypedDict
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage

from app.core.config import settings
from app.services.ingestion import get_session_vectorstore

logger = logging.getLogger(__name__)


class InterviewState(TypedDict):
    session_id: str
    project_description: str
    questions: list[dict]
    current_question_index: int
    answers: list[dict]
    scores: list[int]
    total_score: int
    status: str


def get_llm():
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model="llama-3.1-8b-instant",
        temperature=0.3
    )


# ── NODE 1: Generate ONE question then stop ────────────────
def generate_question(state: InterviewState) -> InterviewState:
    session_id = state["session_id"]
    used_sources = {q["source_file"] for q in state["questions"]}
    used_chunks = {q["code_reference"] for q in state["questions"]}

    vectorstore = get_session_vectorstore(session_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

    query = state["project_description"]
    docs = retriever.invoke(query)

    # filter out empty/whitespace docs first
    docs = [d for d in docs if d.page_content.strip()]

    chosen = next(
        (d for d in docs if d.metadata.get("source") not in used_sources),
        None
    )
    if chosen is None:
        chosen = next(
            (d for d in docs if d.page_content not in used_chunks),
            None
        )
    if chosen is None:
        chosen = docs[0] if docs else None
        logger.warning("No unused chunk found for session %s at question %d", session_id, len(state["questions"]) + 1)

    code_chunk = chosen.page_content.strip() if chosen else ""
    source_file = chosen.metadata.get("source", "unknown") if chosen else "unknown"

    # Guard: if chunk is empty, skip LLM call entirely
    if not code_chunk:
        logger.error("Empty code chunk retrieved — skipping question generation")
        return {**state, "status": "in_progress"}

    llm = get_llm()
    backtick = "```"
    prompt = (
        f"You are a senior software engineer conducting a real technical interview.\n"
        f"The candidate claims to have built this project themselves.\n\n"
        f"Here is actual code from their project:\n\n"
        f"File: {source_file}\n"
        f"{backtick}\n{code_chunk}\n{backtick}\n\n"
        f"Ask ONE deep, specific technical question about this exact code.\n\n"
        f"Good question types:\n"
        f"- Why did you choose this approach over [specific alternative]?\n"
        f"- What happens under the hood when this line executes?\n"
        f"- What's the failure mode here and how would you handle it?\n"
        f"- How does this scale if you had 10,000 concurrent users?\n"
        f"- Walk me through exactly what happens when [specific input] hits this code.\n\n"
        f"Rules:\n"
        f"- Reference ACTUAL variable names, function names, or logic from the code\n"
        f"- Do NOT ask generic questions — must be unanswereable without having built this\n"
        f"- Max 2 sentences\n\n"
        f"Return ONLY the question. No preamble."
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    question_text = response.content.strip()

    new_question = {
        "question": question_text,
        "code_reference": code_chunk,
        "source_file": source_file
    }

    return {
        **state,
        "questions": state["questions"] + [new_question],
        "status": "in_progress"
    }


# ── NODE 2: Evaluate the latest answer ────────────────────
def evaluate_answer(state: InterviewState) -> InterviewState:
    current_idx = state["current_question_index"]

    # No answer to evaluate yet (first question on /start)
    if current_idx >= len(state["answers"]):
        return state

    current_question = state["questions"][current_idx]
    current_answer = state["answers"][current_idx]

    user_answer = current_answer.get("answer", "")
    peeked = current_answer.get("peeked", False)

    llm = get_llm()
    backtick = "```"
    prompt = (
        f"You are a senior software engineer conducting a real technical interview.\n"
        f"The candidate claims to have built this project themselves.\n\n"
        f"Here is actual code from their project:\n\n"
        f"File: {source_file}\n"
        f"{backtick}\n{code_chunk}\n{backtick}\n\n"
        f"Ask ONE deep, specific technical question about this exact code.\n\n"
        f"Good question types:\n"
        f"- Why did you choose this approach over [specific alternative]?\n"
        f"- What happens under the hood when this line executes?\n"
        f"- What's the failure mode here and how would you handle it?\n"
        f"- How does this scale if you had 10,000 concurrent users?\n"
        f"- Walk me through exactly what happens when [specific input] hits this code.\n\n"
        f"Rules:\n"
        f"- Reference ACTUAL variable names, function names, or logic from the code\n"
        f"- Do NOT ask generic questions — must be unanswereable without having built this\n"
        f"- Max 2 sentences\n"
        f"- Use simple, plain, everyday wording. Short sentences. One idea per sentence.\n"
        f"- Do NOT stack multiple sub-questions or clauses into a single sentence using "
        f"'and how does...' or 'potentially causing...' — ask about ONE thing directly.\n"
        f"- Keep the technical depth and specificity exactly as hard as before — only "
        f"simplify the SENTENCE STRUCTURE and WORDING, not the difficulty of what's being asked.\n\n"
        f"Return ONLY the question. No preamble."
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content.strip()

    score = 0
    feedback_lines = []
    ideal_answer_lines = []
    current_key = None

    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("SCORE:"):
            try:
                score = int(stripped.replace("SCORE:", "").strip())
            except ValueError:
                score = 0
            current_key = "SCORE"
        elif stripped.startswith("FEEDBACK:"):
            feedback_lines.append(stripped.replace("FEEDBACK:", "").strip())
            current_key = "FEEDBACK"
        elif stripped.startswith("IDEAL_ANSWER:"):
            ideal_answer_lines.append(stripped.replace("IDEAL_ANSWER:", "").strip())
            current_key = "IDEAL_ANSWER"
        else:
            if current_key == "FEEDBACK":
                feedback_lines.append(line)
            elif current_key == "IDEAL_ANSWER":
                ideal_answer_lines.append(line)

    feedback = "\n".join(feedback_lines).strip() or "No feedback"
    ideal_answer = "\n".join(ideal_answer_lines).strip()

    if peeked:
        score = score // 2
        feedback += " (score halved — answer was peeked)"

    updated_scores = state["scores"] + [score]
    updated_answers = state["answers"][:current_idx] + [
        {**current_answer, "score": score, "feedback": feedback, "ideal_answer": ideal_answer}
    ] + state["answers"][current_idx + 1:]

    is_last = (current_idx + 1) >= 10

    return {
        **state,
        "scores": updated_scores,
        "total_score": sum(updated_scores),
        "answers": updated_answers,
        "current_question_index": current_idx + 1,
        "status": "completed" if is_last else "in_progress"
    }


# ── ROUTER: always stop after one generate+evaluate cycle ──
def should_continue(state: InterviewState) -> str:
    if state["status"] == "completed":
        return "end"
    # Stop after generating one question — frontend drives the loop
    return "end"


# ── BUILD GRAPH ────────────────────────────────────────────
def build_interview_graph():
    graph = StateGraph(InterviewState)

    graph.add_node("generate_question", generate_question)
    graph.add_node("evaluate_answer", evaluate_answer)

    graph.set_entry_point("generate_question")
    graph.add_edge("generate_question", "evaluate_answer")

    graph.add_conditional_edges(
        "evaluate_answer",
        should_continue,
        {"end": END}
    )

    return graph.compile()


interview_graph = build_interview_graph()