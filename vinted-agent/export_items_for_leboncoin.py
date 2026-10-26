# vinted-agent/export_items_for_leboncoin.py
"""One-off: exports every Fred for_sale other_item (photos + a ready-to-paste
LeBonCoin listing) into a local folder, ordered by the item's current Vinted
queue priority, then zips it. Not wired into any recurring process.

LeBonCoin descriptions intentionally drop the Vinted-specific shipping copy
(main.py's build_other_item_description has "Expédition rapide" / "Remise en
main propre possible") for a stricter, LeBonCoin-flavored hand-off-only line —
Fred's own request, these listings are meant to move locally with no shipping
at all, not "shipping or hand-off" like the Vinted ones.
"""
import csv
import os
import re
import shutil
import zipfile
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

from titles import vinted_title

load_dotenv(Path(__file__).parent.parent / ".env.local")

FRED_USER_ID = "35385d3c-5966-4a10-8568-8d92d1be47e7"
OUTPUT_DIR = Path(__file__).parent / "export-items-leboncoin"
ZIP_PATH = Path(__file__).parent / "items-leboncoin.zip"

# Mirrors main.py's OTHER_ITEM_CONDITION_LABEL — kept in sync by hand, same as
# the TS preview (lib/utils/other-item-template.ts). Vinted's real condition
# ids, not a sequential 1-5 scale.
OTHER_ITEM_CONDITION_LABEL = {
    6: "Neuf avec étiquette",
    1: "Neuf sans étiquette",
    2: "Très bon état",
    3: "Bon état",
    4: "Satisfaisant",
    7: "Certaines pièces ne fonctionnent pas",
}

RMP_NOTE = "📍 Remise en main propre UNIQUEMENT — Paris / Île-de-France. Pas d'envoi."


def slugify(name: str) -> str:
    cleaned = re.sub(r"[^\w\- ]", "", name).strip()
    return re.sub(r"\s+", " ", cleaned)[:60]


def build_description(item: dict) -> str:
    """Same template the app/bot actually use (mirrors main.py's
    build_other_item_description verbatim — brand/size/condition/free-text,
    then the usual shipping+RMP+photos closing block), with the LeBonCoin
    RMP-only note appended at the end rather than replacing anything."""
    lines = [f"✨ {item['name']}"]
    if (item.get("brand_name") or "").strip():
        lines.append(f"📘 Marque : {item['brand_name'].strip()}")
    if (item.get("size") or "").strip():
        lines.append(f"📏 Taille : {item['size'].strip()}")
    condition_label = OTHER_ITEM_CONDITION_LABEL.get(item.get("vinted_condition_id"), "Très bon état")
    lines.append(f"✅ État : {condition_label}.")
    if (item.get("description") or "").strip():
        lines.append("")
        lines.append(item["description"].strip())
    lines.append("")
    lines.append("🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦")
    lines.append("🤝 Remise en main propre possible sur Paris / 92 / 95")
    lines.append("📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !")
    lines.append("")
    lines.append(RMP_NOTE)
    return "\n".join(lines)


def main() -> None:
    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    items = (
        supabase.table("other_items")
        .select("id, name, description, price, photo_urls, brand_name, size, vinted_condition_id, vinted_catalog_path, date_added")
        .eq("user_id", FRED_USER_ID)
        .eq("status", "for_sale")
        .execute()
        .data
    )

    queue = (
        supabase.table("vinted_queue")
        .select("other_item_id, position")
        .eq("user_id", FRED_USER_ID)
        .not_.is_("other_item_id", "null")
        .execute()
        .data
    )
    position_by_id = {q["other_item_id"]: q["position"] for q in queue}
    items.sort(key=lambda i: (position_by_id.get(i["id"], 10**9), i["date_added"]))

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    base_url = f"{os.environ['NEXT_PUBLIC_SUPABASE_URL']}/storage/v1/object/public/other-item-photos"

    csv_rows = []
    for idx, item in enumerate(items, start=1):
        title = vinted_title(item["name"] or "").strip()
        folder_name = f"{idx:02d} - {slugify(title)}"
        item_dir = OUTPUT_DIR / folder_name
        item_dir.mkdir(parents=True, exist_ok=True)

        for photo_idx, path in enumerate(item.get("photo_urls") or []):
            resp = requests.get(f"{base_url}/{path}", timeout=30)
            resp.raise_for_status()
            ext = Path(path).suffix or ".jpg"
            (item_dir / f"{photo_idx}{ext}").write_bytes(resp.content)

        description = build_description(item)
        (item_dir / "description.txt").write_text(
            f"{title}\n\n{description}\n\nPrix : {item['price']} €\n", encoding="utf-8"
        )

        csv_rows.append({
            "ordre": idx,
            "titre": title,
            "prix": item["price"],
            "categorie_vinted_ref": item.get("vinted_catalog_path") or "",
            "description": description,
            "dossier_photos": folder_name,
        })
        print(f"{idx:02d}. {title} ({len(item.get('photo_urls') or [])} photos)")

    csv_path = OUTPUT_DIR / "items-leboncoin.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f, fieldnames=["ordre", "titre", "prix", "categorie_vinted_ref", "description", "dossier_photos"]
        )
        writer.writeheader()
        writer.writerows(csv_rows)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in OUTPUT_DIR.rglob("*"):
            zf.write(file, file.relative_to(OUTPUT_DIR.parent))

    print(f"\n{len(items)} items exported -> {ZIP_PATH}")


if __name__ == "__main__":
    main()
