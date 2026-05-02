import io
from pathlib import Path

import pytest
from PIL import Image

from scripts.lib.image_utils import should_skip_prefilter, resize_for_gemini, MIN_FILE_SIZE_BYTES


def make_image(tmp_path: Path, name: str, size: tuple[int, int], color: str = "red", fmt: str = "JPEG") -> Path:
    p = tmp_path / name
    img = Image.new("RGB", size, color)
    img.save(p, format=fmt, quality=85)
    return p


def test_prefilter_skips_files_below_min_size(tmp_path):
    p = tmp_path / "tiny.jpg"
    p.write_bytes(b"\xff\xd8\xff\xd9")  # 4-byte JPEG marker, way under min
    skip, reason = should_skip_prefilter(p)
    assert skip is True
    assert "size" in reason.lower()


def test_prefilter_skips_aberrant_aspect_ratio(tmp_path):
    # 4000x100 = aspect ratio 40, way out of card range
    p = make_image(tmp_path, "wide.jpg", (4000, 100))
    # Pad the file size to be over MIN_FILE_SIZE_BYTES so the size check passes
    if p.stat().st_size < MIN_FILE_SIZE_BYTES:
        p.write_bytes(p.read_bytes() + b"\x00" * (MIN_FILE_SIZE_BYTES + 100))
    skip, reason = should_skip_prefilter(p)
    assert skip is True
    assert "aspect" in reason.lower()


def test_prefilter_skips_non_image_extension(tmp_path):
    p = tmp_path / "doc.txt"
    p.write_bytes(b"not an image" * 5000)
    skip, reason = should_skip_prefilter(p)
    assert skip is True


def test_prefilter_passes_valid_card_photo(tmp_path):
    # ~card-shaped: 1500x2100 portrait
    p = make_image(tmp_path, "card.jpg", (1500, 2100))
    # Pad the file size to be over MIN_FILE_SIZE_BYTES so the size check passes
    if p.stat().st_size < MIN_FILE_SIZE_BYTES:
        p.write_bytes(p.read_bytes() + b"\x00" * (MIN_FILE_SIZE_BYTES + 100))
    skip, reason = should_skip_prefilter(p)
    assert skip is False
    assert reason == ""


def test_resize_caps_largest_dimension_to_1024(tmp_path):
    # Source is 4000x3000 (16MP)
    p = make_image(tmp_path, "big.jpg", (4000, 3000))
    out_bytes = resize_for_gemini(p)
    img = Image.open(io.BytesIO(out_bytes))
    assert max(img.size) <= 1024
    # Aspect ratio preserved (within 1px rounding)
    assert abs((img.size[0] / img.size[1]) - (4000 / 3000)) < 0.01
