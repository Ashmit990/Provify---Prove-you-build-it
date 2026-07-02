# ── Stage 1: Install Python dependencies ─────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Pre-download the embedding model ─────────────────
# Baked into the image so production cold starts never hit HuggingFace.
FROM python:3.12-slim AS model-downloader

COPY --from=builder /install /usr/local

RUN python -c "\
from langchain_community.embeddings import HuggingFaceEmbeddings; \
print('Downloading sentence-transformers/all-MiniLM-L6-v2...'); \
HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2'); \
print('Model cached.')"

# ── Stage 3: Final lean runtime image ────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy pre-warmed HuggingFace model cache
COPY --from=model-downloader /root/.cache/huggingface /root/.cache/huggingface

# Application code (added last to maximise Docker layer cache reuse)
COPY ./app ./app

# Persistent volume mount point for ChromaDB
# On Render: attach a disk at /data/chroma in the Render dashboard
RUN mkdir -p /data/chroma

ENV CHROMA_BASE_DIR=/data/chroma \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
