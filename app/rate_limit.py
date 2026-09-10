# -*- coding: utf-8 -*-
"""Простой in-memory rate limit для API (на процесс)."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from functools import wraps
from threading import Lock

from flask import jsonify, request

_lock = Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _limit() -> int:
    return max(1, int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60")))


def _client_key() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "unknown")


def rate_limit(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if request.method == "OPTIONS":
            return view(*args, **kwargs)

        key = f"{_client_key()}:{request.endpoint}"
        now = time.monotonic()
        window = 60.0
        limit = _limit()

        with _lock:
            q = _hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return jsonify({
                    "error": f"Слишком много запросов. Лимит: {limit}/мин. "
                    "Задайте RATE_LIMIT_PER_MINUTE или подождите."
                }), 429
            q.append(now)

        return view(*args, **kwargs)

    return wrapped
