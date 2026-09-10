# -*- coding: utf-8 -*-
from __future__ import annotations

import pytest

from app import create_app
from app.rate_limit import _hits


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "1000")
    _hits.clear()
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["service"] == "firecrawl-proxy"
    assert "local_engines" in data


def test_local_engines_endpoint(client):
    res = client.get("/api/local/engines")
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert "curl_cffi" in data["engines"]


def test_local_scrape_requires_url(client):
    res = client.post("/api/local/scrape", json={"engine": "curl_cffi"})
    assert res.status_code == 400


def test_firecrawl_get_rejects_foreign_next(client):
    res = client.get(
        "/api/firecrawl/get",
        query_string={"next": "https://evil.example.com/v2/crawl/x"},
        headers={"Authorization": "Bearer fc-test"},
    )
    assert res.status_code == 400
    assert "api.firecrawl.dev" in res.get_json()["error"]


def test_firecrawl_get_rejects_http_scheme(client):
    res = client.get(
        "/api/firecrawl/get",
        query_string={"next": "http://api.firecrawl.dev/v2/crawl/x"},
        headers={"Authorization": "Bearer fc-test"},
    )
    assert res.status_code == 400


def test_firecrawl_get_requires_path_or_next(client):
    res = client.get("/api/firecrawl/get", headers={"Authorization": "Bearer fc-test"})
    assert res.status_code == 400


def test_analyze_requires_key(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/api/ai/analyze", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 400
    assert "ключ" in res.get_json()["error"].lower() or "OpenAI" in res.get_json()["error"]


def test_analyze_requires_messages(client):
    res = client.post(
        "/api/ai/analyze",
        json={"openaiKey": "sk-test"},
        headers={"Authorization": "Bearer sk-test"},
    )
    assert res.status_code == 400
    assert "messages" in res.get_json()["error"].lower()


def test_search_requires_query(client):
    res = client.post("/api/firecrawl/search", json={"apiKey": "fc-test"})
    assert res.status_code == 400


def test_security_headers(client):
    res = client.get("/api/health")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "no-referrer"


def test_rate_limit_returns_429(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    _hits.clear()
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        headers = {"Authorization": "Bearer fc-test"}
        assert c.get("/api/firecrawl/get", headers=headers).status_code == 400
        assert c.get("/api/firecrawl/get", headers=headers).status_code == 400
        res = c.get("/api/firecrawl/get", headers=headers)
        assert res.status_code == 429
