import asyncio
import json
import os
import random
import sys
import logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from supabase import acreate_client, AsyncClient
from realtime.types import RealtimeSubscribeStates

from vinted_api import VintedClient, ListingGoneError
from vinted_api import CONDITION_MAP, CARD_LOTS_CATALOG_ID, POKEMON_BRAND_ID

load_dotenv()


class _IrisFormatter(logging.Formatter):
    _C   = sys.stdout.isatty()
    _DIM = "\033[90m" if _C else ""
    _YEL = "\033[93m" if _C else ""
    _RED = "\033[91m" if _C else ""
    _RST = "\033[0m"  if _C else ""

    def format(self, record: logging.LogRecord) -> str:
        ts  = self.formatTime(record, "%H:%M:%S")
        msg = record.getMessage()
        if record.levelno >= logging.ERROR:
            return f"{self._DIM}{ts}{self._RST}  {self._RED}{msg}{self._RST}"
        if record.levelno >= logging.WARNING:
            return f"{self._DIM}{ts}{self._RST}  {self._YEL}{msg}{self._RST}"
        return f"{self._DIM}{ts}{self._RST}  {msg}"


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_IrisFormatter())
logging.root.handlers = [_handler]
logging.root.setLevel(logging.INFO)
log = logging.getLogger(__name__)
# Silence noisy HTTP / websocket loggers from supabase-py internals
for _lib in ("httpx", "httpcore", "websockets", "realtime"):
    logging.getLogger(_lib).setLevel(logging.WARNING)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Maps IRIS user_id → cookies file — each user posts to their own Vinted account
_users_path = Path(__file__).parent / "vinted_users.json"
VINTED_USERS: dict[str, str] = json.loads(_users_path.read_text()) if _users_path.exists() else {}

# Global lock: only one Vinted API session runs at a time across all users.
# Prevents DataDome from seeing concurrent requests from the same IP.
_global_vinted_lock: asyncio.Lock | None = None
_user_locks: dict[str, asyncio.Lock] = {}

# ---------------------------------------------------------------------------
# Title / description — Python port of lib/utils/vinted-template.ts
# ---------------------------------------------------------------------------

MAX_TITLE_LENGTH = 80

LANGUAGE_FLAGS = {
    "JP": "🇯🇵", "EN": "🇬🇧", "FR": "🇫🇷", "DE": "🇩🇪", "IT": "🇮🇹",
    "ES": "🇪🇸", "KO": "🇰🇷", "PT": "🇵🇹", "ZH": "🇨🇳", "CN": "🇨🇳",
}

LANGUAGE_FEMALE = {
    "JP": "Japonaise", "EN": "Anglaise", "FR": "Française", "DE": "Allemande",
    "IT": "Italienne", "ES": "Espagnole", "KO": "Coréenne", "PT": "Portugaise",
    "ZH": "Chinoise", "CN": "Chinoise",
}

CONDITION_LABEL = {
    "NM": "Très bon état (Near Mint)",
    "EX": "Excellent (EX)",
    "GD": "Bon état (Good)",
    "PL": "Joué (Played)",
    "PO": "Mauvais état (Poor)",
}

VARIANT_LABEL = {
    "pokeball": "Poké Ball",
    "masterball": "Master Ball",
    "reverse_holo": "Reverse Holo",
    "stamp": "Stamp",
    "promo": "Promo",
}

FOOTER_LINES = [
    "🛡️ Carte envoyée sous sleeve + toploader !",
    "🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦",
    "🤝 Remise en main propre possible sur Paris / 92 / 95",
    "📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !",
    "",
    "🃏 Plein d'autres cartes sont disponibles sur mon profil !",
    "📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑",
]


def _variant_label(variant: str | None) -> str | None:
    if not variant:
        return None
    return VARIANT_LABEL.get(variant, variant)


