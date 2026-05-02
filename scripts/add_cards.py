#!/usr/bin/env python3
"""IRIS bulk import script.

Mode 1 (default):
    python add_cards.py /path/to/photos/

Reads all images from the folder, applies pre-filter + SHA256 cache,
resizes to 1024×1024 max, submits to Gemini Batch API, polls until done,
calls /api/enrich for each result, writes add_cards_results.csv.

Mode 2 (commit):
    python add_cards.py /path/to/photos/ --commit add_cards_results.csv

(Implemented in a follow-up task.)
"""

import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

from scripts.lib.cache import compute_sha256, load_cache, save_cache, get_cached, set_cached
from scripts.lib.image_utils import should_skip_prefilter, resize_for_gemini, IMAGE_EXTENSIONS
from scripts.lib.gemini_batch import (
    build_request_payload,
    submit_batch,
    poll_until_done,
    parse_batch_response,
)
from scripts.lib.csv_io import write_results, CSV_COLUMNS
from scripts.lib.iris_client import IrisClient, IrisConfig


CACHE_PATH = Path(".cache/ocr-cache.json")
DEFAULT_CSV = Path("add_cards_results.csv")


def collect_images(folder: Path) -> list[Path]:
    """Return all image files in the folder (non-recursive), sorted by name."""
    if not folder.is_dir():
        raise FileNotFoundError(f"Not a directory: {folder}")
    files = sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    return files


def mode_one(folder: Path, output_csv: Path, api_key: str, iris: IrisClient) -> None:
    """Mode 1: OCR + enrich + write CSV."""
    images = collect_images(folder)
    print(f"[mode 1] Found {len(images)} image(s) in {folder}")

    cache = load_cache(CACHE_PATH)
    rows = []  # CSV rows (one per image, even skipped ones — for transparency)
    to_ocr = []  # (sha, image_bytes_resized, original_path)

    # Pass 1: pre-filter, hash, cache check, resize
    for path in images:
        skip, reason = should_skip_prefilter(path)
        if skip:
            rows.append({
                "filename": path.name, "count": 1, "requested_status": "SKIP",
                "ocr_error": reason,
            })
            print(f"  ⏭  {path.name}: {reason}")
            continue

        sha = compute_sha256(path)
        cached = get_cached(cache, sha)
        if cached:
            ocr = cached["ocr"]
            rows.append(_row_from_ocr(path, ocr, source="cache"))
            print(f"  ✓ {path.name}: cache hit")
            continue

        try:
            resized = resize_for_gemini(path)
            to_ocr.append((sha, resized, path))
        except Exception as e:
            rows.append({
                "filename": path.name, "count": 1, "requested_status": "SKIP",
                "ocr_error": f"resize failed: {e}",
            })
            print(f"  ⏭  {path.name}: resize failed ({e})")

    # Pass 2: submit batch + poll if anything new to OCR
    if to_ocr:
        print(f"[mode 1] Submitting {len(to_ocr)} image(s) to Gemini Batch API…")
        payload = [
            build_request_payload(image_bytes=img, request_id=sha)
            for sha, img, _ in to_ocr
        ]
        op_name = submit_batch(api_key, payload)
        print(f"[mode 1] Operation: {op_name}. Polling…")
        raw = poll_until_done(api_key, op_name)
        results = parse_batch_response(raw)
        print(f"[mode 1] Got {len(results)} response(s).")

        # Index by request_id (= sha) for matching back to paths
        result_by_sha = {r.request_id: r for r in results}
        for sha, _img, path in to_ocr:
            r = result_by_sha.get(sha)
            if r is None or r.ocr is None:
                rows.append({
                    "filename": path.name, "count": 1, "requested_status": "SKIP",
                    "ocr_error": (r.error if r else "no response from batch"),
                })
                continue
            set_cached(cache, sha, {"ocr": r.ocr, "filename": path.name})
            rows.append(_row_from_ocr(path, r.ocr, source="gemini"))
            print(f"  ✓ {path.name}: {r.ocr.get('card_name', '?')}")

        save_cache(CACHE_PATH, cache)

    # Pass 3: enrich each row that has OCR data via /api/enrich
    print(f"[mode 1] Enriching via /api/enrich…")
    iris.login()
    for row in rows:
        if row.get("requested_status") == "SKIP":
            continue
        ocr_for_enrich = {
            "text": row.get("card_name", ""),
            "setCode": row.get("set_code", ""),
            "localId": row.get("set_number", ""),
            "language": row.get("language", "JP"),
        }
        try:
            enrich = iris.enrich(ocr_for_enrich)
            best = enrich.get("bestMatch")
            if best:
                # Override with enriched values where available
                row["card_name"] = best.get("card_name") or row["card_name"]
                row["set_code"] = best.get("set_code") or row["set_code"]
                row["set_number"] = best.get("set_number") or row["set_number"]
            else:
                row["ocr_error"] = (row.get("ocr_error") or "") + "; no catalog match"
        except Exception as e:
            row["ocr_error"] = (row.get("ocr_error") or "") + f"; enrich failed: {e}"

    write_results(output_csv, rows)
    print(f"\n[mode 1] Wrote {len(rows)} row(s) to {output_csv}")
    print(f"[mode 1] STOP. Review the CSV, edit if needed, then run with --commit {output_csv}")


