# -*- coding: utf-8 -*-
from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.config import api_key_from_headers, openai_key_from_payload
from app.rate_limit import rate_limit
from app.services import openai_client

bp = Blueprint("openai", __name__, url_prefix="/api/ai")

MAX_AI_INPUT_CHARS = 140_000
MAX_AI_MESSAGES = 16


@bp.route("/analyze", methods=["POST", "OPTIONS"])
@rate_limit
def analyze():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(force=True, silent=True) or {}
    api_key = api_key_from_headers(request.headers) or openai_key_from_payload(payload)
    if not api_key:
        return jsonify({"error": "Укажите ключ OpenAI (sk-…) или OPENAI_API_KEY"}), 400

    raw_messages = payload.get("messages") or []
    if not isinstance(raw_messages, list) or not raw_messages:
        return jsonify({"error": "Нет messages для анализа"}), 400

    messages = []
    for item in raw_messages[:MAX_AI_MESSAGES]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "")
        if not content.strip():
            continue
        role = str(item.get("role") or "user")
        if role not in {"system", "user", "assistant"}:
            role = "user"
        messages.append({"role": role, "content": content})

    if not messages:
        return jsonify({"error": "Нет messages для анализа"}), 400

    total_chars = sum(len(item["content"]) for item in messages)
    if total_chars > MAX_AI_INPUT_CHARS:
        return jsonify({
            "error": f"Слишком большой AI-контекст: {total_chars} символов. Максимум {MAX_AI_INPUT_CHARS}."
        }), 413

    requested_max = payload.get("max_completion_tokens", 4500)
    try:
        requested_max = int(requested_max)
    except (TypeError, ValueError):
        requested_max = 4500
    max_completion_tokens = max(128, min(requested_max, 6000))

    model = str(payload.get("model") or "gpt-5.6-sol")
    body = {
        "model": model,
        "messages": messages,
        "reasoning_effort": "none",
        "max_completion_tokens": max_completion_tokens,
    }
    data, status = openai_client.chat_completion(body, api_key)
    if status >= 400:
        return jsonify(data), status

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return jsonify({"content": content, "success": True})
