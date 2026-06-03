import os
import sys
import time
import logging
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

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
IRIS_USER_ID = os.environ["IRIS_USER_ID"]


def get_card(supabase: Client, card_id: str) -> dict | None:
    res = supabase.table("cards").select(
        "id,card_name,image_url,tcg_image_url,suggested_price,cm_price_low,cm_price_avg,condition"
    ).eq("id", card_id).single().execute()
    return res.data


def pick_price(card: dict) -> float:
    for field in ["suggested_price", "cm_price_low", "cm_price_avg"]:
        if card.get(field) is not None:
            return float(card[field])
    return 1.0


def process_job(supabase: Client, vinted: VintedClient, job: dict) -> None:
    job_id = job["id"]
    card_id = job["card_id"]
    log.info("Processing job %s for card %s", job_id, card_id)

    supabase.table("vinted_post_jobs").update({
        "status": "processing"
    }).eq("id", job_id).execute()

    card = get_card(supabase, card_id)
    if not card:
        _fail_job(supabase, job_id, card_id, "Card not found")
        return

    image_url = card.get("image_url") or card.get("tcg_image_url")
    if not image_url:
        _fail_job(supabase, job_id, card_id, "No image available")
        return

    condition = card.get("condition", "GD")
    if condition not in CONDITION_MAP:
        condition = "GD"

    title = card["card_name"][:80]
    description = f"{card['card_name']}\nÉtat : {condition}"
    price = pick_price(card)

    try:
        listing_id = vinted.create_listing(
            title=title,
            description=description,
            price=price,
            condition=condition,
            image_url=image_url,
        )
    except Exception as e:
        log.error("Vinted API error for card %s: %s", card_id, e)
        _fail_job(supabase, job_id, card_id, str(e))
        return

    now = datetime.utcnow().isoformat()
    supabase.table("cards").update({
        "vinted_listing_id": listing_id,
        "vinted_posted_at": now,
        "vinted_post_error": None,
    }).eq("id", card_id).execute()

    supabase.table("vinted_post_jobs").update({
        "status": "done",
        "processed_at": now,
    }).eq("id", job_id).execute()

    log.info("Card %s posted → Vinted listing %s", card_id, listing_id)


def _fail_job(supabase: Client, job_id: str, card_id: str, error: str) -> None:
    now = datetime.utcnow().isoformat()
    supabase.table("vinted_post_jobs").update({
        "status": "error", "error": error, "processed_at": now
    }).eq("id", job_id).execute()
    supabase.table("cards").update({
        "vinted_post_error": error
    }).eq("id", card_id).execute()
    log.error("Job %s failed: %s", job_id, error)


def main() -> None:
    log.info("Starting Vinted agent…")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    vinted = VintedClient()

    vinted.refresh_csrf()
    log.info("CSRF token acquired")

    def on_job(payload: dict) -> None:
        record = payload.get("data", {}).get("record", {})
        if record.get("status") == "pending":
            process_job(supabase, vinted, record)

    channel = (
        supabase.realtime.channel("vinted_jobs")
        .on_postgres_changes(
            event="INSERT",
            schema="public",
            table="vinted_post_jobs",
            callback=on_job,
        )
        .subscribe()
    )

    log.info("Listening for posting jobs… (Ctrl+C to stop)")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Shutting down")
        channel.unsubscribe()


if __name__ == "__main__":
    main()
