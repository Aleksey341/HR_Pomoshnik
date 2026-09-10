# -*- coding: utf-8 -*-
from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.config import api_key_from_headers, firecrawl_key_from_payload
from app.rate_limit import rate_limit
from app.services.credit_log import (
    estimate_crawl_credits,
    estimate_scrape_credits,
    estimate_search_credits,
    log_credit_usage,
)
from app.services import firecrawl_client
from app.validators import ValidationError, build_firecrawl_url, validate_firecrawl_next_url

bp = Blueprint("firecrawl", __name__, url_prefix="/api/firecrawl")


def _resolve_firecrawl_key(payload: dict | None = None) -> str:
    return api_key_from_headers(request.headers) or firecrawl_key_from_payload(payload)


@bp.route("/search", methods=["POST", "OPTIONS"])
@rate_limit
def search():
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(force=True, silent=True) or {}
    query = str(payload.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Укажите query"}), 400

    api_key = _resolve_firecrawl_key(payload)
    body = firecrawl_client.build_search_body(payload)
    credits = estimate_search_credits(body["limit"], bool(payload.get("scrape")))
    log_credit_usage("search", estimated_credits=credits, details={"query": query[:120], "limit": body["limit"]})

    data, status = firecrawl_client.post("/search", body, api_key)
    if status < 400:
        data = {**data, "_meta": {"estimated_credits": credits}}
    return jsonify(data), status


@bp.route("/scrape", methods=["POST", "OPTIONS"])
@rate_limit
def scrape():
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(force=True, silent=True) or {}
    url = str(payload.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Укажите url"}), 400

    api_key = _resolve_firecrawl_key(payload)
    formats = payload.get("formats") or ["markdown"]
    body = {"url": url, "formats": formats}
    credits = estimate_scrape_credits()
    log_credit_usage("scrape", estimated_credits=credits, details={"url": url[:200]})

    data, status = firecrawl_client.post("/scrape", body, api_key)
    if status < 400:
        data = {**data, "_meta": {"estimated_credits": credits}}
    return jsonify(data), status


@bp.route("/crawl", methods=["POST", "OPTIONS"])
@rate_limit
def crawl():
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(force=True, silent=True) or {}
    url = str(payload.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Укажите url"}), 400

    api_key = _resolve_firecrawl_key(payload)
    body = firecrawl_client.build_crawl_body(payload)
    credits = estimate_crawl_credits(body["limit"])
    log_credit_usage("crawl", estimated_credits=credits, details={"url": url[:200], "limit": body["limit"]})

    data, status = firecrawl_client.post("/crawl", body, api_key)
    if status < 400:
        data = {**data, "_meta": {"estimated_credits": credits}}
    return jsonify(data), status


@bp.route("/get", methods=["GET", "OPTIONS"])
@rate_limit
def get_proxy():
    if request.method == "OPTIONS":
        return ("", 204)

    # Ключ только из заголовков / env — не из query (иначе утекает в access-логи).
    api_key = _resolve_firecrawl_key()
    next_url = str(request.args.get("next") or "").strip()
    path = str(request.args.get("path") or "").strip()

    try:
        if next_url:
            target = validate_firecrawl_next_url(next_url)
        elif path:
            target = build_firecrawl_url(path)
        else:
            return jsonify({"error": "Укажите path или next"}), 400
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    data, status = firecrawl_client.get(target, api_key)
    return jsonify(data), status
