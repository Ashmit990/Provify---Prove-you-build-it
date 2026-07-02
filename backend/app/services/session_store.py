"""In-memory session store for Provify interview state."""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

SESSION_TTL = 7_200

_store: dict[str, str] = {}


def save_session(session_id: str, state: dict) -> None:
    """Persist interview state in memory for the current process."""
    _store[f"provify:session:{session_id}"] = json.dumps(state, default=str)


def load_session(session_id: str) -> dict | None:
    """Load interview state from memory."""
    raw = _store.get(f"provify:session:{session_id}")
    if raw is None:
        return None
    return json.loads(raw)


def delete_session(session_id: str) -> None:
    """Remove session immediately (called on interview completion)."""
    _store.pop(f"provify:session:{session_id}", None)
