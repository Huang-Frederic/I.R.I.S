from unittest.mock import patch, Mock

import pytest

from scripts.lib.gemini_batch import build_request_payload, parse_batch_response, BatchOcrResult


def test_build_request_payload_wraps_image_with_prompt():
    image_bytes = b"\xff\xd8\xff" + b"\x00" * 100
    payload = build_request_payload(image_bytes, request_id="req-001")
    assert payload["request_id"] == "req-001"
    parts = payload["request"]["contents"][0]["parts"]
    assert any("Pokémon" in p.get("text", "") for p in parts)  # prompt present
    assert any("inline_data" in p for p in parts)  # image present


def test_parse_batch_response_extracts_card_data():
    raw = {
        "responses": [
            {
                "request_id": "req-001",
                "response": {
                    "candidates": [{
                        "content": {
                            "parts": [{
                                "text": '{"card_name":"Pikachu ex","set_code":"sv2a","set_number":"25","language":"JP","confidence":"high"}'
                            }]
                        }
                    }]
                }
            },
            {
                "request_id": "req-002",
                "response": {"error": {"message": "rate limited"}}
            },
        ]
    }
    results = parse_batch_response(raw)
    assert len(results) == 2
    assert results[0].request_id == "req-001"
    assert results[0].ocr is not None
    assert results[0].ocr["card_name"] == "Pikachu ex"
    assert results[0].error is None
    assert results[1].request_id == "req-002"
    assert results[1].ocr is None
    assert "rate limited" in (results[1].error or "")


def test_parse_batch_response_handles_malformed_json_in_text():
    raw = {
        "responses": [
            {
                "request_id": "req-001",
                "response": {
                    "candidates": [{
                        "content": {
                            "parts": [{"text": "not valid json"}]
                        }
                    }]
                }
            },
        ]
    }
    results = parse_batch_response(raw)
    assert len(results) == 1
    assert results[0].ocr is None
    assert results[0].error is not None
    assert "json" in results[0].error.lower()
