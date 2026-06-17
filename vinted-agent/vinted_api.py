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


class ListingGoneError(RuntimeError):
    """Raised when Vinted returns 404 on POST .../delete — listing not found.

    With the correct endpoint, a 404 definitively means the listing no longer
    exists on Vinted (manually deleted or expired). The caller may safely
    clear the stale ID and create a new listing.
    """
    pass


CONDITION_MAP = {
    "NM": 1,
    "EX": 2,
    "GD": 3,
    "PL": 4,
    "PO": 5,
}

CARDS_CATALOG_ID = 4875       # Cartes à collectionner (unité)
CARD_LOTS_CATALOG_ID = 4879  # Lots de cartes à collectionner
POKEMON_CATALOG_ID = CARDS_CATALOG_ID  # alias kept for process_job
PACKAGE_SIZE_ID = 1

# Brand IDs (catalog 4875 / 4879)
POKEMON_BRAND_ID = 191646
ONE_PIECE_BRAND_ID = 89766
MAGIC_BRAND_ID = 399547
YUGIOH_BRAND_ID = 312702
DIGIMON_BRAND_ID = 284189
DRAGON_BALL_BRAND_ID = 350491
LORCANA_BRAND_ID = 287189    # published by Ravensburger
WANKUL_BRAND_ID = 12800798
SANS_MARQUE_BRAND_ID = 1     # "Sans marque" — fallback for unknown TCG


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
        # curl_cffi impersonates Chrome's TLS fingerprint (JA3) to bypass DataDome.
        # Must match the Chrome version in the User-Agent to avoid DataDome mismatch detection.
        self._session = curl_requests.Session(impersonate="chrome131")
        self._session.cookies.update(self._cookies)
        self._csrf: Optional[str] = None

    def _headers(self) -> dict:
        h = {
            # Chrome 131 on Windows — matches impersonate="chrome131" TLS fingerprint
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json,text/plain,*/*,image/webp",
            "Accept-Language": "fr-FR,fr;q=0.9",
            "locale": "fr-FR",
            "Origin": VINTED_BASE,
            "Referer": f"{VINTED_BASE}/items/new",
            # Browser hint headers — must match UA above for DataDome consistency check
            "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
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

    def _try_token_refresh(self) -> bool:
        """Use refresh_token_web to get a new access_token_web via /oauth/token."""
        log = logging.getLogger(__name__)
        refresh_token = self._cookies.get("refresh_token_web", "")
        if not refresh_token:
            log.warning("No refresh_token_web in cookies — cannot auto-refresh")
            return False
        try:
            r = self._session.post(
                f"{VINTED_BASE}/oauth/token",
                data={"grant_type": "refresh_token", "client_id": "web", "refresh_token": refresh_token},
                headers=self._headers(),
                timeout=10,
            )
            log.info("Token refresh → %s: %s", r.status_code, r.text[:300])
            if r.ok:
                try:
                    body = r.json()
                    if body.get("access_token"):
                        self._cookies["access_token_web"] = body["access_token"]
                    if body.get("refresh_token"):
                        self._cookies["refresh_token_web"] = body["refresh_token"]
                except Exception:
                    pass
                self._save_cookies()
                # curl_cffi/libcurl has an internal cookie jar that .cookies.set() does not
                # update reliably — reinitialise the session so the new access_token is used.
                self._session = curl_requests.Session(impersonate="chrome131")
                self._session.cookies.update(self._cookies)
                log.info("Token refreshed successfully")
                return True
        except Exception as e:
            log.warning("Token refresh error: %s", e)
        return False

    def _html_headers(self) -> dict:
        """Headers for page-load requests (text/html) — full browser fingerprint for DataDome."""
        h = self._headers()
        h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        h["sec-fetch-mode"] = "navigate"
        h["sec-fetch-dest"] = "document"
        h["sec-fetch-site"] = "none"
        h.pop("locale", None)
        h.pop("x-anon-id", None)
        h.pop("accept-features", None)
        h.pop("x-enable-dynamic-attribute-condition", None)
        h.pop("x-enable-dynamic-attribute-size", None)
        h.pop("x-enable-dynamic-attribute-video-game-rating", None)
        return h

    def refresh_csrf(self) -> None:
        """Fetch /items/new and extract the CSRF token, auto-refreshing token if needed."""
        r = self._session.get(
            f"{VINTED_BASE}/items/new",
            headers=self._html_headers(),
            timeout=15,
            allow_redirects=True,
        )
        r.raise_for_status()

        if "session-refresh" in r.url:
            logging.getLogger(__name__).info("access_token expired — trying API refresh…")
            if not self._try_token_refresh():
                raise RuntimeError("Token refresh failed — relance import_cookies.py --user <user>")
            # Retry with fresh token
            r = self._session.get(
                f"{VINTED_BASE}/items/new",
                headers=self._html_headers(),
                timeout=15,
                allow_redirects=True,
            )
            r.raise_for_status()
            if "session-refresh" in r.url:
                raise RuntimeError("Token refresh inefficace — relance import_cookies.py --user <user>")

        token = _parse_csrf(r.text)
        if not token:
            raise RuntimeError("CSRF token introuvable — relance import_cookies.py --user <user>")
        self._csrf = token

    def _save_cookies(self) -> None:
        """Persist the current cookie dict to disk."""
        Path(self._cookies_path).write_text(json.dumps(self._cookies, indent=2))

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
        catalog_id: int = POKEMON_CATALOG_ID,
        brand_id: int = POKEMON_BRAND_ID,
        brand: str = "Pokémon",
    ) -> dict:
        return {
            "item": {
                "id": None,
                "currency": "EUR",
                "temp_uuid": temp_uuid,
                "title": title,
                "description": description,
                "brand_id": brand_id,
                "brand": brand,
                "catalog_id": catalog_id,
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
        catalog_id: int = POKEMON_CATALOG_ID,
        brand_id: int = POKEMON_BRAND_ID,
        brand: str = "Pokémon",
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
            catalog_id=catalog_id,
            brand_id=brand_id,
            brand=brand,
        )

        h = {**self._headers(), "content-type": "application/json", "x-upload-form": "true"}
        log = logging.getLogger(__name__)
        import json as _json
        log.debug("Listing payload: %s", _json.dumps(payload, indent=2))
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/item_upload/items",
            json=payload,
            headers=h,
            timeout=30,
        )
        if not r.ok:
            log.error("Vinted API error %s: %s", r.status_code, r.text[:2000])
            # DataDome returns 403 with a JSON body containing a captcha URL.
            if r.status_code == 403:
                try:
                    body = r.json()
                    if "captcha-delivery.com" in body.get("url", ""):
                        raise RuntimeError(
                            "DataDome blocked listing creation (403 CAPTCHA) — run login.py to refresh session"
                        )
                except (ValueError, KeyError):
                    pass
        r.raise_for_status()
        return str(r.json()["item"]["id"])

    def delete_listing(self, listing_id: str) -> None:
        log = logging.getLogger(__name__)
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/items/{listing_id}/delete",
            headers=self._headers(),
            timeout=15,
            allow_redirects=False,
        )
        if r.status_code == 401:
            log.info("Session expired on POST .../delete %s, refreshing and retrying…", listing_id)
            self.refresh_csrf()
            r = self._session.post(
                f"{VINTED_BASE}/api/v2/items/{listing_id}/delete",
                headers=self._headers(),
                timeout=15,
                allow_redirects=False,
            )
        ct = r.headers.get("content-type", "")
        if not r.ok:
            log.warning("POST .../delete #%s → HTTP %s : %s", listing_id, r.status_code, r.text[:120])
        if r.status_code == 404:
            # Listing genuinely gone from Vinted (deleted externally or expired).
            # With the correct endpoint, 404 is unambiguous — safe to recreate.
            raise ListingGoneError(
                f"Listing {listing_id} introuvable sur Vinted (404) — supprimé externalement."
            )
        # DataDome: 3xx redirect to CAPTCHA challenge page
        if 300 <= r.status_code < 400:
            raise RuntimeError(
                f"DataDome blocked POST .../delete listing {listing_id} (HTTP {r.status_code}) — run login.py"
            )
        # DataDome may return 200 with HTML instead of JSON.
        if r.ok and "json" not in ct and "text/plain" not in ct:
            raise RuntimeError(
                f"DataDome blocked POST .../delete listing {listing_id} (HTTP 200 non-JSON, ct={ct!r}) — run login.py"
            )
        r.raise_for_status()
