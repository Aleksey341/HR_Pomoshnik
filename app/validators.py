# -*- coding: utf-8 -*-
from __future__ import annotations

from urllib.parse import urlparse

from app.config import FIRECRAWL_API, FIRECRAWL_API_HOST


class ValidationError(ValueError):
    pass


def normalize_domain(value: str) -> str:
    domain = value.strip()
    if domain.lower().startswith("http://"):
        domain = domain[7:]
    elif domain.lower().startswith("https://"):
        domain = domain[8:]
    return domain.split("/")[0].split(":")[0]


def validate_firecrawl_path(path: str) -> str:
    path = str(path or "").strip()
    if not path:
        raise ValidationError("Пустой path")
    if not path.startswith("/"):
        path = f"/{path}"
    if ".." in path or path.startswith("//"):
        raise ValidationError("Недопустимый path")
    if not path.startswith("/v2/"):
        raise ValidationError("Path должен начинаться с /v2/")
    return path


def validate_firecrawl_next_url(url: str) -> str:
    url = str(url or "").strip()
    if not url:
        raise ValidationError("Пустой next URL")

    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValidationError("Разрешены только https URL")
    if parsed.netloc.lower() != FIRECRAWL_API_HOST:
        raise ValidationError(f"URL должен указывать на {FIRECRAWL_API_HOST}")
    if not parsed.path.startswith("/v2/"):
        raise ValidationError("URL должен относиться к API v2")
    if parsed.username or parsed.password:
        raise ValidationError("URL не должен содержать credentials")

    return url


def build_firecrawl_url(path: str) -> str:
    safe_path = validate_firecrawl_path(path)
    return f"https://{FIRECRAWL_API_HOST}{safe_path}"
