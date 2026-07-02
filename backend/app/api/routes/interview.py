from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import logging

from app.services.interviewer import interview_graph, InterviewState
from app.services.ingestion import ingest_session, delete_session_vectorstore
from app.services.session_store import save_session, load_session, delete_session
from app.core.database import supabase_admin

router = APIRouter()
logger = logging.getLogger(__name__)


class StartInterviewRequest(BaseModel):
    session_id: str
    project_description: str
    user_id: str | None = None


class AnswerRequest(BaseModel):
    session_id: str
    answer: str
    peeked: bool = False


# ── /start ────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_interview(req: StartInterviewRequest):
    loop = asyncio.get_event_loop()

    # Ingest the uploaded code into the per-session ChromaDB collection
    try:
        chunks = await loop.run_in_executor(None, ingest_session, req.session_id)
        logger.info("Ingested %d chunks for session %s", chunks, req.session_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Ingestion failed: {exc}")

    initial_state: InterviewState = {
        "session_id": req.session_id,
        "project_description": req.project_description,
        "questions": [],
        "current_question_index": 0,
        "answers": [],
        "scores": [],
        "total_score": 0,
        "status": "in_progress",
    }

    # LangGraph is blocking — run in thread pool to keep the event loop responsive
    state = await loop.run_in_executor(None, interview_graph.invoke, initial_state)

    # Persist to Redis (with in-memory fallback)
    await loop.run_in_executor(None, save_session, req.session_id, dict(state))

    # Create the session row in Supabase
    try:
        supabase_admin.table("sessions").insert({
            "id": req.session_id,
            "user_id": req.user_id,
            "project_name": req.project_description[:100],
            "project_description": req.project_description,
            "status": "in_progress",
            "total_score": 0,
            "max_score": 100,
        }).execute()
    except Exception as exc:
        logger.error("Failed to create session row: %s", exc)

    first_question = state["questions"][0]
    return {
        "session_id": req.session_id,
        "question_number": 1,
        "question": first_question["question"],
        "source_file": first_question["source_file"],
        "total_questions": 10,
    }


# ── /answer ───────────────────────────────────────────────────────────────────

@router.post("/answer")
async def submit_answer(req: AnswerRequest):
    loop = asyncio.get_event_loop()

    # Load from Redis (or in-memory fallback)
    state = await loop.run_in_executor(None, load_session, req.session_id)
    if not state:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please start a new interview.",
        )

    state["answers"].append({"answer": req.answer, "peeked": req.peeked})

    state = await loop.run_in_executor(None, interview_graph.invoke, state)

    question_number = state["current_question_index"]
    last_answer = state["answers"][-1]
    last_question = state["questions"][question_number - 1]

    # Persist updated state
    await loop.run_in_executor(None, save_session, req.session_id, dict(state))

    # Write this Q&A to Supabase
    try:
        supabase_admin.table("questions").insert({
            "session_id": req.session_id,
            "question_text": last_question["question"],
            "code_reference": last_question["code_reference"],
            "source_file": last_question["source_file"],
            "user_answer": req.answer,
            "peeked": req.peeked,
            "score": last_answer.get("score", 0),
            "max_score": 10,
            "feedback": last_answer.get("feedback", ""),
            "ideal_answer": last_answer.get("ideal_answer", ""),
        }).execute()
    except Exception as exc:
        logger.error("Failed to save question: %s", exc)

    # Interview complete?
    if question_number >= 10 or state["status"] == "completed":
        # Update session row
        try:
            supabase_admin.table("sessions").update({
                "status": "completed",
                "total_score": state["total_score"],
                "completed_at": "now()",
            }).eq("id", req.session_id).execute()
        except Exception as exc:
            logger.error("Failed to update session: %s", exc)

        # Clean up ChromaDB collection and Redis key
        try:
            await loop.run_in_executor(None, delete_session_vectorstore, req.session_id)
        except Exception as exc:
            logger.error("Failed to delete vectorstore: %s", exc)

        await loop.run_in_executor(None, delete_session, req.session_id)

        return {
            "status": "completed",
            "total_score": state["total_score"],
            "max_score": 100,
            "percentage": state["total_score"],
            "feedback": last_answer.get("feedback", ""),
            "ideal_answer": last_answer.get("ideal_answer", ""),
            "scores": state["scores"],
        }

    # Next question
    current_question = state["questions"][question_number]
    return {
        "status": "in_progress",
        "question_number": question_number + 1,
        "question": current_question["question"],
        "source_file": current_question["source_file"],
        "score_so_far": state["total_score"],
        "last_feedback": last_answer.get("feedback", ""),
        "last_score": last_answer.get("score", 0),
        "ideal_answer": last_answer.get("ideal_answer", ""),
    }


# ── /peek ─────────────────────────────────────────────────────────────────────

@router.get("/peek/{session_id}/{question_index}")
async def peek_answer(session_id: str, question_index: int):
    loop = asyncio.get_event_loop()
    state = await loop.run_in_executor(None, load_session, session_id)
    if not state:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired.",
        )

    if question_index >= len(state["questions"]):
        raise HTTPException(status_code=400, detail="Question not found")

    question = state["questions"][question_index]
    return {
        "code_reference": question["code_reference"],
        "source_file": question["source_file"],
        "warning": "Peeking will reduce your score by 50% for this question",
    }


# ── /health ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def interview_health():
    return {"status": "interview router ok"}