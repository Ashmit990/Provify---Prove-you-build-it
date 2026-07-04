import os
import logging
import resource
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_core.documents import Document
from app.core.database import supabase_admin

logger = logging.getLogger(__name__)


def _log_memory(label: str) -> None:
    """
    Log this process's peak resident memory so far (RSS high-water mark).
    ru_maxrss is in KB on Linux (Render's containers) — convert to MB.
    Temporary diagnostic to pinpoint exactly which step causes the OOM.
    """
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    logger.info(f"📊 MEMORY [{label}]: peak RSS so far = {peak_mb:.1f} MB")

_embedding_model = None


def get_embeddings():
    global _embedding_model
    if _embedding_model is None:
        cache_dir = os.environ.get("FASTEMBED_CACHE_DIR") or os.path.join(
            os.path.expanduser("~"), ".cache", "fastembed"
        )
        os.makedirs(cache_dir, exist_ok=True)
        logger.info("Initialising FastEmbed embeddings from %s...", cache_dir)
        _embedding_model = FastEmbedEmbeddings(
            model_name="BAAI/bge-small-en-v1.5",
            cache_dir=cache_dir,
        )
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
    fraction of the fixed memory overhead, which is what was pushing
    Render's 512MB free-tier instance into OOM restarts.

    Exposes the same shape LangChain retrieval code commonly expects:
    similarity_search(), similarity_search_with_score(), and as_retriever().
    """

    # Embedding a few hundred chunks in a single embed_documents() call holds
    # every input text, every output vector, and FastEmbed's internal ONNX
    # batch buffers in memory all at once. On a 512MB instance that spike is
    # enough to OOM even after removing Chroma. Batching keeps only one small
    # slice of chunks (and its buffers) alive at a time.
    EMBED_BATCH_SIZE = 16

    def __init__(self, documents: list[Document], embeddings):
        _log_memory("vectorstore init: start")
        self._embeddings = embeddings
        self._documents: list[Document] = documents
        texts = [doc.page_content for doc in documents]

        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.EMBED_BATCH_SIZE):
            batch = texts[start:start + self.EMBED_BATCH_SIZE]
            vectors.extend(embeddings.embed_documents(batch))
            end = min(start + self.EMBED_BATCH_SIZE, len(texts))
            _log_memory(f"after embedding batch {start}-{end} of {len(texts)}")

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
