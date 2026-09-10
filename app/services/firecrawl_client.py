# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from app.config import DEFAULT_TIMEOUT_SEC, FIRECRAWL_API
from app.validators import normalize_domain


def _request_json(
    url: str,
    *,
    api_key: str,
    method: str = "GET",
    body: dict | None = None,
    timeout: int = DEFAULT_TIMEOUT_SEC,
) -> tuple[dict[str, Any], int]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    data = None
    if body is not None:
        payload = {k: v for k, v in body.items() if k not in ("apiKey", "api_key") and v is not None}
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(raw)
        except json.JSONDecodeError:
            err = {"error": raw or exc.reason}
        return err, exc.code
    except urllib.error.URLError as exc:
        return {"error": f"Не удалось связаться с API: {exc.reason}"}, 502


def post(path: str, body: dict, api_key: str) -> tuple[dict[str, Any], int]:
    return _request_json(f"{FIRECRAWL_API}{path}", api_key=api_key, method="POST", body=body)


def get(url: str, api_key: str) -> tuple[dict[str, Any], int]:
    return _request_json(url, api_key=api_key, method="GET")


def build_search_body(payload: dict) -> dict:
    query = str(payload.get("query") or "").strip()
    body: dict[str, Any] = {
        "query": query,
        "limit": max(1, min(int(payload.get("limit") or 5), 100)),
    }

    domains: list[str] = []
    raw_domains = payload.get("includeDomains")
    if isinstance(raw_domains, list):
        domains = [normalize_domain(str(item)) for item in raw_domains if str(item).strip()]
    elif raw_domains:
        domains = [
            normalize_domain(part)
            for part in re.split(r"[\s,;]+", str(raw_domains))
            if part.strip()
        ]
    if domains:
        body["includeDomains"] = domains

    sources = payload.get("sources") or ["web"]
    lang = str(payload.get("lang") or "").strip()
    needs_sources = bool(lang) or len(sources) != 1 or sources[0] != "web"
    if needs_sources:
        built_sources = []
        for source_type in sources:
            src: dict[str, Any] = {"type": source_type}
            if lang and source_type in ("web", "news"):
                src["lang"] = lang
                if lang == "ru":
                    src["country"] = "RU"
                elif lang == "en":
                    src["country"] = "US"
            built_sources.append(src)
        body["sources"] = built_sources

    if payload.get("scrape"):
        body["scrapeOptions"] = {"formats": ["markdown"]}
    if payload.get("tbs"):
        body["tbs"] = str(payload["tbs"])
    return body


def build_crawl_body(payload: dict) -> dict:
    body: dict[str, Any] = {
        "url": str(payload.get("url") or "").strip(),
        "limit": max(1, min(int(payload.get("limit") or 50), 500)),
        "maxDiscoveryDepth": max(1, int(payload.get("maxDiscoveryDepth") or 3)),
        "crawlEntireDomain": bool(payload.get("crawlEntireDomain")),
    }
    if payload.get("includePaths"):
        body["includePaths"] = payload["includePaths"]
    if payload.get("excludePaths"):
        body["excludePaths"] = payload["excludePaths"]
    if payload.get("scrape"):
        body["scrapeOptions"] = {"formats": ["markdown"]}
    return body
