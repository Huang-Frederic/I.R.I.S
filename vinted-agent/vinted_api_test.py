import json
import logging
import pytest
from unittest.mock import MagicMock, patch, mock_open
from vinted_api import VintedClient, CONDITION_MAP, _parse_csrf, _log_request_failure

def test_condition_map_covers_all_iris_conditions():
    for cond in ['NM', 'EX', 'GD', 'PL', 'PO']:
        assert cond in CONDITION_MAP, f"Missing condition: {cond}"

def test_condition_map_values_are_ints():
    for k, v in CONDITION_MAP.items():
        assert isinstance(v, int), f"{k} → {v} should be int"

def test_build_listing_payload():
    client = VintedClient.__new__(VintedClient)
    payload = client._build_listing_payload(
        temp_uuid="test-uuid",
        photo_id=12345,
        title="Carte Pokémon Pikachu [JP]",
        description="Très belle carte.",
        price=5.0,
        condition="NM",
    )
    assert payload["item"]["title"] == "Carte Pokémon Pikachu [JP]"
    assert payload["item"]["price"] == 5.0
    assert payload["item"]["catalog_id"] == 4875
    assert payload["item"]["brand_id"] == 191646
    assert payload["item"]["assigned_photos"] == [{"id": 12345, "orientation": 0}]
    assert payload["item"]["item_attributes"][0]["ids"] == [CONDITION_MAP["NM"]]
    assert payload["upload_session_id"] == "test-uuid"

def test_parse_csrf_from_html():
    html = '<html><head><meta name="csrf-token" content="abc-123-def"/></head></html>'
    assert _parse_csrf(html) == "abc-123-def"

def test_parse_csrf_returns_none_when_missing():
    assert _parse_csrf("<html></html>") is None

def test_log_request_failure_logs_the_last_response_when_present(caplog):
    resp = MagicMock(status_code=302, url="https://www.vinted.fr/session-refresh", text="challenge body")
    resp.headers.get.return_value = "https://www.vinted.fr/items/new"
    e = Exception("Maximum (30) redirects followed")
    e.response = resp

    with caplog.at_level(logging.ERROR):
        _log_request_failure(logging.getLogger("test"), "refresh_csrf", e)

    assert "302" in caplog.text
    assert "session-refresh" in caplog.text

def test_log_request_failure_does_not_crash_when_no_response_is_captured(caplog):
    e = Exception("Connection reset")

    with caplog.at_level(logging.ERROR):
        _log_request_failure(logging.getLogger("test"), "refresh_csrf", e)

    assert "no response captured" in caplog.text
