import httpx

# Monkey-patch httpx to disable HTTP/2 (fixes "pop from an empty deque" bug in Python 3.14)
_original_client_init = httpx.Client.__init__
def _patched_client_init(self, *args, **kwargs):
    kwargs["http2"] = False
    _original_client_init(self, *args, **kwargs)
httpx.Client.__init__ = _patched_client_init

_original_async_client_init = httpx.AsyncClient.__init__
def _patched_async_client_init(self, *args, **kwargs):
    kwargs["http2"] = False
    _original_async_client_init(self, *args, **kwargs)
httpx.AsyncClient.__init__ = _patched_async_client_init

from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def get_supabase() -> Client:
    """Get Supabase client for public operations (uses anon key)"""
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_KEY
    )

def get_supabase_admin() -> Client:
    """Get Supabase admin client (uses service role key — server only)"""
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY
    )

# singleton instances
supabase: Client = get_supabase()
supabase_admin: Client = get_supabase_admin()