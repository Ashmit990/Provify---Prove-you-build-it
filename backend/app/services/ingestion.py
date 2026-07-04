import os
import logging
import resource
import httpx
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from app.core.database import supabase_admin
from app.core.config import settings

logger = logging.getLogger(__name__)


def _log_memory(label: str) -> None:
    """
    Log this process's peak resident memory so far (RSS high-water mark).
    ru_maxrss is in KB on Linux (Render's containers) — convert to MB.
    """
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    logger.info(f"📊 MEMORY [{label}]: peak RSS so far = {peak_mb:.1f} MB")


JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings"
JINA_MODEL = "jina-embeddings-v3"
JINA_DIMENSIONS = 512  # smaller vectors = less memory in our own matrix too


class JinaEmbeddings:
    """
    Calls Jina AI's hosted embeddings API instead of running a model
    in-process. Removes ONNX Runtime, its arena allocation, and the whole
    local-model memory footprint from our process entirely — replaced
    with a plain HTTP call. This is the deliberate trade we made after
    confirming (via direct memory instrumentation) that local ONNX
    inference doesn't fit comfortably in a 512MB container: we now pay
    with a network round-trip instead of RAM.
    """

    # Chunking requests, not for memory (there's no local model anymore),
    # but to keep each HTTP payload/response reasonably sized and avoid
    # hitting Jina's per-request limits on a single call for large projects.
    REQUEST_BATCH_SIZE = 64

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("JINA_API_KEY is not set")
        self._client = httpx.Client(
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            timeout=30.0,
        )

    def _embed(self, texts: list[str], task: str) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.REQUEST_BATCH_SIZE):
            batch = texts[start:start + self.REQUEST_BATCH_SIZE]
            response = self._client.post(
                JINA_EMBEDDINGS_URL,
                json={
                    "model": JINA_MODEL,
                    "task": task,
                    "dimensions": JINA_DIMENSIONS,
                    "input": batch,
                },
            )
            response.raise_for_status()
            data = response.json()["data"]
            vectors.extend(item["embedding"] for item in data)
        return vectors

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, task="retrieval.passage")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], task="retrieval.query")[0]


_embedding_model = None


def get_embeddings():
    global _embedding_model
    if _embedding_model is None:
        logger.info("Initialising Jina embeddings client (%s)...", JINA_MODEL)
        _embedding_model = JinaEmbeddings(api_key=settings.JINA_API_KEY)
    return _embedding_model


