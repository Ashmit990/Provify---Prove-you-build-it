from fastapi import APIRouter, HTTPException
from app.core.database import supabase_admin
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/sessions/{user_id}")
async def get_user_sessions(user_id: str):
    """Get all past interview sessions for a user, most recent first"""
    try:
        result = (
            supabase_admin.table("sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {
            "sessions": result.data,
            "total": len(result.data)
        }
    except Exception as e:
        logger.error(f"Failed to fetch sessions: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/session/{session_id}")
async def get_session_detail(session_id: str):
    """Get full detail of one session — including every question, answer, score, ideal answer"""
    try:
        session_result = (
            supabase_admin.table("sessions")
            .select("*")
            .eq("id", session_id)
            .execute()
        )
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        questions_result = (
            supabase_admin.table("questions")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )

        return {
            "session": session_result.data[0],
            "questions": questions_result.data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch session detail: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/{user_id}")
async def get_user_stats(user_id: str):
    """Aggregate stats for a user — total interviews, average score, best score"""
    try:
        result = (
            supabase_admin.table("sessions")
            .select("total_score, status")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .execute()
        )

        sessions = result.data
        total_interviews = len(sessions)

        if total_interviews == 0:
            return {
                "total_interviews": 0,
                "average_score": 0,
                "best_score": 0
            }

        scores = [s["total_score"] for s in sessions]
        average_score = sum(scores) / len(scores)
        best_score = max(scores)

        return {
            "total_interviews": total_interviews,
            "average_score": round(average_score, 1),
            "best_score": best_score
        }
    except Exception as e:
        logger.error(f"Failed to fetch stats: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/health")
async def history_health():
    return {"status": "history router ok"}