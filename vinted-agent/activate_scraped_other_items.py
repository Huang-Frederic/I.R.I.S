# vinted-agent/activate_scraped_other_items.py
"""One-off: assigns real Vinted categories (picked to match each item's
original category on Fred's old live listings, per manifest.json) to the
11 rows imported by import_scraped_other_items.py, then flips each to
status='for_sale' so the other_items_status_update_queue_sync trigger
queues them for the bot.

Run once. Not wired into any recurring process.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env.local")

FRED_USER_ID = "35385d3c-5966-4a10-8568-8d92d1be47e7"

# name -> (vinted_catalog_id, vinted_catalog_path), ids verified against
# lib/data/vinted-categories.json; path chosen to match each item's
# original Vinted category in export-other-items/manifest.json.
UPDATES = {
    "Robot Aspirateur Midea S8+": (
        3543, "Maison > Entretien de la maison > Aspirateurs et nettoyage > Aspirateurs",
    ),
    "Parka Uniqlo Noire avec Fausse Fourrure - Taille L": (
        1227, "Hommes > Vêtements > Manteaux et vestes > Manteaux > Parkas",
    ),
    "Doudoune Uniqlo Longue Matelassé - Noir Taille L": (
        2614, "Femmes > Vêtements > Manteaux et vestes > Vestes > Doudounes",
    ),
    "Imperméable RAINS Unisex Long Jacket Reflective Black Reflective": (
        1080, "Femmes > Vêtements > Manteaux et vestes > Manteaux > Imperméables",
    ),
    "Manteau Long Zara - Noir": (
        2526, "Femmes > Vêtements > Manteaux et vestes > Manteaux > Pardessus et manteaux longs",
    ),
    "Sac a dos Lewis Hamilton x Tommy Hilfiger - Noir/Gris": (
        246, "Hommes > Accessoires > Sacs et sacoches > Sacs à dos",
    ),
    "Sac a Dos Herschel Retreat - Night Camo": (
        4679, "Sport > Sports de plein air > Sacs de randonnée > Sacs à dos de trek",
    ),
    "Nike Dunk Low Retro SE - Pale Ivory/Malachite/Lottery 41 EU (8 US)": (
        1242, "Hommes > Chaussures > Baskets",
    ),
    "Nike Dunk Low Retro - Blue Jay / UCLA 45 EU (11 US)": (
        1242, "Hommes > Chaussures > Baskets",
    ),
    "Valentino Born in Roma Uomo - Coffret Eau de toilette pour homme. Coffret Cadeau": (
        145, "Hommes > Soins > Parfums",
    ),
    "Sacoche Men's Classic - Lacoste Noire NH4422HC": (
        247, "Hommes > Accessoires > Sacs et sacoches > Sacs à bandoulière",
    ),
}


def main() -> None:
    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    rows = (
        supabase.table("other_items")
        .select("id, name, status, vinted_catalog_id")
        .eq("user_id", FRED_USER_ID)
        .execute()
        .data
    )

    seen = set()
    for row in rows:
        name = row["name"]
        if name not in UPDATES:
            continue
        seen.add(name)
        catalog_id, catalog_path = UPDATES[name]
        supabase.table("other_items").update({
            "vinted_catalog_id": catalog_id,
            "vinted_catalog_path": catalog_path,
            "status": "for_sale",
        }).eq("id", row["id"]).execute()
        print(f"Updated {row['id']} ({name}) -> catalog {catalog_id} / for_sale")

    missing = set(UPDATES) - seen
    if missing:
        print("WARNING: no matching row found for:", missing)

    queue = (
        supabase.table("vinted_queue")
        .select("id, other_item_id, position")
        .eq("user_id", FRED_USER_ID)
        .not_.is_("other_item_id", "null")
        .execute()
        .data
    )
    print(f"\nvinted_queue now has {len(queue)} other_item entries for Fred")


if __name__ == "__main__":
    main()
