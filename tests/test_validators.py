# -*- coding: utf-8 -*-
from __future__ import annotations

import pytest

from app.validators import ValidationError, build_firecrawl_url, validate_firecrawl_next_url, validate_firecrawl_path


def test_validate_firecrawl_path_ok():
    assert validate_firecrawl_path("/v2/crawl/abc") == "/v2/crawl/abc"


def test_validate_firecrawl_path_rejects_traversal():
    with pytest.raises(ValidationError):
        validate_firecrawl_path("/v2/../etc/passwd")


def test_validate_firecrawl_next_url_ok():
    url = "https://api.firecrawl.dev/v2/crawl/abc123"
    assert validate_firecrawl_next_url(url) == url


def test_validate_firecrawl_next_url_rejects_foreign_domain():
    with pytest.raises(ValidationError):
        validate_firecrawl_next_url("https://evil.example.com/v2/crawl/abc")


def test_build_firecrawl_url():
    assert build_firecrawl_url("/v2/crawl/job-1") == "https://api.firecrawl.dev/v2/crawl/job-1"