def _strip_cjk(text: str) -> str:
    """Remove CJK (Japanese/Chinese) characters and tidy up resulting empty parens.

    NFKC normalization runs first so fullwidth ASCII (－, （, ） …) and halfwidth
    katakana are folded to their regular equivalents before the CJK regex fires.
    """
    import re
    import unicodedata
    text = unicodedata.normalize('NFKC', text)
    cleaned = re.sub(
        r'[⺀-⻿　-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿︰-﹏]',
        '', text,
    )
    cleaned = re.sub(r'\(\s*\)', '', cleaned)
    return re.sub(r'\s+', ' ', cleaned).strip()


def _strip_paren(name: str) -> str:
    import re
    return re.sub(r'\s*\([^)]+\)\s*', ' ', name).strip()


def _normalize_caps(text: str) -> str:
    """Convert ALL-CAPS words of 4+ letters to Title case for Vinted title rules.
    VMAX → Vmax, VSTAR → Vstar, VUNION → Vunion. Leaves GX, EX, V as-is."""
    import re
    return re.sub(r'\b([A-Z]{4,})\b', lambda m: m.group(1).capitalize(), text)


def _strip_denominator(set_number: str | None) -> str | None:
    if not set_number:
        return None
    slash = set_number.find('/')
    return set_number[:slash].strip() if slash >= 0 else set_number.strip()


def build_title(card: dict) -> str:
    variant = _variant_label(card.get("variant"))
    raw_name = card.get("card_name", "")
    full_name = _normalize_caps(_strip_cjk(raw_name))
    # If stripping CJK empties the name (all-kanji card), fall back to raw
    if not full_name.strip():
        full_name = raw_name.strip()
    stripped_name = _strip_paren(full_name)
    set_number_short = _strip_denominator(card.get("set_number"))
    set_code = card.get("set_code")
    set_name = _normalize_caps(_strip_cjk(card.get("set_name") or ""))
    lang = card.get("language", "FR")

    set_code_parts = [p for p in [set_code, set_number_short] if p]
    if set_name:
        set_seg_full = f" - {set_name}" + (f" ({' '.join(set_code_parts)})" if set_code_parts else "")
    elif set_code:
        set_seg_full = f" - ({' '.join(set_code_parts)})"
    else:
        set_seg_full = ""

    set_seg_code = f" - ({' '.join(set_code_parts)})" if set_code_parts else ""
    variant_seg = f" {variant}" if variant else ""
    lang_seg = f" [{lang}]"

    ladder = [
        f"Carte Pokémon {stripped_name}{variant_seg}{set_seg_full}{lang_seg}",
        f"{stripped_name}{variant_seg}{set_seg_full}{lang_seg}",
        f"{stripped_name}{variant_seg}{set_seg_code}{lang_seg}",
        f"{stripped_name}{variant_seg}{lang_seg}",
        f"{stripped_name}{lang_seg}",
    ]

    for candidate in ladder:
        if len(candidate) <= MAX_TITLE_LENGTH:
            return candidate

    tail = f" [{lang}]"
    budget = MAX_TITLE_LENGTH - len(tail)
    return stripped_name[:max(1, budget)] + tail


def build_description(card: dict) -> str:
    variant = _variant_label(card.get("variant"))
    raw_name = card.get("card_name", "")
    full_name = _normalize_caps(_strip_cjk(raw_name))
    if not full_name.strip():
        full_name = raw_name.strip()
    set_number_short = _strip_denominator(card.get("set_number"))
    set_code = card.get("set_code")
    set_name = _normalize_caps(_strip_cjk(card.get("set_name") or ""))
    lang = card.get("language", "FR")
    condition = card.get("condition", "GD")
    notes = card.get("notes") or ""

    set_code_parts = [p for p in [set_code, set_number_short] if p]
    if set_name:
        set_segment = set_name + (f" ({' '.join(set_code_parts)})" if set_code_parts else "")
    elif set_code_parts:
        set_segment = f"({' '.join(set_code_parts)})"
    else:
        set_segment = ""

    first_line = f"✨ Carte Pokémon {full_name}"
    if variant:
        first_line += f" {variant}"
    if set_segment:
        first_line += f" - {set_segment}"
    first_line += f" [{lang}]"

    flag = LANGUAGE_FLAGS.get(lang, "")
    lang_name = LANGUAGE_FEMALE.get(lang, lang)
    condition_label = CONDITION_LABEL.get(condition, condition)

    lines = [
        first_line,
        f"📘 Version {lang_name} {flag}",
        f"✅ État : {condition_label}.",
    ]

    if notes.strip():
        lines.append("")
        lines.append(f"[Notes : {notes.strip()}]")

    lines.append("")
    lines.extend(FOOTER_LINES)
    return "\n".join(lines)


