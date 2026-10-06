import json
import logging
import pytest
from unittest.mock import MagicMock, patch, mock_open
from vinted_api import (
    VintedClient, VintedValidationError, CONDITION_MAP, _parse_csrf, _log_request_failure,
    format_validation_errors,
)

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
        photo_ids=[12345],
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


def _payload(**overrides):
    client = VintedClient.__new__(VintedClient)
    kwargs = dict(temp_uuid="u", photo_ids=[1], title="t", description="d", price=1.0, condition="NM")
    kwargs.update(overrides)
    return client._build_listing_payload(**kwargs)["item"]

def test_build_listing_payload_sends_no_size_and_no_color_by_default():
    item = _payload()
    assert item["color_ids"] == []
    assert [a["code"] for a in item["item_attributes"]] == ["condition"]

def test_build_listing_payload_sends_size_as_a_dynamic_attribute_and_colors_top_level():
    # Matches Vinted's own upload form: color_ids is a top-level array, size
    # goes through item_attributes (x-enable-dynamic-attribute-size is set).
    item = _payload(size_id=1740, color_ids=[1, 3])
    assert item["color_ids"] == [1, 3]
    assert {"code": "size", "ids": [1740]} in item["item_attributes"]

def test_build_listing_payload_raw_condition_id_overrides_the_card_grade_map():
    # other_items store Vinted's own condition id (6 = neuf avec étiquette),
    # which has no card-grade letter equivalent.
    item = _payload(condition=None, condition_id=6)
    assert item["item_attributes"][0] == {"code": "condition", "ids": [6]}

def test_format_validation_errors_joins_vinteds_messages():
    body = {"code": 99, "message": "Erreurs trouvées", "message_code": "validation_error", "errors": [
        {"field": "size", "value": "Le champ Taille doit être renseigné"},
        {"field": "color", "value": "Le champ Couleur doit être renseigné"},
    ], "payload": {}}
    assert format_validation_errors(body) == (
        "Vinted a refusé l'annonce : Le champ Taille doit être renseigné · Le champ Couleur doit être renseigné"
    )

def test_format_validation_errors_falls_back_to_the_field_name():
    assert format_validation_errors({"errors": [{"field": "size"}]}) == "Vinted a refusé l'annonce : size"

def test_format_validation_errors_returns_none_for_other_bodies():
    assert format_validation_errors({"code": 100, "message": "Server error"}) is None
    assert format_validation_errors({"errors": []}) is None
    assert format_validation_errors(["not", "a", "dict"]) is None
    assert format_validation_errors(None) is None

def _client_with_response(status_code, body):
    client = VintedClient.__new__(VintedClient)
    client._csrf = "csrf"
    client._cookies = {}
    response = MagicMock(status_code=status_code, ok=200 <= status_code < 300, text=json.dumps(body))
    response.json.return_value = body
    if status_code >= 400:
        response.raise_for_status.side_effect = Exception(f"HTTP Error {status_code}: ")
    client._session = MagicMock()
    client._session.post.return_value = response
    client._sync_datadome = MagicMock()
    return client

def test_create_listing_raises_a_validation_error_carrying_vinteds_messages():
    client = _client_with_response(400, {"code": 99, "message_code": "validation_error", "errors": [
        {"field": "size", "value": "Le champ Taille doit être renseigné"},
    ]})
    with pytest.raises(VintedValidationError, match="Le champ Taille doit être renseigné"):
        client.create_listing(title="t", description="d", price=1.0, condition="NM", image_urls=[], photo_ids=[1])

def test_create_listing_keeps_raising_the_http_error_for_non_validation_failures():
    client = _client_with_response(500, {"code": 100, "message": "oops"})
    with pytest.raises(Exception, match="HTTP Error 500") as excinfo:
        client.create_listing(title="t", description="d", price=1.0, condition="NM", image_urls=[], photo_ids=[1])
    assert not isinstance(excinfo.value, VintedValidationError)

