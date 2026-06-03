import json
import re
import uuid
from pathlib import Path
from typing import Optional
import requests

VINTED_BASE = "https://www.vinted.com"

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


def _parse_csrf(html: str) -> Optional[str]:
    m = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html)
    return m.group(1) if m else None


class VintedClient:
    def __init__(self, cookies_path: str = "cookies.json"):
        raw = json.loads(Path(cookies_path).read_text())
        self._cookies = {k: v for k, v in raw.items() if not k.startswith("_comment")}
        self._session = requests.Session()
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
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
        }
        if self._csrf:
            h["x-csrf-token"] = self._csrf
        return h

    def refresh_csrf(self) -> None:
        r = self._session.get(
            VINTED_BASE,
            headers={
                "User-Agent": self._headers()["User-Agent"],
                "Accept": "text/html",
            },
            timeout=15,
        )
        r.raise_for_status()
        token = _parse_csrf(r.text)
        if not token:
            raise RuntimeError("Could not extract CSRF token from vinted.com")
        self._csrf = token

    def upload_photo(self, image_url: str) -> int:
        img_data = requests.get(image_url, timeout=20).content
        files = {
            "photo[type]": (None, "item"),
            "photo[file]": ("card.jpg", img_data, "image/jpeg"),
        }
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/photos",
            files=files,
            headers=self._headers(),
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["id"]

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
    ) -> str:
        if not self._csrf:
            self.refresh_csrf()

        temp_uuid = str(uuid.uuid4())
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
        r = self._session.post(
            f"{VINTED_BASE}/api/v2/item_upload/items",
            json=payload,
            headers=h,
            timeout=30,
        )
        r.raise_for_status()
        return str(r.json()["item"]["id"])
