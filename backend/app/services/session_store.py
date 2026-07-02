"""
Redis-backed session store for Provify interview state.

Replaces the in-memory active_sessions dict so session state survives
process restarts and works correctly on multi-instance deployments.

Keys:
  provify:session:{session_id}  → full InterviewState, 2-hour sliding TTL

TTL strategy: sliding (reset on every read/write) so a paused user
doesn't lose their session. Deleted immediately on interview completion.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)

SESSION_TTL = 7_200  # 2 hours in seconds

_redis_client = None


def _get_redis():
    """
    Lazy-init a synchronous Redis client.
    We use the sync client because all our callers run inside
    asyncio.run_in_executor — keeping everything in one thread-pool
    avoids async-in-sync nesting issues on Python 3.14.
    """
    global _redis_client
    if _redis_client is None:
        try:
            redis_url = (settings.REDIS_URL or "").strip()
            if not redis_url:
                raise ValueError("REDIS_URL is empty")

            import redis as redislib
            _redis_client = redislib.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            _redis_client.ping()
            logger.info("✅ Redis connected at %s", redis_url)
        except Exception as exc:
            if settings.APP_ENV == "production":
                logger.error("❌ Redis connection failed in production: %s", exc)
                raise RuntimeError(
                    f"Redis is required in production but could not connect to {settings.REDIS_URL}"
                ) from exc

            logger.warning(
                "⚠️  Redis unavailable (%s) — falling back to in-memory store. "
                "Session state will NOT survive restarts.",
                exc,
            )
            _redis_client = _InMemoryFallback()
    return _redis_client


# ── Fallback (local dev without Redis) ───────────────────────────────────────

class _InMemoryFallback:
    """Mimics the subset of redis.Redis we use. Not for production."""

    def __init__(self):
        self._store: dict[str, str] = {}

    def ping(self):
        return True

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    def getex(self, key: str, ex: int | None = None) -> str | None:
        return self._store.get(key)

    def delete(self, *keys: str) -> None:
        for k in keys:
            self._store.pop(k, None)


# ── Public API ────────────────────────────────────────────────────────────────

def save_session(session_id: str, state: dict) -> None:
    """Persist interview state; resets the sliding TTL."""
    r = _get_redis()
    r.set(f"provify:session:{session_id}", json.dumps(state, default=str), ex=SESSION_TTL)


def load_session(session_id: str) -> dict | None:
    """Load interview state and extend the sliding TTL. Returns None if expired/not found."""
    r = _get_redis()
    raw = r.getex(f"provify:session:{session_id}", ex=SESSION_TTL)
    if raw is None:
        return None
    return json.loads(raw)


def delete_session(session_id: str) -> None:
    """Remove session immediately (called on interview completion)."""
    r = _get_redis()
    r.delete(f"provify:session:{session_id}")
