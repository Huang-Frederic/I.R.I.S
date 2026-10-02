# vinted-agent/fetch_categories.py
"""Fetches Vinted's full category tree through the bot's authenticated
session and writes it, flattened, to lib/data/vinted-categories.json for
the "other items" category picker.

Mechanism: /items/new embeds the tree as a JSON blob inside a Next.js RSC
`self.__next_f.push([1, "..."])` chunk (key "catalogTree") — verified
working during this feature's design research. No separate API endpoint
needed; no live fetch happens from the app itself, this is a one-off
(re-runnable) script.

Usage: python3 fetch_categories.py
"""
import json
import re
from pathlib import Path

from vinted_api import VintedClient

OUT_PATH = Path(__file__).parent.parent / "lib" / "data" / "vinted-categories.json"


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


def fetch_catalog_tree(v: VintedClient) -> list[dict]:
    r = v._session.get("https://www.vinted.fr/items/new", headers=v._html_headers(), timeout=20)
    r.raise_for_status()
    html = r.text

    needle = r'\"catalogTree\"'
    idx = html.find(needle)
    if idx == -1:
        raise RuntimeError("catalogTree not found in /items/new — Vinted may have changed its page structure")
    start = html.rfind('self.__next_f.push([1,"', 0, idx)
    end = html.find('"])</script>', idx) + 3
    chunk = html[start:end]
    m = re.search(r'self\.__next_f\.push\(\[1,"(.*)"\]\)', chunk, re.S)
    decoded = json.loads('"' + m.group(1) + '"')

    j = decoded.find('{"catalogTree"')
    endj = _bracket_match(decoded, j, '{', '}')
    obj = json.loads(decoded[j:endj])
    return obj["catalogTree"]


def flatten(nodes: list[dict], prefix: str = "") -> list[dict]:
    out = []
    for n in nodes:
        path = f"{prefix} > {n['title']}" if prefix else n["title"]
        out.append({"id": n["id"], "path": path})
        out.extend(flatten(n.get("catalogs", []), path))
    return out


def main() -> None:
    v = VintedClient("cookies_fhuang5.json")
    v.refresh_csrf()
    tree = fetch_catalog_tree(v)
    flat = flatten(tree)
    OUT_PATH.write_text(json.dumps(flat, ensure_ascii=False, indent=2))
    print(f"Wrote {len(flat)} categories to {OUT_PATH}")


if __name__ == "__main__":
    main()
