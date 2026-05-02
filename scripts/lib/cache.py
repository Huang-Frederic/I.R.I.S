"""SHA256-based OCR result cache.

Stored as a flat JSON dict: { sha256_hex: { ocr: {...}, scanned_at: iso, filename: str } }.
"""

import hashlib
import json
from pathlib import Path
from typing import Any


def compute_sha256(path: Path) -> str:
    """Stream-hash a file in 64KB chunks to avoid loading the whole image in memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_cache(path: Path) -> dict[str, Any]:
    """Load the cache JSON, or return an empty dict if the file does not exist."""
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path: Path, cache: dict[str, Any]) -> None:
    """Write the cache atomically (write to temp + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def get_cached(cache: dict[str, Any], sha: str) -> dict[str, Any] | None:
    """Return the cached entry for `sha`, or None if not cached."""
    return cache.get(sha)


def set_cached(cache: dict[str, Any], sha: str, entry: dict[str, Any]) -> None:
    """In-place update of the cache. Caller is responsible for save_cache later."""
    cache[sha] = entry
