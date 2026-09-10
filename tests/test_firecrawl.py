# -*- coding: utf-8 -*-
from __future__ import annotations

from app.services.credit_log import estimate_crawl_credits, estimate_search_credits


def test_estimate_search_credits():
    assert estimate_search_credits(10, False) == 10
    assert estimate_search_credits(10, True) == 20


def test_estimate_crawl_credits():
    assert estimate_crawl_credits(50) == 50
    assert estimate_crawl_credits(999) == 500
