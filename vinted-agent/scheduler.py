# vinted-agent/scheduler.py
"""Pure decision logic for autonomous posting: no I/O, no Supabase client —
everything it needs is passed in, so it's testable without a running agent.
"""
from datetime import datetime, time


def _block_for(now: datetime) -> str:
    """'weekend' for Saturday/Sunday, 'weekday' otherwise. Python's
    `datetime.weekday()` is 0=Monday..6=Sunday, so Sat/Sun are >= 5."""
    return "weekend" if now.weekday() >= 5 else "weekday"


def _current_window_end(now: datetime, schedule_rows: list[dict]) -> time | None:
    """End time of the schedule row `now` currently falls inside, or None if
    it's outside every window today. Also doubles as the in-a-window check —
    the jitter gate below needs this end time to know how much window is
    left, not just a yes/no."""
    todays_rows = [r for r in schedule_rows if r["block"] == _block_for(now)]
    now_time = now.time()
    for row in todays_rows:
        starts = time.fromisoformat(row["starts_at"])
        ends = time.fromisoformat(row["ends_at"])
        if starts <= now_time <= ends:
            return ends
    return None


def sort_repost_candidates(candidates: list[dict]) -> list[dict]:
    """Sorts repost candidates by their manual `repost_position` override
    first (missing/None sorts last), falling back to `vinted_posted_at`
    ascending — a manual reorder from the monitoring UI takes priority over
    staleness, but only for items the user actually repositioned."""
    return sorted(
        candidates,
        key=lambda r: (r.get("repost_position") is None, r.get("repost_position") or 0, r["vinted_posted_at"]),
    )


def decide_next_action(
    now: datetime,
    schedule_rows: list[dict],
    jobs_today_count: int,
    daily_quota: int,
    queue_rows: list[dict],
    repost_candidates: list[dict],
    poll_interval_seconds: float = 300,
    jitter: float | None = None,
) -> dict | None:
    """
    Schedule rows are keyed by `block` ('weekday' Mon-Fri or 'weekend'
    Sat+Sun) — see `_block_for`.

    Priority: a fully-drained new-post queue is required before any repost
    is chosen — never both in the same tick, and never a repost while the
    queue still has something.

    `jitter` is the caller's own `random.random()` draw, injected rather than
    called internally so this stays a pure, deterministically testable
    function. Left as None (the default), a decision fires the moment it's
    available — every test above this section relies on that. When the
    caller passes a real draw, firing is gated by a probability of
    `poll_interval_seconds / time_left_in_window`, so the same daily quota
    gets spread across the whole window instead of always bursting out in
    the first few ticks after it opens — the probability climbs to 1.0 as
    the window's close approaches, so the day's quota still isn't missed.
    """
    window_end = _current_window_end(now, schedule_rows)
    if window_end is None:
        return None
    if jobs_today_count >= daily_quota:
        return None
    if queue_rows:
        front = queue_rows[0]
        action = {
            "action": "post",
            "card_id": front.get("card_id"),
            "lot_id": front.get("lot_id"),
            "other_item_id": front.get("other_item_id"),
        }
    elif repost_candidates:
        oldest = repost_candidates[0]
        action = {
            "action": "repost",
            "card_id": oldest.get("card_id"),
            "lot_id": oldest.get("lot_id"),
            "other_item_id": oldest.get("other_item_id"),
        }
    else:
        return None

    if jitter is not None:
        seconds_left = (datetime.combine(now.date(), window_end) - now).total_seconds()
        fire_probability = min(1.0, poll_interval_seconds / max(seconds_left, 1.0))
        if jitter > fire_probability:
            return None
    return action


def should_requeue(target_column: str, item: dict | None, already_listed: bool) -> bool:
    """Whether a failed post/repost job's item belongs back in its user's
    new-post queue — the same rule lib/vinted/queue-sync.ts and
    lib/vinted/other-item-queue-sync.ts use to keep an item queued: still for
    sale, not already online on that user's account, for a card a price the
    user confirmed (`price_confirmed_at`, see lib/vinted/queue-eligibility.ts),
    and for a lot or an item a price at all (lib/vinted/lot-queue-sync.ts,
    other-item-queue-sync.ts).
    `target_column` is the job's target: "card_id", "lot_id" or "other_item_id"."""
    if item is None or already_listed:
        return False
    if item.get("status") != "for_sale":
        return False
    if target_column == "card_id" and item.get("price_confirmed_at") is None:
        return False
    if target_column in ("lot_id", "other_item_id") and not item.get("price"):
        return False
    return True


POKEMON_BRAND_ID = 191646


def queue_group_key(row: dict) -> str:
    """The /vinted/bot page's group for one queue row — lib/vinted/group-key.ts
    plus useMonitoringData's flat 'other-items' group. A lot's label comes from
    lots.brand_label, which the app fills from the same BRAND_LABELS table."""
    if row.get("other_item_id"):
        return "other-items"
    if row.get("card_id"):
        return f"Pokémon {(row.get('cards') or {}).get('language') or '?'}"
    lot = row.get("lots") or {}
    if lot.get("brand_id") in (None, POKEMON_BRAND_ID):
        return "Pokémon"
    return lot.get("brand_label") or "Autres"


def pick_queue_front(rows: list[dict], group_priority: list[str]) -> dict | None:
    """The row to post next: the lowest position in the highest-priority group
    (vinted_bot_config.group_priority) that still has rows, else the lowest
    position overall — the first card the /vinted/bot page shows
    (lib/vinted/group-sort.ts), which used to be display-only."""
    if not rows:
        return None
    rank = {key: i for i, key in enumerate(group_priority)}
    return min(rows, key=lambda r: (rank.get(queue_group_key(r), len(group_priority)), r.get("position") or 0))