class SessionVectorStore:
    """
    A minimal, dependency-free replacement for Chroma, purpose-built for
    Provify's actual access pattern: a few hundred short-lived text chunks
    held in memory for the life of one interview session, then discarded.

    ChromaDB is a full vector *database* (ONNX runtime, HNSW indexing,
    DuckDB/SQLite persistence) — machinery designed for large, persistent,
    concurrent collections. We never need any of that: no persistence, no
    concurrency across sessions, no scale beyond a few hundred vectors.
    A plain list + NumPy cosine similarity does the identical job with a
    fraction of the fixed memory overhead.

    Embeddings themselves come from Jina's hosted API (JinaEmbeddings)
    rather than a locally-loaded ONNX model — direct memory instrumentation
    showed local ONNX inference has a large, growing per-call memory cost
    that doesn't fit a 512MB container even in small batches. Offloading
    inference to an API call removes that cost entirely from this process.

    Exposes the same shape LangChain retrieval code commonly expects:
    similarity_search(), similarity_search_with_score(), and as_retriever().
    """

    def __init__(self, documents: list[Document], embeddings):
        _log_memory("vectorstore init: start")
        self._embeddings = embeddings
        self._documents: list[Document] = documents
        texts = [doc.page_content for doc in documents]

        # No local model, no ONNX arena — embedding now happens via HTTP,
        # so JinaEmbeddings.embed_documents() handles its own request
        # batching internally. One call here is enough.
        vectors = embeddings.embed_documents(texts)
        _log_memory("after embed_documents (Jina API)")

        # Normalize once at ingest time so similarity search is a plain dot product
        self._matrix = self._normalize(np.array(vectors, dtype=np.float32))
        _log_memory("vectorstore init: done")

    @staticmethod
    def _normalize(matrix: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        return matrix / norms

    def _scored_search(self, query: str, k: int) -> list[tuple[Document, float]]:
        query_vec = np.array(self._embeddings.embed_query(query), dtype=np.float32)
        query_vec = query_vec / (np.linalg.norm(query_vec) or 1e-10)
        # Cosine similarity, since both sides are normalized: plain dot product
        scores = self._matrix @ query_vec
        top_k_idx = np.argsort(-scores)[:k]
        return [(self._documents[i], float(scores[i])) for i in top_k_idx]

    def similarity_search(self, query: str, k: int = 4) -> list[Document]:
        return [doc for doc, _ in self._scored_search(query, k)]

    def similarity_search_with_score(self, query: str, k: int = 4) -> list[tuple[Document, float]]:
        return self._scored_search(query, k)

    def as_retriever(self, search_kwargs: dict | None = None):
        k = (search_kwargs or {}).get("k", 4)
        return _SessionRetriever(self, k)


class _SessionRetriever:
    """Thin wrapper so `.as_retriever()` callers can use .invoke() / .get_relevant_documents()."""

    def __init__(self, store: SessionVectorStore, k: int):
        self._store = store
        self._k = k

    def invoke(self, query: str, *args, **kwargs) -> list[Document]:
        return self._store.similarity_search(query, k=self._k)

    def get_relevant_documents(self, query: str) -> list[Document]:
        return self._store.similarity_search(query, k=self._k)


# In-memory store: session_id → SessionVectorStore
_session_stores: dict[str, SessionVectorStore] = {}


def list_all_files(prefix: str) -> list[str]:
    all_paths = []
    entries = supabase_admin.storage.from_("provify-code").list(prefix)
    for entry in entries:
        full_path = f"{prefix}/{entry['name']}"
        is_folder = entry.get("id") is None and entry.get("metadata") is None
        if is_folder:
            all_paths.extend(list_all_files(full_path))
        else:
            all_paths.append(full_path)
    return all_paths


def fetch_session_files(session_id: str) -> dict[str, str]:
    paths = list_all_files(session_id)
    contents = {}
    for path in paths:
        raw = supabase_admin.storage.from_("provify-code").download(path)
        try:
            relative_name = path[len(session_id) + 1:]
            text = raw.decode("utf-8")
            if text.strip():
                contents[relative_name] = text
        except UnicodeDecodeError:
            continue
    logger.info(f"Fetched {len(contents)} non-empty files for session {session_id}")
    return contents


def chunk_files(files: dict[str, str]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\nclass ", "\ndef ", "\nfunction ", "\n\n", "\n", " "]
    )
    documents = []
    for filename, content in files.items():
        chunks = splitter.split_text(content)
        for i, chunk in enumerate(chunks):
            if chunk.strip():
                documents.append(Document(
                    page_content=chunk,
                    metadata={"source": filename, "chunk_index": i}
                ))
    logger.info(f"Produced {len(documents)} non-empty chunks from {len(files)} files")
    return documents


def ingest_session(session_id: str) -> int:
    """
    Build an IN-MEMORY vector store for this session.
    No Chroma, no persistence — survives only for the life of this process.
    """
    _log_memory("ingest_session: start")
    files = fetch_session_files(session_id)
    if not files:
        raise ValueError(f"No files found for session {session_id}")
    _log_memory("after fetch_session_files")

    documents = chunk_files(files)
    if not documents:
        raise ValueError(f"No valid chunks produced for session {session_id}")
    _log_memory("after chunk_files")

    vectorstore = SessionVectorStore(documents=documents, embeddings=get_embeddings())

    _session_stores[session_id] = vectorstore
    logger.info(f"✅ Ingested {len(documents)} chunks for session {session_id} (in-memory)")
    return len(documents)


def get_session_vectorstore(session_id: str) -> SessionVectorStore:
    """Return the in-memory vectorstore for this session."""
    store = _session_stores.get(session_id)
    if not store:
        raise ValueError(
            f"No vectorstore found for session {session_id}. "
            f"Was ingest called? Active sessions: {list(_session_stores.keys())}"
        )
    return store


def delete_session_vectorstore(session_id: str):
    """Remove the in-memory vectorstore after interview completes."""
    if session_id in _session_stores:
        del _session_stores[session_id]
        logger.info(f"🗑️ Deleted in-memory vectorstore for session {session_id}")
