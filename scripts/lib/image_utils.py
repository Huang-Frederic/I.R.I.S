"""Local pre-filter and Pillow resize for Gemini OCR cost optimization."""

import io
from pathlib import Path

from PIL import Image

# Files smaller than this are almost certainly thumbnails or corrupt
MIN_FILE_SIZE_BYTES = 50 * 1024  # 50 KB

# Pokémon cards are ~63x88mm = aspect ratio 0.72 (portrait) or 1.39 (landscape).
# Allow [0.4, 2.5] to accept slight variations and rotated photos.
MIN_ASPECT_RATIO = 0.4
MAX_ASPECT_RATIO = 2.5

# Allowed extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Gemini OCR works fine on 1024×1024 max — this is the sweet spot for cost.
GEMINI_MAX_DIM = 1024
GEMINI_QUALITY = 85


def should_skip_prefilter(path: Path) -> tuple[bool, str]:
    """Return (skip, reason) — skip if file is obviously not a card photo."""
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        return True, f"unsupported extension {path.suffix}"

    size = path.stat().st_size
    if size < MIN_FILE_SIZE_BYTES:
        return True, f"file size {size}B too small (min {MIN_FILE_SIZE_BYTES}B)"

    try:
        with Image.open(path) as img:
            w, h = img.size
            if w == 0 or h == 0:
                return True, "zero dimension"
            ratio = w / h
            if ratio < MIN_ASPECT_RATIO or ratio > MAX_ASPECT_RATIO:
                return True, f"aspect ratio {ratio:.2f} out of card range [{MIN_ASPECT_RATIO}, {MAX_ASPECT_RATIO}]"
    except Exception as e:
        return True, f"PIL open failed: {e}"

    return False, ""


def resize_for_gemini(path: Path) -> bytes:
    """Open, resize to GEMINI_MAX_DIM max dim (preserving aspect ratio), encode JPEG.

    Returns the resulting JPEG bytes (in-memory, no temp file).
    """
    with Image.open(path) as img:
        # Convert to RGB if needed (PNG with alpha, etc.)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((GEMINI_MAX_DIM, GEMINI_MAX_DIM), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=GEMINI_QUALITY)
        return buf.getvalue()