LOT_CONDITION_LABEL = {
    "MT": "Mint", "NM": "Near Mint", "EX": "Excellent",
    "GD": "Good", "LP": "Light Played", "PL": "Played", "PO": "Poor",
}

# Maps brand_id → display label used in title/description.
# "Sans marque" (id=1) and unknown brands fall back to lot.brand_name.
BRAND_LABEL_BY_ID: dict[int, str] = {
    191646: "Pokémon",
    89766: "One Piece",
    399547: "Magic",
    287189: "Lorcana",
    312702: "Yu-Gi-Oh!",
    284189: "Digimon",
    350491: "Dragon Ball",
    12800798: "Wankul",
    509120: "Riftbound",
}

LANGUAGE_TITLE_CODE = {
    "JP": "JP", "EN": "EN", "FR": "FR", "DE": "DE", "IT": "IT",
    "ES": "ES", "KO": "KO", "PT": "PT", "ZH": "CN", "CN": "CN",
}


def _lot_brand_label(lot: dict) -> str:
    # Prefer the stored display label (e.g. "Riftbound", "One Piece").
    # "Sans marque" and "Autre" are not user-facing labels — discard them.
    label = (lot.get("brand_label") or "").strip()
    if label and label not in ("Sans marque", "Autre"):
        return label
    brand_id = lot.get("brand_id")
    if brand_id and brand_id in BRAND_LABEL_BY_ID:
        return BRAND_LABEL_BY_ID[brand_id]
    return ""


def _resolve_is_lot(lot: dict) -> bool:
    stored = lot.get("is_lot")
    if stored is not None:
        return bool(stored)
    return (lot.get("catalog_id") or CARD_LOTS_CATALOG_ID) == CARD_LOTS_CATALOG_ID


def build_lot_title(lot: dict) -> str:
    name = lot.get("name") or "Lot"
    lang = lot.get("language") or "JP"
    code = LANGUAGE_TITLE_CODE.get(lang, lang)
    brand_label = _lot_brand_label(lot)

    is_lot = _resolve_is_lot(lot)
    type_prefix = "Lot de Cartes" if is_lot else "Carte"
    brand_part = f" {brand_label}" if brand_label else ""
    full = f"{type_prefix}{brand_part} {name} [{code}]"
    if len(full) <= 80:
        return full.strip()
    short = f"{type_prefix} {name} [{code}]"
    if len(short) <= 80:
        return short.strip()
    return f"{name} [{code}]"[:80].strip()


def build_lot_description(lot: dict) -> str:
    name = lot.get("name") or "Lot"
    lang = lot.get("language") or "JP"
    code = LANGUAGE_TITLE_CODE.get(lang, lang)
    cond = lot.get("condition") or "NM"
    cond_label = LOT_CONDITION_LABEL.get(cond, cond)
    extra = (lot.get("extra_description") or "").strip()
    brand_label = _lot_brand_label(lot)

    is_lot = _resolve_is_lot(lot)
    type_prefix = "Lot de Cartes" if is_lot else "Carte"
    brand_part = f" {brand_label}" if brand_label else ""
    title = f"{type_prefix}{brand_part} {name} [{code}]".strip()

    lang_name = LANGUAGE_FEMALE.get(lang, lang)
    lang_flag = LANGUAGE_FLAGS.get(lang, "")
    lang_line = (
        f"Cartes officielles {lang_name} {lang_flag}"
        if is_lot
        else f"Version {lang_name} {lang_flag}"
    )

    extra_block = f"\n📝 {extra}\n" if extra else ""

    return (
        f"✨ {title}\n"
        f"📘 {lang_line}\n"
        f"✅ État : {cond_label}, carte en excellent état (voir photos).\n"
        f"{extra_block}\n"
        f"🛡️ Chaque carte est envoyée sous sleeve + toploader !\n"
        f"🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦\n"
        f"🤝 Remise en main propre possible sur Paris / 92 / 95\n"
        f"📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !\n"
        f"\n"
        f"🃏 Plein d'autres cartes sont disponibles sur mon profil !\n"
        f"📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑"
    )


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

