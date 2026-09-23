# vinted-agent/scheduler.py
"""Pure decision logic for autonomous posting: no I/O, no Supabase client —
everything it needs is passed in, so it's testable without a running agent.
"""
from datetime import datetime, time


def _current_window_end(now: datetime, schedule_rows: list[dict]) -> time | None:
    """End time of the schedule row `now` currently falls inside, or None if
    it's outside every window today. Also doubles as the in-a-window check —
    the jitter gate below needs this end time to know how much window is
    left, not just a yes/no."""
    todays_rows = [r for r in schedule_rows if r["day_of_week"] == (now.weekday() + 1) % 7]
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
    day_of_week convention: 0 = Sunday, matching Postgres's own `extract(dow
    from ...)` — Python's `datetime.weekday()` returns 0 = Monday, hence the
    `(now.weekday() + 1) % 7` conversion.

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
        action = {"action": "post", "card_id": front["card_id"], "lot_id": front["lot_id"]}
    elif repost_candidates:
        oldest = repost_candidates[0]
        action = {"action": "repost", "card_id": oldest["card_id"], "lot_id": oldest["lot_id"]}
    else:
        return None

    if jitter is not None:
        seconds_left = (datetime.combine(now.date(), window_end) - now).total_seconds()
        fire_probability = min(1.0, poll_interval_seconds / max(seconds_left, 1.0))
        if jitter > fire_probability:
            return None
    return action
