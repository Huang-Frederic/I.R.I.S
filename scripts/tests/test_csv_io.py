import csv
from pathlib import Path

import pytest

from scripts.lib.csv_io import CSV_COLUMNS, write_results, read_for_commit, update_row_in_place


def test_write_results_creates_csv_with_all_columns(tmp_path):
    p = tmp_path / "out.csv"
    rows = [
        {
            "filename": "a.jpg", "count": 1, "requested_status": "for_sale",
            "card_name": "Pikachu", "set_code": "sv2a", "set_number": "25",
            "language": "JP", "condition": "NM", "variant": "",
            "confidence": "high", "ocr_error": "",
            "final_status": "", "final_ids": "", "error": "",
        },
    ]
    write_results(p, rows)
    with open(p, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == CSV_COLUMNS
        first = next(reader)
        assert first["filename"] == "a.jpg"
        assert first["count"] == "1"


def test_read_for_commit_skips_status_skip(tmp_path):
    p = tmp_path / "in.csv"
    rows = [
        {**{c: "" for c in CSV_COLUMNS}, "filename": "a.jpg", "count": "1", "requested_status": "for_sale"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "b.jpg", "count": "1", "requested_status": "SKIP"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "c.jpg", "count": "2", "requested_status": "collection"},
    ]
    write_results(p, rows)
    commit_rows = read_for_commit(p)
    assert len(commit_rows) == 2
    assert commit_rows[0]["filename"] == "a.jpg"
    assert commit_rows[1]["filename"] == "c.jpg"


def test_update_row_in_place_writes_final_status(tmp_path):
    p = tmp_path / "in.csv"
    rows = [
        {**{c: "" for c in CSV_COLUMNS}, "filename": "a.jpg", "count": "1", "requested_status": "for_sale"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "b.jpg", "count": "1", "requested_status": "for_sale"},
    ]
    write_results(p, rows)
    update_row_in_place(p, filename="a.jpg", final_status="collection", final_ids="uuid-1", error="")
    # Re-read to verify
    with open(p, encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    a_row = next(r for r in reader if r["filename"] == "a.jpg")
    assert a_row["final_status"] == "collection"
    assert a_row["final_ids"] == "uuid-1"
    b_row = next(r for r in reader if r["filename"] == "b.jpg")
    assert b_row["final_status"] == ""  # untouched
