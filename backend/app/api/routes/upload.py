from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.extractor import extract_code_files
from app.core.database import supabase_admin
from app.services.ingestion import ingest_session
from concurrent.futures import ThreadPoolExecutor
import asyncio
import logging
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_ZIP_SIZE = 50 * 1024 * 1024  # 50MB
executor = ThreadPoolExecutor(max_workers=10)


async def upload_file(session_id: str, filename: str, content: str):
    storage_path = f"{session_id}/{filename}"
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            executor,
            lambda: supabase_admin.storage.from_("provify-code").upload(
                path=storage_path,
                file=content.encode("utf-8"),
                file_options={"content-type": "text/plain"}
            )
        )
    except Exception as e:
        logger.error(f"Storage upload failed for {filename}: {e}")


@router.post("/")
async def upload_project(file: UploadFile = File(...)):
    # validate file type
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted")

    # read file
    zip_bytes = await file.read()

    # validate size
    if len(zip_bytes) > MAX_ZIP_SIZE:
        raise HTTPException(status_code=400, detail="ZIP file too large. Max 50MB.")

    # extract code files
    try:
        extracted = extract_code_files(zip_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not extracted:
        raise HTTPException(status_code=400, detail="No valid code files found in ZIP")

    # generate session id
    session_id = str(uuid.uuid4())

    # upload all files concurrently instead of sequentially
    await asyncio.gather(*[
        upload_file(session_id, filename, content)
        for filename, content in extracted.items()
    ])

    logger.info(f"Session {session_id}: uploaded {len(extracted)} files")

    return {
        "session_id": session_id,
        "files_extracted": len(extracted),
        "file_list": list(extracted.keys()),
    }


@router.post("/{session_id}/ingest")
async def ingest(session_id: str):
    try:
        loop = asyncio.get_event_loop()
        chunk_count = await loop.run_in_executor(None, ingest_session, session_id)
        return {
            "session_id": session_id,
            "status": "ingested",
            "chunks_created": chunk_count
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail="Ingestion failed")


@router.get("/health")
async def upload_health():
    return {"status": "upload router ok"}