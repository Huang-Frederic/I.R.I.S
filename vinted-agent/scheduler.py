# vinted-agent/scheduler.py
"""Pure decision logic for autonomous posting: no I/O, no Supabase client —
everything it needs is passed in, so it's testable without a running agent.
"""
from datetime import datetime, time


def _in_a_window(now: datetime, schedule_rows: list[dict]) -> bool:
    todays_rows = [r for r in schedule_rows if r["day_of_week"] == (now.weekday() + 1) % 7]
    now_time = now.time()
    for row in todays_rows:
        starts = time.fromisoformat(row["starts_at"])
        ends = time.fromisoformat(row["ends_at"])
        if starts <= now_time <= ends:
            return True
    return False


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
) -> dict | None:
    """
    day_of_week convention: 0 = Sunday, matching Postgres's own `extract(dow
    from ...)` — Python's `datetime.weekday()` returns 0 = Monday, hence the
    `(now.weekday() + 1) % 7` conversion.

    Priority: a fully-drained new-post queue is required before any repost
    is chosen — never both in the same tick, and never a repost while the
    queue still has something.
    """
    if not _in_a_window(now, schedule_rows):
        return None
    if jobs_today_count >= daily_quota:
        return None
    if queue_rows:
        front = queue_rows[0]
        return {"action": "post", "card_id": front["card_id"], "lot_id": front["lot_id"]}
    if repost_candidates:
        oldest = repost_candidates[0]
        return {"action": "repost", "card_id": oldest["card_id"], "lot_id": oldest["lot_id"]}
    return None
