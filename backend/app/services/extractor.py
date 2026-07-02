import zipfile
import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    '.py', '.js', '.ts', '.tsx', '.jsx',
    '.html', '.css', '.md', '.txt', '.json',
    '.yaml', '.yml', '.toml', '.env.example'
}

SKIP_FOLDERS = {
    'node_modules', 'venv', '.venv', '__pycache__',
    '.git', '.next', 'dist', 'build', '.env',
    'coverage', '.pytest_cache', '.mypy_cache'
}

MAX_FILE_SIZE = 500 * 1024      # 500KB per file
MAX_TOTAL_SIZE = 5 * 1024 * 1024  # 5MB total extracted


def should_skip(path: str) -> bool:
    """Check if a file path should be skipped"""
    parts = Path(path).parts
    for part in parts:
        if part in SKIP_FOLDERS:
            return True
    return False


def extract_code_files(zip_bytes: bytes) -> dict[str, str]:
    """
    Extract only relevant code files from ZIP bytes.
    Returns dict of {filename: content}
    """
    extracted = {}
    total_size = 0

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for name in zf.namelist():
                # skip folders
                if name.endswith('/'):
                    continue

                # skip unwanted folders
                if should_skip(name):
                    continue

                # check extension
                suffix = Path(name).suffix.lower()
                if suffix not in ALLOWED_EXTENSIONS:
                    continue

                # read file
                try:
                    content_bytes = zf.read(name)
                except Exception:
                    continue

                # skip large files
                if len(content_bytes) > MAX_FILE_SIZE:
                    logger.warning(f"Skipping large file: {name}")
                    continue

                # decode
                try:
                    content = content_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    continue

                # skip empty files
                if not content.strip():
                    continue

                total_size += len(content_bytes)

                # stop if too much total content
                if total_size > MAX_TOTAL_SIZE:
                    logger.warning("Reached max total size — stopping extraction")
                    break

                extracted[name] = content

        logger.info(f"Extracted {len(extracted)} files, {total_size / 1024:.1f}KB total")
        return extracted

    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
    except Exception as e:
        raise ValueError(f"Extraction failed: {e}")