# -*- coding: utf-8 -*-
from __future__ import annotations

from app.services.local_scrape import html_to_doc, scrape


def test_html_to_doc_extracts_title_and_text():
    html = """
    <html><head><title>Hello</title></head>
    <body><script>bad()</script><p>World <a href="/x">link</a></p></body></html>
    """
    doc = html_to_doc("https://example.com/page", html)
    assert "Hello" in doc["metadata"]["title"]
    assert "World" in doc["markdown"]
    assert any(l.endswith("/x") for l in doc["links"])


def test_scrape_rejects_bad_url():
    try:
        scrape("ftp://example.com", "curl_cffi")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "http" in str(exc).lower()


def test_scrape_unknown_engine():
    try:
        scrape("https://example.com", "nope")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "engine" in str(exc).lower()


def test_is_weak_doc_short_markdown():
    from app.services.local_scrape import is_weak_doc

    assert is_weak_doc({"markdown": "hi", "html": "", "metadata": {}})
    assert not is_weak_doc({
        "markdown": "x" * 120,
        "html": "<html><body>ok</body></html>",
        "metadata": {"title": "Ok"},
    })


def test_is_weak_doc_challenge():
    from app.services.local_scrape import is_weak_doc

    assert is_weak_doc({
        "markdown": "x" * 120,
        "html": "<html>Just a moment... cf-browser-verification</html>",
        "metadata": {"title": "Just a moment..."},
    })
