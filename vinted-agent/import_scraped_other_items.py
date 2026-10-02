# vinted-agent/import_scraped_other_items.py
"""One-off: loads the 11 items already scraped into
vinted-agent/export-other-items/manifest.json into the new other_items
table, uploading their saved photos to the other-item-photos bucket.

Run once, after Task 2's migration has been applied. Not wired into any
recurring process.
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env.local")

FRED_USER_ID = "35385d3c-5966-4a10-8568-8d92d1be47e7"
EXPORT_DIR = Path(__file__).parent / "export-other-items"

# Vinted condition: every scraped item's JSON-LD had itemCondition
# "NewCondition" for the robot vacuum; the rest need a judgment call per
# item since Vinted's JSON-LD doesn't carry the seller's original condition
# attribute id, only a coarse "new"/"used" signal. Default to "Très bon
# état" (3) and let Fred correct any that need it via a follow-up manual
# edit — these are his own real listings, he knows their actual condition
# better than any heuristic here would.
DEFAULT_CONDITION_ID = 3


def main() -> None:
    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    manifest = json.loads((EXPORT_DIR / "manifest.json").read_text())

    for entry in manifest:
        price = entry.get("price")
        inserted = supabase.table("other_items").insert({
            "user_id": FRED_USER_ID,
            "name": (entry["title"] or "")[:80],
            "description": entry.get("description") or "",
            "price": price,
            "vinted_catalog_id": 1,  # placeholder — Fred must pick the real category by editing each row (no stock/edit UI yet; use the Supabase table editor, see Task 10 Step 2)
            "vinted_catalog_path": entry.get("category") or "",
            "brand_name": entry.get("brand"),
            "vinted_condition_id": DEFAULT_CONDITION_ID,
            "status": "collection",  # not auto-queued — Fred reviews/corrects each row before setting it for_sale
        }).execute()
        item_id = inserted.data[0]["id"]

        uploaded = []
        for i, photo_path in enumerate(entry.get("photos", [])):
            data = Path(photo_path).read_bytes()
            storage_path = f"{item_id}/{i}.webp"
            supabase.storage.from_("other-item-photos").upload(
                storage_path, data, {"content-type": "image/webp"}
            )
            uploaded.append(storage_path)

        supabase.table("other_items").update({"photo_urls": uploaded}).eq("id", item_id).execute()
        print(f"Imported {entry['id']} -> other_items row {item_id} ({len(uploaded)} photos)")


if __name__ == "__main__":
    main()
