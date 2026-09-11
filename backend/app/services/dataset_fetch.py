"""Downloads a dataset from a Kaggle or GitHub URL, replacing manual file
upload entirely — the API now only ever accepts a URL (see
api/datasets.py::submit_dataset_url).

Supported URL shapes:
- Kaggle dataset page:  https://www.kaggle.com/datasets/<owner>/<slug>
- Kaggle competition:   https://www.kaggle.com/competitions/<slug>
- Kaggle dataset ref:   <owner>/<slug>              (shorthand, no URL)
- GitHub raw/blob file: https://github.com/<owner>/<repo>/blob/<branch>/<path>.csv
                        https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>.csv

Kaggle downloads require `~/.kaggle/kaggle.json` (or KAGGLE_USERNAME /
KAGGLE_KEY env vars) — see DATABASE_AND_DATASETS.md for setup.
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests

from app.config import settings

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".json", ".xlsx", ".parquet"}


class DatasetFetchError(ValueError):
    pass


def _ensure_dir(path: str) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def classify_url(url: str) -> str:
    """Returns 'kaggle_dataset' | 'kaggle_competition' | 'github' | 'kaggle_ref'."""
    if re.fullmatch(r"[\w.-]+/[\w.-]+", url.strip()):
        return "kaggle_ref"
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "kaggle.com" in host:
        if "/competitions/" in parsed.path:
            return "kaggle_competition"
        if "/datasets/" in parsed.path:
            return "kaggle_dataset"
        raise DatasetFetchError(f"Unrecognized Kaggle URL shape: {url}")
    if "github.com" in host or "raw.githubusercontent.com" in host:
        return "github"
    raise DatasetFetchError(
        f"Unsupported host '{host}'. Only kaggle.com and github.com URLs are accepted."
    )


def _kaggle_ref_from_url(url: str, kind: str) -> str:
    if kind == "kaggle_ref":
        return url.strip()
    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    # /datasets/<owner>/<slug>[...]  or  /competitions/<slug>
    if kind == "kaggle_dataset":
        idx = parts.index("datasets")
        return f"{parts[idx + 1]}/{parts[idx + 2]}"
    if kind == "kaggle_competition":
        idx = parts.index("competitions")
        return parts[idx + 1]
    raise DatasetFetchError(f"Cannot parse Kaggle ref from {url}")


def _github_raw_url(url: str) -> str:
    if "raw.githubusercontent.com" in url:
        return url
    # Convert a /blob/ URL to the raw equivalent.
    return url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")


def _pick_primary_file(extract_dir: Path) -> Path:
    """When a Kaggle download is a zip of many files, pick the largest
    supported tabular file — usually the main dataset."""
    candidates = [
        p for p in extract_dir.rglob("*") if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS
    ]
    if not candidates:
        raise DatasetFetchError("Downloaded archive contained no supported tabular file")
    return max(candidates, key=lambda p: p.stat().st_size)


def fetch_dataset(url: str, dataset_id: str) -> tuple[str, int, str, str]:
    """Downloads a dataset and returns (raw_path, size_bytes, format_ext, resolved_ref).

    Raises DatasetFetchError on anything not cleanly resolvable.
    """
    kind = classify_url(url)
    raw_dir = _ensure_dir(settings.datasets_raw_dir)
    dest_dir = raw_dir / dataset_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    if kind in ("kaggle_dataset", "kaggle_competition", "kaggle_ref"):
        try:
            from kaggle.api.kaggle_api_extended import KaggleApi
        except Exception as exc:  # kaggle.json missing/invalid raises here too
            raise DatasetFetchError(
                "Kaggle API not configured. Place your API token at "
                "~/.kaggle/kaggle.json (see DATABASE_AND_DATASETS.md)."
            ) from exc

        ref = _kaggle_ref_from_url(url, kind)
        api = KaggleApi()
        api.authenticate()

        download_dir = dest_dir / "_kaggle_download"
        download_dir.mkdir(parents=True, exist_ok=True)
        try:
            if kind == "kaggle_competition":
                api.competition_download_files(ref, path=str(download_dir), quiet=True)
            else:
                api.dataset_download_files(ref, path=str(download_dir), quiet=True, unzip=False)
        except Exception as exc:
            raise DatasetFetchError(f"Kaggle download failed for '{ref}': {exc}") from exc

        zips = list(download_dir.glob("*.zip"))
        if zips:
            with zipfile.ZipFile(zips[0]) as zf:
                zf.extractall(download_dir)
        primary = _pick_primary_file(download_dir)
        final_path = dest_dir / primary.name
        final_path.write_bytes(primary.read_bytes())
        size = final_path.stat().st_size
        return str(final_path), size, final_path.suffix.lstrip(".").lower(), ref

    if kind == "github":
        raw_url = _github_raw_url(url)
        filename = raw_url.rsplit("/", 1)[-1]
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise DatasetFetchError(
                f"GitHub URL does not point at a supported file type ({ext}). "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )
        try:
            resp = requests.get(raw_url, timeout=60, stream=True)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise DatasetFetchError(f"Failed to download {raw_url}: {exc}") from exc

        final_path = dest_dir / filename
        size = 0
        with open(final_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                size += len(chunk)
        return str(final_path), size, ext.lstrip("."), raw_url

    raise DatasetFetchError(f"Unhandled URL kind: {kind}")
