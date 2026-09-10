# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from app.config import OPENAI_API_URL, OPENAI_TIMEOUT_SEC


def chat_completion(body: dict, api_key: str) -> tuple[dict[str, Any], int]:
    req = urllib.request.Request(
        OPENAI_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=OPENAI_TIMEOUT_SEC) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(raw)
            msg = err.get("error", {}).get("message") or raw
        except json.JSONDecodeError:
            msg = raw or exc.reason
        return {"error": msg}, exc.code
    except urllib.error.URLError as exc:
        return {"error": f"Не удалось связаться с OpenAI: {exc.reason}"}, 502
