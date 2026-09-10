# -*- coding: utf-8 -*-
from __future__ import annotations

from app.config import api_key_from_headers


def test_api_key_from_bearer():
    assert api_key_from_headers({"Authorization": "Bearer fc-secret"}) == "fc-secret"


def test_api_key_from_x_api_key():
    assert api_key_from_headers({"X-Api-Key": "fc-from-header"}) == "fc-from-header"


def test_api_key_prefers_bearer():
    headers = {"Authorization": "Bearer first", "X-Api-Key": "second"}
    assert api_key_from_headers(headers) == "first"


def test_api_key_empty():
    assert api_key_from_headers({}) == ""
