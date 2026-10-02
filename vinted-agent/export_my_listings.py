"""One-off utility: export title/description/photos from Fred's own live
Vinted listings before he deletes them, so the data can be re-imported into
IRIS once the "other items" (non-card) feature exists.

Usage: python3 export_my_listings.py
Output: ~/vinted-export-other-items/<item_id>/ (photos) + manifest.json
"""
import json
import re
import time
from pathlib import Path

from vinted_api import VintedClient

URLS = [
    "https://www.vinted.fr/items/8649518730-robot-aspirateur-midea-s8",
    "https://www.vinted.fr/items/8649513584-parka-uniqlo-noire-avec-fausse-fourrure-taille-l",
    "https://www.vinted.fr/items/8649509456-doudoune-uniqlo-longue-matelasse-noir-taille-l",
    "https://www.vinted.fr/items/8649504493-impermeable-rains-unisex-long-jacket-reflective-black-reflective",
    "https://www.vinted.fr/items/8649501112-manteau-long-zara-noir",
    "https://www.vinted.fr/items/8649477880-sac-a-dos-lewis-hamilton-x-tommy-hilfiger-noirgris",
    "https://www.vinted.fr/items/8649473213-sac-a-dos-herschel-retreat-night-camo",
    "https://www.vinted.fr/items/8649467562-nike-dunk-low-retro-se-pale-ivorymalachitelottery-41-eu-8-us",
    "https://www.vinted.fr/items/8649463460-nike-dunk-low-retro-blue-jay-ucla-45-eu-11-us",
    "https://www.vinted.fr/items/8649440810-valentino-born-in-roma-uomo-coffret-eau-de-toilette-pour-homme-coffret-cadeau-parfum",
    "https://www.vinted.fr/items/8649435571-sacoche-mens-classic-lacoste-noire-nh4422hc",
]

OUT_DIR = Path.home() / "vinted-export-other-items"


def extract_jsonld(html: str) -> dict:
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else {}


def _bracket_match(text: str, open_idx: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError("unbalanced brackets")


def extract_photo_urls(html: str) -> list[str]:
    """The item's own photo list lives in an escaped JSON blob embedded in a
    Next.js RSC `self.__next_f.push([...])` chunk — same embedding mechanism
    as the catalog tree on /items/new, just a different key."""
    needle = r'\"photos\":['
    idx = html.find(needle)
    if idx == -1:
        return []
    start = html.rfind('self.__next_f.push([1,"', 0, idx)
    end = html.find('"])</script>', idx) + 3
    chunk = html[start:end]
    m = re.search(r'self\.__next_f\.push\(\[1,"(.*)"\]\)', chunk, re.S)
    decoded = json.loads('"' + m.group(1) + '"')
    j = decoded.find('"photos":[')
    arr_start = decoded.find('[', j)
    arr_end = _bracket_match(decoded, arr_start, '[', ']')
    photos = json.loads(decoded[arr_start:arr_end])
    photos.sort(key=lambda p: p.get("image_no", 0))
    return [p["url"] for p in photos]


def main() -> None:
    v = VintedClient("cookies_fhuang5.json")
    v.refresh_csrf()
    OUT_DIR.mkdir(exist_ok=True)

    manifest = []
    for url in URLS:
        item_id = re.search(r"/items/(\d+)-", url).group(1)
        r = v._session.get(url, headers=v._html_headers(), timeout=20)
        if not r.ok:
            print(f"FAIL {item_id}: HTTP {r.status_code}")
            continue
        html = r.text
        ld = extract_jsonld(html)
        photo_urls = extract_photo_urls(html)

        item_dir = OUT_DIR / item_id
        item_dir.mkdir(exist_ok=True)
        photo_paths = []
        for i, photo_url in enumerate(photo_urls):
            pr = v._session.get(photo_url, timeout=20)
            fp = item_dir / f"{i + 1}.webp"
            fp.write_bytes(pr.content)
            photo_paths.append(str(fp))
            time.sleep(0.3)

        offers = ld.get("offers") or {}
        brand = ld.get("brand") or {}
        item = {
            "id": item_id,
            "url": url,
            "title": ld.get("name"),
            "description": ld.get("description"),
            "price": offers.get("price"),
            "currency": offers.get("priceCurrency"),
            "brand": brand.get("name"),
            "category": ld.get("category"),
            "color": ld.get("color"),
            "photos": photo_paths,
        }
        manifest.append(item)
        print(f"OK {item_id}: {item['title']!r} ({len(photo_paths)} photos)")
        time.sleep(1)

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\nSaved {len(manifest)} item(s) to {OUT_DIR}")


if __name__ == "__main__":
    main()
