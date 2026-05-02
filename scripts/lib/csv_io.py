"""CSV read / write / in-place update for the OCR results file.

Mode 1 writes a fresh CSV. Mode 2 reads it (skipping status=SKIP rows),
then updates rows in-place with the commit outcome (final_status, final_ids,
error) so the user can re-run mode 2 and resume from a partial state.
"""

import csv
from pathlib import Path
from typing import Any

CSV_COLUMNS = [
    "filename",
    "count",
    "requested_status",
    "card_name",
    "set_code",
    "set_number",
    "language",
    "condition",
    "variant",
    "confidence",
    "ocr_error",
    "final_status",
    "final_ids",
    "error",
]


def write_results(path: Path, rows: list[dict[str, Any]]) -> None:
    """Write the result CSV. Each row is a dict with the keys in CSV_COLUMNS;
    missing keys default to empty string."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            normalized = {c: str(row.get(c, "") or "") for c in CSV_COLUMNS}
            writer.writerow(normalized)


def read_for_commit(path: Path) -> list[dict[str, str]]:
    """Read the CSV and return rows EXCLUDING those marked SKIP. Used by mode 2."""
    rows: list[dict[str, str]] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("requested_status") or "").strip().upper() == "SKIP":
                continue
            rows.append(row)
    return rows


def update_row_in_place(
    path: Path,
    filename: str,
    final_status: str = "",
    final_ids: str = "",
    error: str = "",
) -> None:
    """Read the CSV, update the row matching `filename`, write back. O(N) per call
    but our N is small (< 1000) and the user runs commit once."""
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    for row in rows:
        if row.get("filename") == filename:
            row["final_status"] = final_status
            row["final_ids"] = final_ids
            row["error"] = error
            break
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
