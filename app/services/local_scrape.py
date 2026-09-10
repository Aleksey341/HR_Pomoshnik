# -*- coding: utf-8 -*-
"""Локальный scrape без Firecrawl: curl_cffi (TLS) и браузер (CloakBrowser/Playwright)."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

from app.config import DEFAULT_TIMEOUT_SEC


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip = 0
        self.title = ""
        self._in_title = False
        self.links: list[str] = []
        self._base = ""

    def set_base(self, base: str) -> None:
        self._base = base

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        low = tag.lower()
        if low in ("script", "style", "noscript", "svg"):
            self._skip += 1
            return
        if low == "title":
            self._in_title = True
        if low == "a":
            href = dict(attrs).get("href")
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                self.links.append(urljoin(self._base, href))
        if low in ("p", "div", "br", "li", "h1", "h2", "h3", "tr"):
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        low = tag.lower()
        if low in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        if low == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title += text + " "
            return
        self._chunks.append(text + " ")

    def markdown(self) -> str:
        raw = "".join(self._chunks)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def html_to_doc(url: str, html: str) -> dict[str, Any]:
    parser = _TextExtractor()
    parser.set_base(url)
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    title = parser.title.strip() or url
    links = []
    seen: set[str] = set()
    for link in parser.links:
        if link not in seen:
            seen.add(link)
            links.append(link)
    return {
        "markdown": parser.markdown(),
        "html": html,
        "links": links[:500],
        "metadata": {"title": title, "sourceURL": url, "description": ""},
    }


def _validate_http_url(url: str) -> str:
    url = str(url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL должен начинаться с http:// или https://")
    return url


def scrape_curl_cffi(url: str, *, timeout: int = DEFAULT_TIMEOUT_SEC) -> dict[str, Any]:
    from curl_cffi import requests as cf_requests

    url = _validate_http_url(url)
    resp = cf_requests.get(url, impersonate="chrome", timeout=timeout, allow_redirects=True)
    resp.raise_for_status()
    html = resp.text
    doc = html_to_doc(str(resp.url or url), html)
    doc["metadata"]["engine"] = "curl_cffi"
    doc["metadata"]["status"] = resp.status_code
    return doc


def scrape_browser(url: str, *, timeout_ms: int | None = None) -> dict[str, Any]:
    url = _validate_http_url(url)
    timeout_ms = timeout_ms or DEFAULT_TIMEOUT_SEC * 1000

    browser = None
    engine_name = "playwright"
    try:
        from cloakbrowser import launch

        browser = launch(headless=True)
        engine_name = "cloakbrowser"
    except Exception:
        from playwright.sync_api import sync_playwright

        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=True)
        engine_name = "playwright"
        try:
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(800)
            html = page.content()
            final_url = page.url
            title = page.title()
            doc = html_to_doc(final_url, html)
            if title:
                doc["metadata"]["title"] = title
            doc["metadata"]["engine"] = engine_name
            return doc
        finally:
            browser.close()
            pw.stop()

    try:
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(800)
        html = page.content()
        final_url = page.url
        title = page.title()
        doc = html_to_doc(final_url, html)
        if title:
            doc["metadata"]["title"] = title
        doc["metadata"]["engine"] = engine_name
        return doc
    finally:
        browser.close()


def engine_availability() -> dict[str, bool]:
    avail = {"curl_cffi": False, "cloakbrowser": False, "playwright": False}
    try:
        import curl_cffi  # noqa: F401

        avail["curl_cffi"] = True
    except ImportError:
        pass
    try:
        import cloakbrowser  # noqa: F401

        avail["cloakbrowser"] = True
    except ImportError:
        pass
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401

        avail["playwright"] = True
    except ImportError:
        pass
    return avail


def is_weak_doc(doc: dict[str, Any]) -> bool:
    """Пустой markdown или типичная antibot/challenge-страница."""
    md = str(doc.get("markdown") or "").strip()
    html = str(doc.get("html") or "").lower()
    title = str((doc.get("metadata") or {}).get("title") or "").lower()
    if len(md) < 80:
        return True
    markers = (
        "just a moment",
        "checking your browser",
        "cf-browser-verification",
        "cf-challenge",
        "attention required",
        "access denied",
        "enable javascript",
        "captcha",
        "cloudflare",
    )
    blob = f"{html[:4000]} {title} {md[:500].lower()}"
    return any(m in blob for m in markers)


def scrape(url: str, engine: str) -> dict[str, Any]:
    engine = (engine or "curl_cffi").strip().lower()
    if engine in ("curl", "curl_cffi", "cffi"):
        return scrape_curl_cffi(url)
    if engine in ("browser", "cloakbrowser", "playwright", "cloak"):
        return scrape_browser(url)
    raise ValueError(f"Неизвестный engine: {engine}. Доступно: curl_cffi, browser")


def scrape_with_fallback(
    url: str,
    engines: list[str] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Пробует движки по порядку; пропускает слабые ответы."""
    chain = engines or ["curl_cffi", "browser"]
    tried: list[str] = []
    last_doc: dict[str, Any] | None = None
    last_error: Exception | None = None

    for engine in chain:
        name = engine.strip().lower()
        if name in ("auto", "smart", "fallback"):
            continue
        tried.append(name)
        try:
            doc = scrape(url, name)
            last_doc = doc
            if not is_weak_doc(doc):
                doc.setdefault("metadata", {})["fallback_tried"] = tried
                return doc, tried
        except Exception as exc:  # noqa: BLE001 — собираем цепочку ошибок
            last_error = exc
            continue

    if last_doc is not None:
        last_doc.setdefault("metadata", {})["fallback_tried"] = tried
        last_doc["metadata"]["weak"] = True
        return last_doc, tried

    raise RuntimeError(
        f"Все движки не сработали ({', '.join(tried)}): {last_error or 'пустой ответ'}"
    )
