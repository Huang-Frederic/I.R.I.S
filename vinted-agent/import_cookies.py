"""
Import Vinted cookies from a Cookie-Editor JSON export.

Usage:
    python import_cookies.py /mnt/c/Users/.../vinted_cookies.json --user fhuang5
    python import_cookies.py /mnt/c/Users/.../vinted_cookies.json --user copine
"""
import argparse
import json
import base64
from pathlib import Path

VINTED_COOKIE_NAMES = {
    "access_token_web", "refresh_token_web", "_vinted_fr_session",
    "datadome", "cf_clearance", "v_uid", "v_sid", "anon_id",
}


def check_scope(token: str) -> None:
    try:
        payload = token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        data = json.loads(base64.b64decode(payload))
        scope = data.get("scope", "?")
        account = data.get("account_id", "?")
        print(f"  Token scope: {scope}, account_id: {account}")
        if scope != "user":
            print("  ⚠ Not authenticated — make sure you're logged into vinted.fr in Chrome")
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src", nargs="?", help="Path to Cookie-Editor JSON export")
    parser.add_argument("--user", default="fhuang5", help="User identifier (fhuang5, copine, …)")
    args = parser.parse_args()

    src = Path(args.src) if args.src else Path(f"/mnt/c/Users/fhuang5/Downloads/vinted_cookies.json")
    cookies_path = Path(__file__).parent / f"cookies_{args.user}.json"

    if not src.exists():
        print(f"File not found: {src}")
        print("Export cookies from Cookie-Editor extension and save to that path.")
        return

    raw = json.loads(src.read_text())

    if isinstance(raw, list):
        cookies_list = raw
    elif isinstance(raw, dict):
        cookies_list = raw.get("cookies", [raw])
    else:
        print("Unexpected format")
        return

    fresh = {}
    for c in cookies_list:
        name = c.get("name", "")
        value = c.get("value", "")
        domain = c.get("domain", "")
        if name in VINTED_COOKIE_NAMES and value and "vinted" in domain:
            fresh[name] = value

    if not fresh:
        print("No Vinted cookies found in the export.")
        print("Make sure you exported from vinted.fr while logged in.")
        return

    if "access_token_web" in fresh:
        check_scope(fresh["access_token_web"])

    existing = {}
    if cookies_path.exists():
        try:
            existing = json.loads(cookies_path.read_text())
        except Exception:
            pass

    merged = {k: v for k, v in {**existing, **fresh}.items() if v}
    cookies_path.write_text(json.dumps(merged, indent=2))
    print(f"cookies_{args.user}.json updated with: {list(fresh.keys())}")
    print(f"Run: python main.py")


if __name__ == "__main__":
    main()
