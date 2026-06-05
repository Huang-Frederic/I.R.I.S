import io
import json
import logging
import random
import re
import uuid
from pathlib import Path
from typing import Optional

import requests
from curl_cffi import requests as curl_requests
from PIL import Image

VINTED_BASE = "https://www.vinted.fr"

CONDITION_MAP = {
    "NM": 1,
    "EX": 2,
    "GD": 3,
    "PL": 4,
    "PO": 5,
}

POKEMON_CATALOG_ID = 4875
POKEMON_BRAND_ID = 191646
PACKAGE_SIZE_ID = 1


_CROP_MIN = 0.02
_CROP_MAX = 0.04


def _process_image(raw: bytes) -> bytes:
    """Mirror the front's pipeline: random light crop (2-4% per edge) + JPEG 95%.
    Makes each upload look like a lightly edited phone photo, not a script copy."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size

    def rand_px(dim: int) -> int:
        lo = max(1, round(dim * _CROP_MIN))
        hi = max(lo, round(dim * _CROP_MAX))
        return random.randint(lo, hi)

    left = rand_px(w)
    right = rand_px(w)
    top = rand_px(h)
    bottom = rand_px(h)
    cropped = img.crop((left, top, w - right, h - bottom))

    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def _parse_csrf(html: str) -> Optional[str]:
    # Vinted embeds CSRF in a JS config blob on /items/new.
    # The JSON may be single-encoded ("CSRF_TOKEN":"<uuid>")
    # or double-encoded inside a string (\"CSRF_TOKEN\":\"<uuid>\").
    m = re.search(r'(?:\\"|")CSRF_TOKEN(?:\\"|")\s*:\s*(?:\\"|")([a-f0-9\-]{36})(?:\\"|")', html)
    if m:
        return m.group(1)
    # Fallback: legacy meta tag
    m = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html)
    return m.group(1) if m else None


class VintedClient:
    def __init__(self, cookies_path: str = "cookies.json"):
        self._cookies_path = cookies_path
        raw = json.loads(Path(cookies_path).read_text())
        # Skip comment keys and empty values — sending access_token_web="" would break auth
        self._cookies = {k: v for k, v in raw.items() if v and not k.startswith("_comment")}
        # curl_cffi impersonates Chrome's TLS fingerprint (JA3) to bypass DataDome
        self._session = curl_requests.Session(impersonate="chrome120")
        self._session.cookies.update(self._cookies)
        self._csrf: Optional[str] = None

    def _headers(self) -> dict:
        h = {
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
                "(KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36"
            ),
            "Accept": "application/json,text/plain,*/*,image/webp",
            "Accept-Language": "fr",
            "locale": "fr-FR",
            "Origin": VINTED_BASE,
            "Referer": f"{VINTED_BASE}/items/new",
            # Browser hint headers — DataDome uses these to verify browser identity
            "sec-ch-ua": '"Samsung Internet";v="30.0", "Chromium";v="143", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "x-anon-id": self._cookies.get("anon_id", ""),
            "accept-features": "ALL",
            # Required for Vinted to process item_attributes (condition, size, etc.)
            "x-enable-dynamic-attribute-condition": "true",
            "x-enable-dynamic-attribute-size": "true",
            "x-enable-dynamic-attribute-video-game-rating": "true",
        }
        if self._csrf:
            h["x-csrf-token"] = self._csrf
        return h

    def refresh_csrf(self) -> None:
        """Fetch Vinted, run Playwright session-refresh if needed, extract CSRF."""
        r = self._session.get(
            f"{VINTED_BASE}/items/new",
            headers={"User-Agent": self._headers()["User-Agent"], "Accept": "text/html"},
            timeout=15,
            allow_redirects=True,
        )
        r.raise_for_status()

        if "session-refresh" in r.url:
            logging.getLogger(__name__).info(
                "Session expired — launching Chromium to refresh tokens…"
            )
            self._playwright_refresh_session()
            # Retry now that cookies are fresh
            r = self._session.get(
                f"{VINTED_BASE}/items/new",
                headers={"User-Agent": self._headers()["User-Agent"], "Accept": "text/html"},
                timeout=15,
                allow_redirects=True,
            )
            r.raise_for_status()

        token = _parse_csrf(r.text)
        if not token:
            raise RuntimeError(
                "Session expired and Playwright refresh failed. "
                "Run: python login.py --email YOUR_EMAIL --password YOUR_PASSWORD"
            )
        self._csrf = token

    def _playwright_refresh_session(self) -> None:
        """Launch headless Chromium, complete Vinted's JS session-refresh flow
        (includes Cloudflare challenge), extract fresh cookies, persist to disk."""
        import time
        from playwright.sync_api import sync_playwright

        domain = VINTED_BASE.replace("https://", "")  # www.vinted.fr

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(
                user_agent=self._headers()["User-Agent"],
                locale="fr-FR",
            )
            # Load current cookies (refresh_token_web etc.)
            pw_cookies = [
                {"name": k, "value": v, "domain": domain, "path": "/"}
                for k, v in self._cookies.items() if v
            ]
            if pw_cookies:
                ctx.add_cookies(pw_cookies)

            page = ctx.new_page()
            # Navigate to session-refresh and wait for JS to exchange refresh_token
            # for new access_token — the page redirects away when done.
            page.goto(
                f"{VINTED_BASE}/session-refresh?ref_url=%2Fitems%2Fnew",
                wait_until="commit",
                timeout=30000,
            )
            try:
                # Wait until the JS completes the token exchange and redirects away
                page.wait_for_url(
                    lambda url: "session-refresh" not in url,
                    timeout=20000,
                )
            except Exception:
                # Fallback: wait a bit and proceed anyway
                time.sleep(8)

            fresh = {
                c["name"]: c["value"]
                for c in ctx.cookies()
                if "vinted" in c["domain"] and c["name"] in {
                    "access_token_web", "refresh_token_web",
                    "_vinted_fr_session", "datadome", "cf_clearance",
                }
            }
            browser.close()

        if fresh:
            self._cookies.update(fresh)
            self._session.cookies.update(fresh)
            self._save_cookies()
            logging.getLogger(__name__).info(
                "Playwright session refresh done — got: %s", list(fresh.keys())
            )

    def _save_cookies(self) -> None:
        """Persist the session's current cookies back to cookies.json."""
        updated = dict(self._session.cookies)
        # Keep only the keys we originally loaded (drop tracking cookies)
        merged = {k: updated.get(k, v) for k, v in self._cookies.items()}
        self._cookies = merged
        Path(self._cookies_path).write_text(json.dumps(merged, indent=2))

    def upload_photo(self, image_url: str) -> int:
        raw = requests.get(image_url, timeout=20).content
        img_bytes = _process_image(raw)
        # curl_cffi uses CurlMime for multipart uploads
        from curl_cffi import CurlMime
        multipart = CurlMime()
        multipart.addpart(name="photo[type]", data=b"item")
        multipart.addpart(name="photo[file]", data=img_bytes,
                          filename="card.jpg", content_type="image/jpeg")
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/photos",
            multipart=multipart,
            headers=self._headers(),
            timeout=30,
        )
        if r.status_code == 401:
            logging.getLogger(__name__).info("Session expired, refreshing and retrying…")
            self.refresh_csrf()
            r = self._session.post(
                f"{VINTED_BASE}/api/v2/photos",
                multipart=multipart,
                headers=self._headers(),
                timeout=30,
            )
        # Detect DataDome binary block (200 with non-JSON binary body)
        content_type = r.headers.get("content-type", "")
        if r.ok and "json" not in content_type:
            logging.getLogger(__name__).error(
                "DataDome block detected on photo upload (status=%s, ct=%s) — run login.py to refresh session",
                r.status_code, content_type,
            )
            raise RuntimeError("DataDome blocked photo upload — run: python login.py")
        if not r.ok:
            logging.getLogger(__name__).error(
                "Photo upload failed %s: %s", r.status_code, r.text[:300]
            )
        r.raise_for_status()
        try:
            return r.json()["id"]
        except Exception:
            raise RuntimeError(f"Photo upload bad response ({r.status_code}): {r.text[:200]}")

    def _build_listing_payload(
        self,
        temp_uuid: str,
        photo_id: int,
        title: str,
        description: str,
        price: float,
        condition: str,
    ) -> dict:
        return {
            "item": {
                "id": None,
                "currency": "EUR",
                "temp_uuid": temp_uuid,
                "title": title,
                "description": description,
                "brand_id": POKEMON_BRAND_ID,
                "brand": "Pokémon",
                "catalog_id": POKEMON_CATALOG_ID,
                "isbn": None,
                "is_unisex": False,
                "ai_photo": False,
                "price": price,
                "package_size_id": PACKAGE_SIZE_ID,
                "shipment_prices": {"domestic": None, "international": None},
                "color_ids": [],
                "assigned_photos": [{"id": photo_id, "orientation": 0}],
                "measurement_length": None,
                "measurement_width": None,
                "item_attributes": [
                    {"code": "condition", "ids": [CONDITION_MAP[condition]]}
                ],
                "manufacturer": None,
                "manufacturer_labelling": None,
            },
            "feedback_id": None,
            "push_up": False,
            "parcel": None,
            "upload_session_id": temp_uuid,
        }

    def create_listing(
        self,
        title: str,
        description: str,
        price: float,
        condition: str,
        image_url: str,
        photo_id: Optional[int] = None,
    ) -> str:
        if not self._csrf:
            self.refresh_csrf()

        temp_uuid = str(uuid.uuid4())
        if photo_id is None:
            photo_id = self.upload_photo(image_url)

        payload = self._build_listing_payload(
            temp_uuid=temp_uuid,
            photo_id=photo_id,
            title=title,
            description=description,
            price=price,
            condition=condition,
        )

        h = {**self._headers(), "content-type": "application/json", "x-upload-form": "true"}
        import logging, json as _json
        logging.getLogger(__name__).debug("Listing payload: %s", _json.dumps(payload, indent=2))
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/item_upload/items",
            json=payload,
            headers=h,
            timeout=30,
        )
        if not r.ok:
            logging.getLogger(__name__).error(
                "Vinted API 400 response body: %s", r.text[:2000]
            )
        r.raise_for_status()
        return str(r.json()["item"]["id"])
