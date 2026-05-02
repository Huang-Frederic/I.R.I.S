import json
from pathlib import Path

import pytest

from scripts.lib.cache import compute_sha256, load_cache, save_cache, get_cached, set_cached


def test_compute_sha256_stable_for_same_content(tmp_path):
    p1 = tmp_path / "a.bin"
    p2 = tmp_path / "b.bin"
    p1.write_bytes(b"hello world")
    p2.write_bytes(b"hello world")
    assert compute_sha256(p1) == compute_sha256(p2)


def test_compute_sha256_differs_for_different_content(tmp_path):
    p1 = tmp_path / "a.bin"
    p2 = tmp_path / "b.bin"
    p1.write_bytes(b"hello world")
    p2.write_bytes(b"hello there")
    assert compute_sha256(p1) != compute_sha256(p2)


def test_load_cache_returns_empty_dict_when_file_missing(tmp_path):
    cache_path = tmp_path / "missing.json"
    assert load_cache(cache_path) == {}


def test_set_then_get_roundtrip(tmp_path):
    cache_path = tmp_path / "c.json"
    cache = load_cache(cache_path)
    set_cached(cache, "abc123", {"card_name": "Pikachu", "set_code": "sv2a"})
    save_cache(cache_path, cache)
    reloaded = load_cache(cache_path)
    assert get_cached(reloaded, "abc123")["card_name"] == "Pikachu"
    assert get_cached(reloaded, "missing") is None
