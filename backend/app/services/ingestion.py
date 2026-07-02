import os
import shutil
import logging
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceInferenceAPIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

from app.core.database import supabase_admin

logger = logging.getLogger(__name__)

CHROMA_BASE_DIR = "/tmp/provify_chroma"

_embedding_model = None


def get_embeddings():
    global _embedding_model
    if _embedding_model is None:
        hf_token = os.environ.get("HF_TOKEN", "")
        logger.info("Initialising HuggingFace Inference API embeddings...")
        _embedding_model = HuggingFaceInferenceAPIEmbeddings(
            api_key=hf_token,
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
    return _embedding_model


def list_all_files(prefix: str) -> list[str]:
    """Recursively list every file path under a storage prefix"""
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
    """Download all extracted code files for a session from Supabase Storage"""
    paths = list_all_files(session_id)
    contents = {}
    for path in paths:
        raw = supabase_admin.storage.from_("provify-code").download(path)
        try:
            relative_name = path[len(session_id) + 1:]
            text = raw.decode("utf-8")
            # ✅ skip empty or whitespace-only files
            if text.strip():
                contents[relative_name] = text
        except UnicodeDecodeError:
            continue
    logger.info(f"Fetched {len(contents)} non-empty files for session {session_id}")
    return contents


def chunk_files(files: dict[str, str]) -> list[Document]:
    """Split code files into chunks, tagging each chunk with its source file"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\nclass ", "\ndef ", "\nfunction ", "\n\n", "\n", " "]
    )
    documents = []
    for filename, content in files.items():
        chunks = splitter.split_text(content)
        for i, chunk in enumerate(chunks):
            # ✅ skip empty or whitespace-only chunks
            if chunk.strip():
                documents.append(Document(
                    page_content=chunk,
                    metadata={"source": filename, "chunk_index": i}
                ))
    logger.info(f"Produced {len(documents)} non-empty chunks from {len(files)} files")
    return documents


def ingest_session(session_id: str) -> int:
    """
    Per-session RAG pipeline:
    fetch code -> chunk -> embed via HF API -> store in a fresh Chroma collection
    """
    files = fetch_session_files(session_id)
    if not files:
        raise ValueError(f"No files found for session {session_id}")

    documents = chunk_files(files)
    if not documents:
        raise ValueError(f"No valid chunks produced for session {session_id}")

    persist_dir = f"{CHROMA_BASE_DIR}/{session_id}"
    os.makedirs(persist_dir, exist_ok=True)

    Chroma.from_documents(
        documents=documents,
        embedding=get_embeddings(),
        collection_name=session_id,
        persist_directory=persist_dir
    )

    logger.info(f"✅ Ingested {len(documents)} chunks for session {session_id}")
    return len(documents)


def get_session_vectorstore(session_id: str) -> Chroma:
    """Load an existing per-session Chroma collection"""
    persist_dir = f"{CHROMA_BASE_DIR}/{session_id}"
    return Chroma(
        collection_name=session_id,
        embedding_function=get_embeddings(),
        persist_directory=persist_dir
    )


def delete_session_vectorstore(session_id: str):
    """Delete the per-session ChromaDB collection after the interview completes"""
    persist_dir = f"{CHROMA_BASE_DIR}/{session_id}"
    if os.path.exists(persist_dir):
        shutil.rmtree(persist_dir)
        logger.info(f"🗑️ Deleted vectorstore for session {session_id}")