async def get_card(supabase: AsyncClient, card_id: str) -> dict | None:
    res = await supabase.table("cards").select(
        "id,card_name,image_url,tcg_image_url,"
        "suggested_price,cm_price_low,cm_price_avg,"
        "condition,language,variant,set_name,set_code,set_number,notes"
    ).eq("id", card_id).single().execute()
    return res.data


def pick_price(card: dict) -> float:
    for field in ["suggested_price", "cm_price_low", "cm_price_avg"]:
        if card.get(field) is not None:
            return float(card[field])
    return 1.0


async def get_lot(supabase: AsyncClient, lot_id: str) -> dict | None:
    res = await supabase.table("lots").select(
        "id,name,language,condition,extra_description,price,photo_urls,"
        "catalog_id,brand_id,brand_name,brand_label,is_lot"
    ).eq("id", lot_id).single().execute()
    return res.data


def pick_lot_price(lot: dict) -> float:
    if lot.get("price") is not None:
        return float(lot["price"])
    return 1.0


async def process_job(supabase: AsyncClient, vinted: VintedClient, job: dict) -> None:
    job_id  = job["id"]
    card_id = job["card_id"]
    job_type = job.get("job_type", "post")
    short   = job_id[:8]
    log.info("▶  [carte] %s — job %s", job_type, short)

    if job_type == "repost":
        user_id = job.get("user_id")
        meta = await supabase.table("card_listings").select("vinted_listing_id") \
            .eq("card_id", card_id).eq("user_id", user_id).limit(1).execute()
        old_listing_id = (meta.data[0] if meta.data else {}).get("vinted_listing_id")
        if old_listing_id:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, vinted.delete_listing, old_listing_id)
                log.info("🗑  Annonce #%s supprimée", old_listing_id)
            except ListingGoneError:
                log.warning("~  Annonce #%s introuvable sur Vinted — on reposte quand même", old_listing_id)
            except Exception as e:
                log.error("❌  Delete #%s échoué — job annulé : %s", old_listing_id, e)
                await _fail_job(supabase, job_id, card_id, f"Delete échoué: {e}")
                return
            # Clear the old ID regardless of whether we deleted it or it was already gone
            await supabase.table("card_listings").update({
                "vinted_listing_id": None, "vinted_posted_at": None,
            }).eq("card_id", card_id).eq("user_id", user_id).execute()
        delay = random.uniform(30, 90)
        log.info("⏳  Cooldown %.0fs avant repost…", delay)
        await asyncio.sleep(delay)

    # Guard: skip if another job already posted this card for the same user
    user_id = job.get("user_id")
    if user_id and job_type == "post":
        existing = await supabase.table("card_listings").select("vinted_listing_id") \
            .eq("card_id", card_id).eq("user_id", user_id).limit(1).execute()
        if existing.data and existing.data[0].get("vinted_listing_id"):
            log.info("⏭  Carte déjà publiée (#%s) — job ignoré", existing.data[0]["vinted_listing_id"])
            await supabase.table("vinted_post_jobs").update(
                {"status": "done", "processed_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", job_id).execute()
            return

    card = await get_card(supabase, card_id)
    if not card:
        await _fail_job(supabase, job_id, card_id, "Card not found")
        return

    image_url = card.get("image_url") or card.get("tcg_image_url")
    if not image_url:
        await _fail_job(supabase, job_id, card_id, "No image available")
        return

    condition = card.get("condition", "GD")
    if condition not in CONDITION_MAP:
        condition = "GD"

    title = build_title(card)
    description = build_description(card)
    price = pick_price(card)

    log.info("📋  %s — %.2f€", title, price)

    try:
        await asyncio.sleep(random.uniform(0.5, 1.5))
        photo_id = await asyncio.get_running_loop().run_in_executor(
            None, vinted.upload_photo, image_url
        )
        log.info("📷  Photo uploadée")
        await asyncio.sleep(random.uniform(2.0, 4.0))
        listing_id = await asyncio.get_running_loop().run_in_executor(
            None, lambda: vinted.create_listing(
                title=title,
                description=description,
                price=price,
                condition=condition,
                image_urls=[image_url],
                photo_ids=[photo_id],
            )
        )
    except Exception as e:
        log.error("❌  Erreur API Vinted : %s", e)
        await _fail_job(supabase, job_id, card_id, str(e))
        return

    now = datetime.now(timezone.utc).isoformat()
    if user_id:
        try:
            await supabase.table("card_listings").upsert({
                "card_id": card_id,
                "user_id": user_id,
                "listed_at": now,
                "vinted_listing_id": listing_id,
                "vinted_posted_at": now,
            }).execute()
        except Exception as e:
            log.error("❌  card_listings upsert — carte IS sur Vinted (#%s) mais IRIS désynchronisé : %s", listing_id, e)
    else:
        log.warning("⚠  Pas de user_id — card_listings non mis à jour ; carte IS sur Vinted (#%s)", listing_id)

    await supabase.table("vinted_post_jobs").update({
        "status": "done", "processed_at": now,
    }).eq("id", job_id).execute()
    log.info("✅  Publié → Vinted #%s", listing_id)


async def process_lot_job(supabase: AsyncClient, vinted: VintedClient, job: dict) -> None:
    job_id  = job["id"]
    lot_id  = job["lot_id"]
    user_id = job.get("user_id")
    job_type = job.get("job_type", "post")
    short   = job_id[:8]
    log.info("▶  [lot] %s — job %s", job_type, short)

    if job_type == "repost" and user_id:
        meta = await supabase.table("lot_listings").select("vinted_listing_id") \
            .eq("lot_id", lot_id).eq("user_id", user_id).limit(1).execute()
        old_listing_id = (meta.data[0] if meta.data else {}).get("vinted_listing_id")
        if old_listing_id:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, vinted.delete_listing, old_listing_id)
                log.info("🗑  Annonce #%s supprimée", old_listing_id)
            except ListingGoneError:
                log.warning("~  Annonce #%s introuvable sur Vinted — on reposte quand même", old_listing_id)
            except Exception as e:
                log.error("❌  Delete #%s échoué — job annulé : %s", old_listing_id, e)
                await _fail_job(supabase, job_id, lot_id, f"Delete échoué: {e}")
                return
            # Clear the old ID regardless of whether we deleted it or it was already gone
            await supabase.table("lot_listings").update({
                "vinted_listing_id": None, "vinted_posted_at": None,
            }).eq("lot_id", lot_id).eq("user_id", user_id).execute()
        delay = random.uniform(30, 90)
        log.info("⏳  Cooldown %.0fs avant repost…", delay)
        await asyncio.sleep(delay)

    # Guard: skip if another job already posted this lot for the same user
    if user_id and job_type == "post":
        existing = await supabase.table("lot_listings").select("vinted_listing_id") \
            .eq("lot_id", lot_id).eq("user_id", user_id).limit(1).execute()
        if existing.data and existing.data[0].get("vinted_listing_id"):
            log.info("⏭  Lot déjà publié (#%s) — job ignoré", existing.data[0]["vinted_listing_id"])
            await supabase.table("vinted_post_jobs").update(
                {"status": "done", "processed_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", job_id).execute()
            return

    lot = await get_lot(supabase, lot_id)
    if not lot:
        await _fail_job(supabase, job_id, lot_id, "Lot not found")
        return

    raw_photo_urls = lot.get("photo_urls") or []
    image_urls = [
        f"{SUPABASE_URL}/storage/v1/object/public/lot-photos/{p}"
        for p in raw_photo_urls
    ]
    if not image_urls:
        await _fail_job(supabase, job_id, lot_id, "No image available for lot")
        return

    condition = lot.get("condition", "NM")
    if condition not in CONDITION_MAP:
        condition = "NM"

    title       = build_lot_title(lot)
    description = build_lot_description(lot)
    price       = pick_lot_price(lot)
    catalog_id  = CARD_LOTS_CATALOG_ID if _resolve_is_lot(lot) else 4875
    brand_id    = lot.get("brand_id") or POKEMON_BRAND_ID
    brand       = lot.get("brand_name") or "Pokémon"

    log.info("📋  %s — %.2f€", title, price)

    try:
        await asyncio.sleep(random.uniform(0.5, 1.5))
        loop = asyncio.get_running_loop()
        photo_ids = []
        for url in image_urls:
            pid = await loop.run_in_executor(None, vinted.upload_photo, url)
            photo_ids.append(pid)
            if url != image_urls[-1]:
                await asyncio.sleep(random.uniform(1.0, 2.0))
        log.info("📷  %d photo(s) uploadée(s)", len(photo_ids))
        await asyncio.sleep(random.uniform(2.0, 4.0))
        listing_id = await loop.run_in_executor(
            None, lambda: vinted.create_listing(
                title=title,
                description=description,
                price=price,
                condition=condition,
                image_urls=image_urls,
                photo_ids=photo_ids,
                catalog_id=catalog_id,
                brand_id=brand_id,
                brand=brand,
            )
        )
    except Exception as e:
        log.error("❌  Erreur API Vinted : %s", e)
        await _fail_job(supabase, job_id, lot_id, str(e))
        return

    now = datetime.now(timezone.utc).isoformat()
    if user_id:
        try:
            await supabase.table("lot_listings").upsert({
                "lot_id": lot_id,
                "user_id": user_id,
                "listed_at": now,
                "vinted_listing_id": listing_id,
                "vinted_posted_at": now,
            }).execute()
        except Exception as e:
            log.error("❌  lot_listings upsert — lot IS sur Vinted (#%s) mais IRIS désynchronisé : %s", listing_id, e)
    else:
        log.warning("⚠  Pas de user_id — lot_listings non mis à jour ; lot IS sur Vinted (#%s)", listing_id)

    await supabase.table("vinted_post_jobs").update(
        {"status": "done", "processed_at": now}
    ).eq("id", job_id).execute()
    log.info("✅  Publié → Vinted #%s", listing_id)


async def _fail_job(supabase: AsyncClient, job_id: str, item_id: str, error: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    safe_error = "".join(c for c in str(error) if c.isprintable())[:500]
    await supabase.table("vinted_post_jobs").update({
        "status": "error", "error": safe_error, "processed_at": now
    }).eq("id", job_id).execute()
    log.error("❌  Job %s — %s", job_id[:8], error)


async def _drain_pending_jobs(supabase: AsyncClient) -> None:
    known_user_ids = list(VINTED_USERS.keys())
    if not known_user_ids:
        return
    await supabase.table("vinted_post_jobs") \
        .update({"status": "pending"}) \
        .eq("status", "processing") \
        .in_("user_id", known_user_ids).execute()
    res = await supabase.table("vinted_post_jobs") \
        .select("*").eq("status", "pending") \
        .in_("user_id", known_user_ids).execute()
    jobs = res.data or []
    if jobs:
        log.info("⟳  %d job(s) en attente au démarrage — relance", len(jobs))
    for job in jobs:
        asyncio.create_task(_dispatch_job(supabase, job))


# ---------------------------------------------------------------------------
# Job dispatcher — runs VintedClient init + refresh_csrf in a thread so that
# sync_playwright doesn't conflict with the asyncio event loop.
# ---------------------------------------------------------------------------

def _make_vinted_client(cookies_file: str) -> VintedClient:
    """Blocking: instantiate client and acquire CSRF token."""
    vinted = VintedClient(cookies_file)
    vinted.refresh_csrf()
    return vinted


async def _dispatch_job(supabase: AsyncClient, record: dict) -> None:
    global _global_vinted_lock
    if _global_vinted_lock is None:
        _global_vinted_lock = asyncio.Lock()
    user_id = record.get("user_id")
    cookies_file = VINTED_USERS.get(user_id)
    if not cookies_file:
        log.warning("⚠  Job ignoré — user %s absent de vinted_users.json", user_id)
        return
    lock = _user_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        async with _global_vinted_lock:
            claim = await supabase.table("vinted_post_jobs") \
                .update({"status": "processing"}) \
                .eq("id", record["id"]) \
                .eq("status", "pending") \
                .execute()
            if not claim.data:
                return  # already claimed by subscribe+drain race — silent skip
            try:
                loop = asyncio.get_running_loop()
                vinted = await loop.run_in_executor(None, _make_vinted_client, cookies_file)
            except Exception as e:
                log.error("❌  Session expirée pour user %s — relancer import_cookies.py : %s", user_id, e)
                item_id = record.get("card_id") or record.get("lot_id")
                await _fail_job(supabase, record["id"], item_id, "Session expirée — relance import_cookies.py")
                return
            if record.get("lot_id"):
                await process_lot_job(supabase, vinted, record)
            else:
                await process_job(supabase, vinted, record)
            await asyncio.sleep(random.uniform(20, 45))


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def _subscribe_with_retry(supabase: AsyncClient, on_job_callback):
    """Subscribe to vinted_post_jobs INSERT events, retrying with backoff on error.

    The library's built-in rejoin_timer only fires on phx_error (connection-level
    drops). A failed phx_join reply (e.g. DatabaseLackOfConnections) silently leaves
    the channel in JOINING state unless we supply a status callback and retry here.
    """
    attempt = 0
    while True:
        attempt += 1
        succeeded = False
        sub_done = asyncio.Event()

        def on_status(status, error=None):
            nonlocal succeeded
            if status == RealtimeSubscribeStates.SUBSCRIBED:
                succeeded = True
            elif status == RealtimeSubscribeStates.CHANNEL_ERROR:
                log.warning("⚠  Realtime erreur (tentative %d) : %s", attempt, error)
            elif status == RealtimeSubscribeStates.TIMED_OUT:
                log.warning("⚠  Realtime timeout (tentative %d)", attempt)
            sub_done.set()

        channel = supabase.realtime.channel("vinted_jobs")
        channel.on_postgres_changes(
            event="INSERT",
            schema="public",
            table="vinted_post_jobs",
            callback=on_job_callback,
        )
        await channel.subscribe(callback=on_status)
        await sub_done.wait()

        if succeeded:
            log.info("⚡  Connecté au Realtime Vinted%s", f" (tentative {attempt})" if attempt > 1 else "")
            return channel

        delay = min(2 ** attempt, 60)
        log.warning("⚠  Reconnexion Realtime dans %.0fs…", delay)
        await asyncio.sleep(delay)


async def _heartbeat_loop(supabase: AsyncClient) -> None:
    user_ids = list(VINTED_USERS.keys())
    if not user_ids:
        return
    while True:
        try:
            now = datetime.now(timezone.utc).isoformat()
            for uid in user_ids:
                await supabase.table("agent_heartbeats").upsert(
                    {"user_id": uid, "last_seen_at": now},
                    on_conflict="user_id",
                ).execute()
            log.info("♥  Heartbeat")
        except Exception as e:
            log.warning("⚠  Heartbeat — %s", e)
        await asyncio.sleep(30)


async def main() -> None:
    log.info("⚡  Vinted agent — %d compte(s) chargé(s)", len(VINTED_USERS))
    supabase: AsyncClient = await acreate_client(SUPABASE_URL, SUPABASE_KEY)

    def on_job(payload: dict) -> None:
        record = payload.get("data", {}).get("record", {})
        if record.get("status") == "pending":
            asyncio.create_task(_dispatch_job(supabase, record))

    channel = await _subscribe_with_retry(supabase, on_job)
    await _drain_pending_jobs(supabase)
    asyncio.create_task(_heartbeat_loop(supabase))

    log.info("⚡  En écoute… Ctrl+C pour arrêter")
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("⊗  Arrêt")
        await channel.unsubscribe()
        for uid in list(VINTED_USERS.keys()):
            try:
                await supabase.table("agent_heartbeats").delete().eq("user_id", uid).execute()
            except Exception:
                pass


if __name__ == "__main__":
    asyncio.run(main())
