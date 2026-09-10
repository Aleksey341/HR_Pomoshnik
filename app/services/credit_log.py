# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.config import CREDITS_LOG_PATH

logger = logging.getLogger("firecrawl.credits")


def _ensure_log_dir() -> None:
    CREDITS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def log_credit_usage(
    operation: str,
    *,
    estimated_credits: int,
    details: dict | None = None,
) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "operation": operation,
        "estimated_credits": estimated_credits,
        "details": details or {},
    }
    _ensure_log_dir()
    with CREDITS_LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    logger.info(
        "credits operation=%s estimated=%s details=%s",
        operation,
        estimated_credits,
        details,
    )


def estimate_search_credits(limit: int, scrape: bool) -> int:
    base = max(1, min(limit, 100))
    return base * (2 if scrape else 1)


def estimate_scrape_credits() -> int:
    return 1


def estimate_crawl_credits(limit: int) -> int:
    return max(1, min(limit, 500))
