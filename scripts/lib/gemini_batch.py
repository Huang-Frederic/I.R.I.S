"""Wrapper for Gemini Batch API (asynchronous, ~50% cheaper than sync).

Flow:
  1. Build a payload with N request entries (one per card image)
  2. Submit via POST :batchGenerateContent → returns operation name
  3. Poll GET /operations/{name} every 30s until done
  4. Parse the response into BatchOcrResult dataclasses
"""

import base64
import json
import time
from dataclasses import dataclass
from typing import Any

import requests

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_BASE = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}"
POLL_INTERVAL_SEC = 30
POLL_TIMEOUT_SEC = 60 * 60  # 1 hour

# Same prompt as lib/api/gemini-vision.ts — kept in sync manually since the
# script is decoupled from the Next.js app.
PROMPT = """Tu regardes la photo d'une carte Pokémon JCC. Extrais les informations imprimées sur la carte.

EN BAS DE LA CARTE (sous le texte d'attaque/description), une ligne en petit contient typiquement :
1. Nom de l'illustrateur (ex: "Illus. Tecziro")
2. Numéro de carte au format XXX/YYY (ex: "012/086", "111/172")
3. Code d'extension court (ex: "SV11W", "BW5", "sm8b", "XY8b") — minuscules/majuscules sensibles, lis exactement comme imprimé

EN HAUT DE LA CARTE : nom du Pokémon (en JP/EN/FR/etc selon la langue de la carte).

Retourne le JSON suivant. NE DEVINE PAS, lis ce qui est imprimé. Si tu ne peux pas lire un champ, mets null sauf pour les requis.

{
  "card_name": "<nom complet imprimé en haut, ex: 'チャオブー', 'Pikachu ex'>",
  "pokemon_name": "<nom Pokémon sans suffixe ex/V/VMAX, ex: 'チャオブー', 'Pikachu'>",
  "set_code": "<code extension exact, ex: 'SV11W', 'BW5n'>",
  "set_number": "<XXX du XXX/YYY, sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY integer ou null>,
  "language": "<JP|EN|FR|DE|IT|ES|PT|KO|ZH selon la langue imprimée>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <numéro national du Pokédex (1-1025) si c'est une carte Pokémon, null pour Trainers/Energies/Stadium/etc>,
  "pokemon_name_fr": "<nom français standard du Pokémon (ex: 'Gruikui' pour チャオブー / Tepig), null si non-Pokémon ou si tu n'es pas sûr du nom français>",
  "set_name": "<nom de l'extension tel qu'imprimé en bas de la carte si visible (ex: 'ホワイトフレア', 'White Flare', 'Battle Partners'), null si non visible>",
  "set_name_fr": "<nom français de cette extension (ex: 'Combat de Maîtres'), null si tu n'es pas sûr>"
}"""


@dataclass
class BatchOcrResult:
    request_id: str
    ocr: dict[str, Any] | None
    error: str | None


def build_request_payload(image_bytes: bytes, request_id: str) -> dict[str, Any]:
    """Build a single request entry for the batch payload."""
    return {
        "request_id": request_id,
        "request": {
            "contents": [
                {
                    "parts": [
                        {"text": PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        },
    }


def submit_batch(api_key: str, requests_payload: list[dict[str, Any]]) -> str:
    """POST the batch payload and return the operation name (e.g. 'operations/abc123')."""
    url = f"{GEMINI_BASE}:batchGenerateContent?key={api_key}"
    res = requests.post(url, json={"requests": requests_payload}, timeout=60)
    res.raise_for_status()
    body = res.json()
    op_name = body.get("name")
    if not op_name:
        raise RuntimeError(f"Batch submit did not return operation name: {body}")
    return op_name


def poll_until_done(api_key: str, operation_name: str) -> dict[str, Any]:
    """Poll the operation every POLL_INTERVAL_SEC until done. Returns the final response payload."""
    url = f"https://generativelanguage.googleapis.com/v1beta/{operation_name}?key={api_key}"
    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        res = requests.get(url, timeout=30)
        res.raise_for_status()
        body = res.json()
        if body.get("done"):
            return body.get("response", {})
        time.sleep(POLL_INTERVAL_SEC)
    raise TimeoutError(f"Batch operation {operation_name} did not complete within {POLL_TIMEOUT_SEC}s")


def parse_batch_response(raw: dict[str, Any]) -> list[BatchOcrResult]:
    """Convert the batch response into a list of BatchOcrResult."""
    results: list[BatchOcrResult] = []
    for entry in raw.get("responses", []):
        rid = entry.get("request_id", "")
        response = entry.get("response", {})
        if "error" in response:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=str(response["error"].get("message") or response["error"])))
            continue
        try:
            parts = response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = next((p.get("text") for p in parts if "text" in p), None)
            if text is None:
                results.append(BatchOcrResult(request_id=rid, ocr=None, error="no text part in response"))
                continue
            ocr = json.loads(text)
            results.append(BatchOcrResult(request_id=rid, ocr=ocr, error=None))
        except json.JSONDecodeError as e:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=f"json parse failed: {e}"))
        except Exception as e:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=str(e)))
    return results
