"""Local filesystem storage service.

Handles saving uploaded dataset files to the local `data/datasets/raw`
directory and resolving paths for processed outputs. No cloud storage —
everything lives on disk under `settings.data_root`.
"""
import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".json", ".xlsx", ".parquet"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB safety ceiling for local-only usage


class UnsupportedFileTypeError(ValueError):
    pass


class FileTooLargeError(ValueError):
    pass


def _ensure_dir(path: str) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in stem)
    return stem[:80] or "dataset"


def build_raw_path(dataset_id: str, original_filename: str) -> str:
    """Compute where a dataset's raw file should live on disk."""
    ext = Path(original_filename).suffix.lower()
    raw_dir = _ensure_dir(settings.datasets_raw_dir)
    safe_name = f"{dataset_id}_{_safe_stem(original_filename)}{ext}"
    return str(raw_dir / safe_name)


async def save_upload(dataset_id: str, upload: UploadFile) -> tuple[str, int, str]:
    """Stream an UploadFile to disk in chunks.

    Returns (raw_path, file_size_bytes, format_ext_without_dot).
    Raises UnsupportedFileTypeError / FileTooLargeError on invalid input.
    """
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileTypeError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    raw_path = build_raw_path(dataset_id, upload.filename or "dataset")

    size = 0
    chunk_size = 1024 * 1024  # 1 MB
    try:
        with open(raw_path, "wb") as f:
            while True:
                chunk = await upload.read(chunk_size)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise FileTooLargeError(
                        f"File exceeds max upload size of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
                    )
                f.write(chunk)
    except FileTooLargeError:
        if os.path.exists(raw_path):
            os.remove(raw_path)
        raise
    finally:
        await upload.close()

    return raw_path, size, ext.lstrip(".")


def build_processed_path(dataset_id: str) -> str:
    processed_dir = _ensure_dir(settings.datasets_processed_dir)
    return str(processed_dir / f"{dataset_id}.parquet")


def new_dataset_file_id() -> str:
    return uuid.uuid4().hex[:12]


def delete_file_if_exists(path: str | None) -> None:
    if path and os.path.exists(path):
        os.remove(path)
