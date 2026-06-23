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
        log = logging.getLogger(__name__)
        raw = requests.get(image_url, timeout=20).content
        img_bytes = _process_image(raw)

        def _make_multipart():
            from curl_cffi import CurlMime
            mp = CurlMime()
            mp.addpart(name="photo[type]", data=b"item")
            mp.addpart(name="photo[file]", data=img_bytes,
                       filename="card.jpg", content_type="image/jpeg")
            return mp

        r = self._session.post(
            f"{VINTED_BASE}/api/v2/photos",
            multipart=_make_multipart(),
            headers=self._headers(),
            timeout=30,
        )
        if r.status_code == 401:
            log.info("Session expirée — refresh et retry…")
            self.refresh_csrf()
            r = self._session.post(
                f"{VINTED_BASE}/api/v2/photos",
                multipart=_make_multipart(),
                headers=self._headers(),
                timeout=30,
            )
        # Detect DataDome binary block (200 with non-JSON binary body)
        content_type = r.headers.get("content-type", "")
        if r.ok and "json" not in content_type:
            log.error("DataDome bloque le photo upload (status=%s) — relance login.py", r.status_code)
            raise RuntimeError("DataDome blocked photo upload — run: python login.py")
        if not r.ok:
            log.error("Photo upload failed %s: %s", r.status_code, r.text[:300])
        r.raise_for_status()
        try:
            return r.json()["id"]
        except Exception:
            raise RuntimeError(f"Photo upload bad response ({r.status_code}): {r.text[:200]}")

    def _build_listing_payload(
        self,
        temp_uuid: str,
        photo_ids: list,
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
                "assigned_photos": [{"id": pid, "orientation": 0} for pid in photo_ids],
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
        image_urls: list,
        photo_ids: Optional[list] = None,
        catalog_id: int = POKEMON_CATALOG_ID,
        brand_id: int = POKEMON_BRAND_ID,
        brand: str = "Pokémon",
    ) -> str:
        if not self._csrf:
            self.refresh_csrf()

        temp_uuid = str(uuid.uuid4())
        if photo_ids is None:
            photo_ids = [self.upload_photo(url) for url in image_urls]

        payload = self._build_listing_payload(
            temp_uuid=temp_uuid,
            photo_ids=photo_ids,
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
            if r.status_code == 403:
                try:
                    body = r.json()
                    captcha_url = body.get("url", "")
                    if "captcha-delivery.com" in captcha_url:
                        from urllib.parse import urlparse, parse_qs
                        qs = parse_qs(urlparse(captcha_url).query)
                        challenge_type = qs.get("t", [""])[0]
                        if challenge_type == "bv":
                            # "bot verification" — interactive challenge, no CAPTCHA solver supports it.
                            # Only a fresh login (python login.py) can clear it.
                            raise RuntimeError(
                                "Cookie DataDome expiré (challenge t=bv) — relance: python login.py"
                            )
                        log.info("DataDome CAPTCHA — tentative CapSolver…")
                        if self._solve_datadome_capsolver(captcha_url):
                            self.refresh_csrf()
                            h2 = {**self._headers(), "content-type": "application/json", "x-upload-form": "true"}
                            r2 = self._session.post(
                                f"{VINTED_BASE}/api/v2/item_upload/items",
                                json=payload, headers=h2, timeout=30,
                            )
                            if r2.ok:
                                return str(r2.json()["item"]["id"])
                            log.error("CapSolver retry échoué (%s) : %s", r2.status_code, r2.text[:300])
                        raise RuntimeError(
                            "DataDome bloqué — relance: python login.py ou vérifie CAPSOLVER_KEY"
                        )
                except (ValueError, KeyError):
                    pass
        r.raise_for_status()
        return str(r.json()["item"]["id"])

    def _solve_datadome_capsolver(self, captcha_url: str) -> bool:
        """Send the DataDome CAPTCHA challenge to CapSolver and apply the resolved cookie.

        Works for any Vinted account — the datadome cookie is IP/fingerprint-based, not
        account-based. Requires CAPSOLVER_KEY + VINTED_PROXY in the environment.

        Returns True if the fresh datadome cookie was applied, False otherwise.
        """
        import os
        import time
        from urllib.parse import urlparse
        log = logging.getLogger(__name__)

        api_key = os.getenv("CAPSOLVER_KEY", "")
        if not api_key:
            log.warning("CAPSOLVER_KEY non défini — skip CapSolver (ajoute-le dans .env)")
            return False

        proxy_url = os.getenv("VINTED_PROXY", "")
        if not proxy_url:
            log.warning("VINTED_PROXY non défini — CapSolver nécessite un proxy (ex: ngrok SOCKS5)")
            return False

        parsed = urlparse(proxy_url)
        task: dict = {
            "type": "DatadomeSliderTask",
            "websiteURL": VINTED_BASE,
            "captchaUrl": captcha_url,
            "userAgent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "proxyType": parsed.scheme or "socks5",
            "proxyAddress": parsed.hostname or "",
            "proxyPort": parsed.port or 1080,
        }
        if parsed.username:
            task["proxyLogin"] = parsed.username
        if parsed.password:
            task["proxyPassword"] = parsed.password

        ua = task["userAgent"]
        try:
            r = requests.post(
                "https://api.capsolver.com/createTask",
                json={"clientKey": api_key, "task": task},
                timeout=15,
            )
            data = r.json()
            if data.get("errorId"):
                log.warning("CapSolver createTask erreur : %s", data.get("errorDescription"))
                return False
            task_id = data.get("taskId")
            if not task_id:
                log.warning("CapSolver : pas de taskId dans la réponse")
                return False

            log.info("CapSolver task %s — résolution en cours…", task_id)
            for _ in range(20):  # 20 × 3 s = 60 s max
                time.sleep(3)
                r = requests.post(
                    "https://api.capsolver.com/getTaskResult",
                    json={"clientKey": api_key, "taskId": task_id},
                    timeout=15,
                )
                result = r.json()
                status = result.get("status")
                if status == "ready":
                    cookie_str = result.get("solution", {}).get("cookie", "")
                    if "datadome=" not in cookie_str:
                        log.warning("CapSolver : solution sans cookie datadome (%s)", cookie_str[:80])
                        return False
                    new_dd = cookie_str.split("datadome=")[-1].split(";")[0]
                    self._cookies["datadome"] = new_dd
                    self._save_cookies()
                    self._session = curl_requests.Session(impersonate="chrome131")
                    self._session.cookies.update(self._cookies)
                    log.info("CapSolver DataDome résolu ✓")
                    return True
                elif status == "failed":
                    log.warning("CapSolver : task échouée — %s", result.get("errorDescription"))
                    return False
                # status == "processing" → continue polling

            log.warning("CapSolver : timeout (60 s) sans résolution")
            return False
        except Exception as e:
            log.warning("CapSolver erreur : %s", e)
            return False

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
