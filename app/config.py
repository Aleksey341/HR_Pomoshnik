# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

FIRECRAWL_API = "https://api.firecrawl.dev/v2"
FIRECRAWL_API_HOST = "api.firecrawl.dev"
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

DEFAULT_PORT = 8765
DEFAULT_TIMEOUT_SEC = 120
OPENAI_TIMEOUT_SEC = 180

CREDITS_LOG_PATH = BASE_DIR / "logs" / "firecrawl_credits.log"


def cors_origins() -> list[str]:
    raw = os.environ.get(
        "CORS_ORIGINS",
        "http://127.0.0.1:8765,http://localhost:8765",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def api_key_from_headers(headers) -> str:
    """Ключ из Authorization: Bearer … или X-Api-Key (не из query — не попадает в логи URL)."""
    auth = str(headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token
    header_key = str(headers.get("X-Api-Key") or "").strip()
    return header_key


def firecrawl_key_from_payload(payload: dict | None = None) -> str:
    key = ""
    if payload:
        key = str(payload.get("apiKey") or payload.get("api_key") or "").strip()
    return key or os.environ.get("FIRECRAWL_API_KEY", "").strip()


def openai_key_from_payload(payload: dict | None = None) -> str:
    key = ""
    if payload:
        key = str(payload.get("openaiKey") or payload.get("api_key") or "").strip()
    return key or os.environ.get("OPENAI_API_KEY", "").strip()
