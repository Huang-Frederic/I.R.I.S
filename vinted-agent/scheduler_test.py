# vinted-agent/scheduler_test.py
from datetime import datetime
from scheduler import decide_next_action, sort_repost_candidates

MONDAY_NOON = datetime(2026, 9, 21, 12, 0)  # a Monday
SCHEDULE_WEEKDAY = [{"day_of_week": 1, "starts_at": "11:00:00", "ends_at": "13:00:00"}]
QUEUE_ONE_CARD = [{"card_id": "card-1", "lot_id": None, "position": 1}]
NO_REPOSTS = []
ONE_REPOST = [{"card_id": "old-card", "lot_id": None}]


def test_returns_none_outside_any_scheduled_window():
    outside_window = datetime(2026, 9, 21, 15, 0)  # 15:00, window is 11-13
    result = decide_next_action(outside_window, SCHEDULE_WEEKDAY, 0, 8, QUEUE_ONE_CARD, NO_REPOSTS)
    assert result is None


def test_returns_none_when_todays_quota_is_already_used():
    result = decide_next_action(MONDAY_NOON, SCHEDULE_WEEKDAY, 8, 8, QUEUE_ONE_CARD, ONE_REPOST)
    assert result is None


def test_posts_the_front_of_the_queue_when_in_window_with_quota_left():
    result = decide_next_action(MONDAY_NOON, SCHEDULE_WEEKDAY, 3, 8, QUEUE_ONE_CARD, ONE_REPOST)
    assert result == {"action": "post", "card_id": "card-1", "lot_id": None}


def test_falls_back_to_a_repost_when_the_new_post_queue_is_empty():
    result = decide_next_action(MONDAY_NOON, SCHEDULE_WEEKDAY, 3, 8, [], ONE_REPOST)
    assert result == {"action": "repost", "card_id": "old-card", "lot_id": None}


def test_returns_none_when_queue_and_reposts_are_both_empty():
    result = decide_next_action(MONDAY_NOON, SCHEDULE_WEEKDAY, 3, 8, [], NO_REPOSTS)
    assert result is None


def test_a_day_with_no_schedule_rows_never_posts():
    sunday = datetime(2026, 9, 20, 12, 0)  # no rows for day_of_week 0 in SCHEDULE_WEEKDAY
    result = decide_next_action(sunday, SCHEDULE_WEEKDAY, 0, 8, QUEUE_ONE_CARD, NO_REPOSTS)
    assert result is None


def test_sort_repost_candidates_prioritizes_a_manual_position_over_an_older_unpositioned_item():
    older_no_position = {"card_id": "old", "lot_id": None, "vinted_posted_at": "2026-01-01T00:00:00", "repost_position": None}
    newer_with_position = {"card_id": "new", "lot_id": None, "vinted_posted_at": "2026-09-01T00:00:00", "repost_position": 1}
    result = sort_repost_candidates([older_no_position, newer_with_position])
    assert result[0]["card_id"] == "new"


def test_sort_repost_candidates_respects_relative_order_between_two_manual_positions():
    position_2 = {"card_id": "b", "lot_id": None, "vinted_posted_at": "2026-01-01T00:00:00", "repost_position": 2}
    position_1 = {"card_id": "a", "lot_id": None, "vinted_posted_at": "2026-06-01T00:00:00", "repost_position": 1}
    result = sort_repost_candidates([position_2, position_1])
    assert [c["card_id"] for c in result] == ["a", "b"]


def test_sort_repost_candidates_falls_back_to_staleness_when_no_position_is_set():
    newer = {"card_id": "new", "lot_id": None, "vinted_posted_at": "2026-09-01T00:00:00", "repost_position": None}
    older = {"card_id": "old", "lot_id": None, "vinted_posted_at": "2026-01-01T00:00:00", "repost_position": None}
    result = sort_repost_candidates([newer, older])
    assert [c["card_id"] for c in result] == ["old", "new"]
