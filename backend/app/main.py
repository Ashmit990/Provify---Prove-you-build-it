from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from app.core.config import settings
from app.core.logging import setup_logging
from app.api.routes import auth, upload, interview, history

# ── LIFESPAN ─────────────────────────────────────────────
# Runs on startup and shutdown — production standard
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logging.info(f"🚀 Provify starting in {settings.APP_ENV} mode")
    
    # test supabase
    try:
        from app.core.database import supabase
        supabase.table("sessions").select("count").execute()
        logging.info("✅ Supabase connected")
    except Exception as e:
        logging.error(f"❌ Supabase failed: {e}")
    
    # setup langsmith
    try:
        os.environ["LANGCHAIN_TRACING_V2"] = settings.LANGCHAIN_TRACING_V2
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
        logging.info("✅ LangSmith tracing enabled")
    except Exception as e:
        logging.error(f"❌ LangSmith failed: {e}")

    # warm embeddings once during startup to reduce first-request latency
    try:
        from app.services.ingestion import get_embeddings
        get_embeddings()
        logging.info("✅ Embedding model warmed up")
    except Exception as e:
        logging.error(f"❌ Embedding warmup failed: {e}")
    
    yield
    
    logging.info("👋 Provify shutting down")

# ── APP SETUP ─────────────────────────────────────────────
app = FastAPI(
    title="Provify API",
    description="AI that reads your code and interviews you on it",
    version="1.0.0",
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://provify-prove-you-build-it.vercel.app",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── ROUTES ────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(upload.router,    prefix="/api/upload",    tags=["Upload"])
app.include_router(interview.router, prefix="/api/interview", tags=["Interview"])
app.include_router(history.router,   prefix="/api/history",   tags=["History"])

# ── HEALTH ────────────────────────────────────────────────
@app.get("/")
async def health():
    return {
        "status": "ok",
        "app": "Provify",
        "version": "1.0.0",
        "environment": settings.APP_ENV
    }