def test_get_catalog_attributes_asks_for_the_category_and_returns_its_attributes():
    attributes = [{"code": "brand"}, {"code": "color"}]
    client = _client_with_response(200, {"code": 0, "attributes": attributes})
    assert client.get_catalog_attributes(2614) == attributes
    url = client._session.post.call_args.args[0]
    assert url.endswith("/api/v2/item_upload/attributes")
    assert client._session.post.call_args.kwargs["json"] == {"attributes": [{"code": "category", "value": [2614]}]}

def test_token_refresh_never_logs_the_tokens(caplog):
    client = VintedClient.__new__(VintedClient)
    client._csrf = None
    client._cookies = {"refresh_token_web": "old-refresh"}
    client._save_cookies = MagicMock()
    response = MagicMock(status_code=200, ok=True,
                         text='{"access_token":"SECRET-ACCESS","refresh_token":"SECRET-REFRESH"}')
    response.json.return_value = {"access_token": "SECRET-ACCESS", "refresh_token": "SECRET-REFRESH"}
    client._session = MagicMock()
    client._session.post.return_value = response

    with caplog.at_level(logging.INFO):
        assert client._try_token_refresh() is True

    assert "SECRET" not in caplog.text
    assert client._cookies["access_token_web"] == "SECRET-ACCESS"

def _client_with_responses(*responses):
    client = VintedClient.__new__(VintedClient)
    client._csrf = "csrf"
    client._cookies = {}
    built = []
    for status_code, body in responses:
        r = MagicMock(status_code=status_code, ok=200 <= status_code < 300, text=json.dumps(body))
        r.json.return_value = body
        if status_code >= 400:
            r.raise_for_status.side_effect = Exception(f"HTTP Error {status_code}: ")
        built.append(r)
    client._session = MagicMock()
    client._session.post.side_effect = built
    client._sync_datadome = MagicMock()
    return client

CAPS_REJECTION = {"code": 99, "message_code": "validation_error", "errors": [
    {"field": "title", "value": "Le titre contient trop de lettres majuscules. Essaie d'utiliser des minuscules."}]}

def test_create_listing_cleans_the_title_before_sending_it():
    client = _client_with_responses((200, {"item": {"id": 42}}))
    client.create_listing(title="Carte Magic Sephiroth, Fabled SOLDIER\t115\tM [FR]", description="d", price=1.0,
                          condition="NM", image_urls=[], photo_ids=[1])
    sent = client._session.post.call_args.kwargs["json"]["item"]["title"]
    assert sent == "Carte Magic Sephiroth, Fabled Soldier 115 M [FR]"

def test_create_listing_retries_once_with_softer_capitals_when_vinted_refuses_them():
    client = _client_with_responses((400, CAPS_REJECTION), (200, {"item": {"id": 42}}))
    listing_id = client.create_listing(title="Carte Pokémon Dracaufeu EX - (XYP 17) [FR]", description="d", price=1.0,
                                       condition="NM", image_urls=[], photo_ids=[1])
    assert listing_id == "42"
    titles = [call.kwargs["json"]["item"]["title"] for call in client._session.post.call_args_list]
    assert titles == ["Carte Pokémon Dracaufeu EX - (XYP 17) [FR]", "Carte Pokémon Dracaufeu Ex - (Xyp 17) [FR]"]
    photos = [call.kwargs["json"]["item"]["assigned_photos"] for call in client._session.post.call_args_list]
    assert photos[0] == photos[1]  # same uploaded photos, nothing re-uploaded

def test_create_listing_gives_up_after_one_softened_retry():
    client = _client_with_responses((400, CAPS_REJECTION), (400, CAPS_REJECTION))
    with pytest.raises(VintedValidationError, match="majuscules"):
        client.create_listing(title="Carte EX GX [FR]", description="d", price=1.0, condition="NM", image_urls=[], photo_ids=[1])
    assert client._session.post.call_count == 2
