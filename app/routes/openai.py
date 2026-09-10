# -*- coding: utf-8 -*-
from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.config import api_key_from_headers, openai_key_from_payload
from app.rate_limit import rate_limit
from app.services import openai_client

bp = Blueprint("openai", __name__, url_prefix="/api/ai")


@bp.route("/analyze", methods=["POST", "OPTIONS"])
@rate_limit
def analyze():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(force=True, silent=True) or {}
    api_key = api_key_from_headers(request.headers) or openai_key_from_payload(payload)
    if not api_key:
        return jsonify({"error": "Укажите ключ OpenAI (sk-…) или OPENAI_API_KEY"}), 400

    messages = payload.get("messages") or []
    if not messages:
        return jsonify({"error": "Нет messages для анализа"}), 400

    model = str(payload.get("model") or "gpt-5.6-sol")
    body = {
        "model": model,
        "messages": messages,
        "reasoning_effort": "none",
        "max_completion_tokens": 2200,
    }
    data, status = openai_client.chat_completion(body, api_key)
    if status >= 400:
        return jsonify(data), status

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return jsonify({"content": content, "success": True})
