"""Thin client for the IRIS app endpoints used by the bulk import script.

Auth: logs in once with email+password via Supabase REST API, stores the JWT,
includes it in subsequent calls to /api/enrich and /api/cards.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


@dataclass
class IrisConfig:
    api_url: str            # e.g. https://pokemanager.vercel.app
    supabase_url: str       # e.g. https://abc.supabase.co
    supabase_anon_key: str
    email: str
    password: str


class IrisClient:
    def __init__(self, config: IrisConfig):
        self.config = config
        self._jwt: str | None = None

    def login(self) -> None:
        """Get the JWT from Supabase Auth REST API. Sets self._jwt on success."""
        url = f"{self.config.supabase_url}/auth/v1/token?grant_type=password"
        res = requests.post(
            url,
            headers={"apikey": self.config.supabase_anon_key, "Content-Type": "application/json"},
            json={"email": self.config.email, "password": self.config.password},
            timeout=30,
        )
        res.raise_for_status()
        body = res.json()
        token = body.get("access_token")
        if not token:
            raise RuntimeError(f"Login did not return access_token: {body}")
        self._jwt = token

    def _headers(self, json_body: bool = True) -> dict[str, str]:
        if self._jwt is None:
            raise RuntimeError("Not logged in. Call login() first.")
        h = {"Authorization": f"Bearer {self._jwt}"}
        if json_body:
            h["Content-Type"] = "application/json"
        return h

    def enrich(self, ocr_fields: dict[str, Any]) -> dict[str, Any]:
        """POST /api/enrich with the OCR fields. Returns { bestMatch, candidates }."""
        url = f"{self.config.api_url}/api/enrich"
        res = requests.post(url, json=ocr_fields, headers=self._headers(), timeout=30)
        res.raise_for_status()
        return res.json()

    def create_card(self, fields: dict[str, str], photo_path: Path) -> dict[str, Any]:
        """POST /api/cards (multipart) with the card fields + photo file.
        Returns { card, fallback?, reason? } on 200."""
        url = f"{self.config.api_url}/api/cards"
        with open(photo_path, "rb") as f:
            files = {"image": (photo_path.name, f, "image/jpeg")}
            data = {k: str(v) if v is not None else "" for k, v in fields.items()}
            res = requests.post(
                url,
                files=files,
                data=data,
                headers={"Authorization": f"Bearer {self._jwt}"},  # no Content-Type for multipart
                timeout=60,
            )
        if res.status_code >= 500:
            res.raise_for_status()
        return res.json()  # may include error fields if 4xx; caller decides
