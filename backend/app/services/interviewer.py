import logging
from typing import TypedDict
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage

from app.core.config import settings
from app.services.ingestion import get_session_vectorstore

logger = logging.getLogger(__name__)

# ── STATE ─────────────────────────────────────────────────
class InterviewState(TypedDict):
    session_id: str
    project_description: str
    questions: list[dict]
    current_question_index: int
    answers: list[dict]
    scores: list[int]
    total_score: int
    status: str

# ── LLM ───────────────────────────────────────────────────
def get_llm():
    return ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model="llama-3.1-8b-instant",
        temperature=0.3
    )

# ── NODE 1: Generate Question ──────────────────────────────
def generate_question(state: InterviewState) -> InterviewState:
    session_id = state["session_id"]
    asked_questions = [q["question"] for q in state["questions"]]
    used_sources = {q["source_file"] for q in state["questions"]}
    used_chunks = {q["code_reference"] for q in state["questions"]}

    vectorstore = get_session_vectorstore(session_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

    query = state["project_description"]
    if asked_questions:
        query = f"{query} {' '.join(asked_questions[-2:])}"

    docs = retriever.invoke(query)

    chosen = next(
        (d for d in docs if d.metadata.get("source", "unknown") not in used_sources),
        None,
    )
    if chosen is None:
        chosen = next(
            (d for d in docs if d.page_content not in used_chunks),
            None,
        )
    if chosen is None:
        chosen = docs[0] if docs else None
        logger.warning(
            "generate_question: no unused chunk found for session %s at question %d; reusing a chunk",
            session_id,
            len(state["questions"]) + 1,
        )

    code_chunk = chosen.page_content if chosen else ""
    source_file = chosen.metadata.get("source", "unknown") if chosen else "unknown"

    llm = get_llm()
    backtick = "```"
    prompt = (
        f"You are a senior software engineer conducting a real technical interview at a top tech company.\n"
        f"The candidate claims to have built this project themselves.\n\n"
        f"Here is actual code from their project:\n\n"
        f"File: {source_file}\n"
        f"{backtick}\n"
        f"{code_chunk}\n"
        f"{backtick}\n\n"
        f"Ask ONE deep, specific technical question about this exact code.\n\n"
        f"Good question types:\n"
        f"- Why did you choose this approach over [specific alternative]?\n"
        f"- What happens under the hood when this line executes?\n"
        f"- What's the failure mode here and how would you handle it?\n"
        f"- How does this scale if you had 10,000 concurrent users?\n"
        f"- What's the time/space complexity of this and why does it matter here?\n"
        f"- If this dependency disappeared tomorrow, how would you replace it?\n"
        f"- Walk me through exactly what happens when [specific input] hits this code.\n\n"
        f"Rules:\n"
        f"- Reference the ACTUAL variable names, function names, or logic from the code\n"
        f"- Do NOT ask generic questions like 'explain RAG' or 'what is an API'\n"
        f"- The question must be unanswerable without having actually built this\n"
        f"- Max 2 sentences\n\n"
        f"Return ONLY the question. No preamble, no explanation."
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

# ── NODE 2: Evaluate Answer ────────────────────────────────
def evaluate_answer(state: InterviewState) -> InterviewState:
    current_idx = state["current_question_index"]

    if current_idx >= len(state["answers"]):
        return state

    current_question = state["questions"][current_idx]
    current_answer = state["answers"][current_idx]

    user_answer = current_answer.get("answer", "")
    peeked = current_answer.get("peeked", False)

    llm = get_llm()
    backtick = "```"
    prompt = (
        f"You are a senior engineer evaluating a technical interview answer.\n\n"
        f"Question asked: {current_question['question']}\n\n"
        f"Actual code from their project:\n"
        f"{backtick}\n"
        f"{current_question['code_reference']}\n"
        f"{backtick}\n\n"
        f"Candidate's answer: {user_answer}\n\n"
        f"Do three things:\n\n"
        f"1. Score from 0-10:\n"
        f"   - 9-10: Nailed it — deep understanding, precise language\n"
        f"   - 7-8: Good — correct but missing depth or specifics\n"
        f"   - 5-6: Partial — right direction but vague or incomplete\n"
        f"   - 3-4: Weak — mostly incorrect or just guessing\n"
        f"   - 0-2: Wrong or no answer\n\n"
        f"2. Give honest feedback on their answer — what they got right, what they missed, what was vague.\n\n"
        f"3. Give the IDEAL answer — what a strong senior engineer would say. "
        f"Be specific, reference the actual code, explain the reasoning behind decisions.\n\n"
        f"Respond in EXACTLY this format:\n"
        f"SCORE: [number]\n"
        f"FEEDBACK: [honest assessment of their answer]\n"
        f"IDEAL_ANSWER: [what a strong engineer would have said]"
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

    return {
        **state,
        "scores": updated_scores,
        "total_score": sum(updated_scores),
        "answers": updated_answers,
        "current_question_index": current_idx + 1
    }


# ── ROUTER ────────────────────────────────────────────────
def should_continue(state: InterviewState) -> str:
    if len(state["questions"]) >= 10:
        return "end"
    if state["status"] == "completed":
        return "end"
    return "generate"


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
        {
            "generate": "generate_question",
            "end": END
        }
    )

    return graph.compile()


interview_graph = build_interview_graph()