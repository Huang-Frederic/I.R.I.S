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

from vinted_api import VintedClient
from vinted_api import CONDITION_MAP

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Maps IRIS user_id → cookies file — each user posts to their own Vinted account
_users_path = Path(__file__).parent / "vinted_users.json"
VINTED_USERS: dict[str, str] = json.loads(_users_path.read_text()) if _users_path.exists() else {}

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
    """Remove CJK (Japanese/Chinese) characters and tidy up resulting empty parens."""
    import re
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
    full_name = _normalize_caps(_strip_cjk(card.get("card_name", "")))
    stripped_name = _strip_paren(full_name)
    set_number_short = _strip_denominator(card.get("set_number"))
    set_code = card.get("set_code")
    set_name = card.get("set_name")
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
    full_name = _normalize_caps(_strip_cjk(card.get("card_name", "")))
    set_number_short = _strip_denominator(card.get("set_number"))
    set_code = card.get("set_code")
    set_name = card.get("set_name")
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


async def process_job(supabase: AsyncClient, vinted: VintedClient, job: dict) -> None:
    job_id = job["id"]
    card_id = job["card_id"]
    job_type = job.get("job_type", "post")
    log.info("Processing job %s for card %s (type=%s)", job_id, card_id, job_type)

    await supabase.table("vinted_post_jobs").update({
        "status": "processing"
    }).eq("id", job_id).execute()

    if job_type == "repost":
        user_id = job.get("user_id")
        meta = await supabase.table("card_listings").select("vinted_listing_id").eq("card_id", card_id).eq("user_id", user_id).limit(1).execute()
        old_listing_id = (meta.data[0] if meta.data else {}).get("vinted_listing_id")
        if old_listing_id:
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, vinted.delete_listing, old_listing_id)
                log.info("Old listing %s deleted", old_listing_id)
            except Exception as e:
                log.warning("Could not delete old listing %s: %s", old_listing_id, e)
        await supabase.table("card_listings").update({
            "vinted_listing_id": None, "vinted_posted_at": None,
        }).eq("card_id", card_id).eq("user_id", user_id).execute()
        delay = random.uniform(30, 90)
        log.info("Repost cooldown: %.0fs before reposting card %s", delay, card_id)
        await asyncio.sleep(delay)

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

    log.info("Title: %s", title)
    log.info("Price: %.2f €", price)

    try:
        # Small pause before starting — mimics page load time
        await asyncio.sleep(random.uniform(0.5, 1.5))

        photo_id = await asyncio.get_event_loop().run_in_executor(
            None, vinted.upload_photo, image_url
        )
        log.info("Photo uploaded: %s", photo_id)

        # Pause between upload and listing creation — mimics form fill time
        await asyncio.sleep(random.uniform(2.0, 4.0))

        listing_id = await asyncio.get_event_loop().run_in_executor(
            None, lambda: vinted.create_listing(
                title=title,
                description=description,
                price=price,
                condition=condition,
                image_url=image_url,
                photo_id=photo_id,
            )
        )
    except Exception as e:
        log.error("Vinted API error for card %s: %s", card_id, e)
        await _fail_job(supabase, job_id, card_id, str(e))
        return

    now = datetime.now(timezone.utc).isoformat()
    user_id_for_listing = job.get("user_id")
    if user_id_for_listing:
        try:
            await supabase.table("card_listings").upsert({
                "card_id": card_id,
                "user_id": user_id_for_listing,
                "listed_at": now,
                "vinted_listing_id": listing_id,
                "vinted_posted_at": now,
            }).execute()
        except Exception as e:
            log.error(
                "card_listings upsert failed for card %s user %s: %s "
                "— card IS on Vinted (listing %s) but IRIS status is out of sync",
                card_id, user_id_for_listing, e, listing_id,
            )
    else:
        log.warning(
            "Job %s has no user_id — card_listings not updated; card IS on Vinted (listing %s)",
            job_id, listing_id,
        )

    await supabase.table("vinted_post_jobs").update({
        "status": "done",
        "processed_at": now,
    }).eq("id", job_id).execute()

    log.info("Card %s posted → Vinted listing %s", card_id, listing_id)


async def _fail_job(supabase: AsyncClient, job_id: str, card_id: str, error: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    # Sanitize error: Postgres rejects null bytes and non-printable chars
    safe_error = "".join(c for c in str(error) if c.isprintable())[:500]
    await supabase.table("vinted_post_jobs").update({
        "status": "error", "error": safe_error, "processed_at": now
    }).eq("id", job_id).execute()
    log.error("Job %s failed: %s", job_id, error)


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
    user_id = record.get("user_id")
    cookies_file = VINTED_USERS.get(user_id)
    if not cookies_file:
        log.warning("Job skipped — user_id %s not in vinted_users.json", user_id)
        return
    try:
        loop = asyncio.get_event_loop()
        vinted = await loop.run_in_executor(None, _make_vinted_client, cookies_file)
    except Exception as e:
        log.error("Session expired for user %s — renew cookies: %s", user_id, e)
        await _fail_job(supabase, record["id"], record["card_id"],
                        "Session expirée — relance import_cookies.py")
        return
    await process_job(supabase, vinted, record)


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
                log.warning("Realtime subscription error (attempt %d): %s", attempt, error)
            elif status == RealtimeSubscribeStates.TIMED_OUT:
                log.warning("Realtime subscription timed out (attempt %d)", attempt)
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
            log.info("Subscribed to vinted_post_jobs Realtime (attempt %d)", attempt)
            return channel

        delay = min(2 ** attempt, 60)
        log.warning("Retrying Realtime subscription in %.0fs…", delay)
        await asyncio.sleep(delay)


async def main() -> None:
    log.info("Starting Vinted agent…")
    log.info("Loaded %d Vinted user(s): %s", len(VINTED_USERS), list(VINTED_USERS.keys()))
    supabase: AsyncClient = await acreate_client(SUPABASE_URL, SUPABASE_KEY)

    def on_job(payload: dict) -> None:
        record = payload.get("data", {}).get("record", {})
        log.info("Job received: card_id=%s user_id=%s status=%s",
                 record.get("card_id"), record.get("user_id"), record.get("status"))
        if record.get("status") == "pending":
            asyncio.create_task(_dispatch_job(supabase, record))

    channel = await _subscribe_with_retry(supabase, on_job)

    log.info("Listening for posting jobs… (Ctrl+C to stop)")
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("Shutting down")
        await channel.unsubscribe()


if __name__ == "__main__":
    asyncio.run(main())