def _row_from_ocr(path: Path, ocr: dict, source: str) -> dict:
    """Build a CSV row from a Gemini OCR result."""
    return {
        "filename": path.name,
        "count": 1,
        "requested_status": "for_sale",
        "card_name": ocr.get("card_name", ""),
        "set_code": ocr.get("set_code", ""),
        "set_number": ocr.get("set_number", ""),
        "language": ocr.get("language", "JP"),
        "condition": "NM",
        "variant": "",
        "confidence": ocr.get("confidence", ""),
        "ocr_error": "",
    }


def mode_two(folder: Path, csv_path: Path, iris: IrisClient) -> int:
    """Mode 2: read CSV, commit each row via POST /api/cards, prompt on fallback."""
    from scripts.lib.csv_io import read_for_commit, update_row_in_place

    rows = read_for_commit(csv_path)
    print(f"[mode 2] Committing {len(rows)} row(s) from {csv_path}")

    iris.login()
    accept_all = False  # set to True if the user presses 'A' once
    aborted = False

    for i, row in enumerate(rows, start=1):
        filename = row["filename"]
        count = int(row.get("count") or "1")
        photo_path = folder / filename
        if not photo_path.exists():
            print(f"  ✗ {filename}: photo missing in {folder}")
            update_row_in_place(csv_path, filename=filename, error="photo file missing")
            continue

        final_ids: list[str] = []
        final_statuses: list[str] = []
        last_error = ""

        for copy_idx in range(count):
            try:
                resp = iris.create_card(
                    {
                        "card_name": row["card_name"],
                        "pokemon_name": row.get("card_name", ""),  # fallback
                        "pokemon_number": "",
                        "set_code": row["set_code"],
                        "set_number": row["set_number"],
                        "language": row["language"],
                        "rarity": "OTHER",  # enrich result already wrote this if known
                        "condition": row.get("condition", "NM"),
                        "variant": row.get("variant", ""),
                        "status": row.get("requested_status", "for_sale"),
                    },
                    photo_path,
                )

                if resp.get("error"):
                    last_error = resp["error"]
                    print(f"  ✗ [{i}/{len(rows)}] {filename} copy {copy_idx+1}/{count}: {last_error}")
                    break  # stop trying more copies of this card

                card = resp.get("card", {})
                final_ids.append(card.get("id", ""))
                fallback = resp.get("fallback")
                if fallback == "for_sale_to_collection":
                    final_statuses.append("collection")
                    print(f"\n  ⚠  [{i}/{len(rows)}] {filename}: cette carte est déjà en ligne, ajoutée à Stock.")
                    if not accept_all:
                        choice = input("    Y=continue, N=abort, A=accept all remaining: ").strip().upper()
                        if choice == "A":
                            accept_all = True
                        elif choice == "N":
                            aborted = True
                            break
                        # else assume Y → continue
                else:
                    final_statuses.append(card.get("status", row.get("requested_status", "")))
            except Exception as e:
                last_error = str(e)
                print(f"  ✗ [{i}/{len(rows)}] {filename} copy {copy_idx+1}/{count}: {last_error}")
                break

        update_row_in_place(
            csv_path,
            filename=filename,
            final_status=" + ".join(final_statuses) if final_statuses else "",
            final_ids=", ".join(final_ids),
            error=last_error,
        )
        if aborted:
            print(f"\n[mode 2] User aborted. {i} of {len(rows)} row(s) processed.")
            return 1

    print(f"\n[mode 2] Done. {len(rows)} row(s) processed. CSV updated in-place.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="IRIS bulk import script")
    parser.add_argument("folder", type=Path, help="Folder containing card photos")
    parser.add_argument("--commit", type=Path, default=None, help="Commit a previously-generated CSV")
    parser.add_argument("--output", type=Path, default=DEFAULT_CSV, help="Output CSV path (mode 1)")
    args = parser.parse_args()

    load_dotenv(Path(__file__).parent / ".env")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY missing in scripts/.env", file=sys.stderr)
        return 1

    iris_config = IrisConfig(
        api_url=os.environ.get("POKEMANAGER_API_URL", "http://localhost:3000"),
        supabase_url=os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""),
        supabase_anon_key=os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
        email=os.environ.get("POKEMANAGER_EMAIL", ""),
        password=os.environ.get("POKEMANAGER_PASSWORD", ""),
    )
    iris = IrisClient(iris_config)

    if args.commit:
        return mode_two(args.folder, args.commit, iris)
    else:
        mode_one(args.folder, args.output, api_key, iris)
        return 0


if __name__ == "__main__":
    sys.exit(main())
