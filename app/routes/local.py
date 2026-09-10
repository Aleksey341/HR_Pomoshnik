# -*- coding: utf-8 -*-
from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.rate_limit import rate_limit
from app.services import local_scrape

bp = Blueprint("local", __name__, url_prefix="/api/local")


def _pack_doc(doc: dict, formats: list, *, tried: list[str] | None = None) -> dict:
    data: dict = {"metadata": doc.get("metadata") or {}}
    if "markdown" in formats:
        data["markdown"] = doc.get("markdown") or ""
    if "html" in formats:
        data["html"] = doc.get("html") or ""
    if "links" in formats:
        data["links"] = doc.get("links") or []
    meta = {
        "engine": (doc.get("metadata") or {}).get("engine"),
        "weak": bool((doc.get("metadata") or {}).get("weak")),
    }
    if tried:
        meta["fallback_tried"] = tried
    return {"success": True, "data": data, "_meta": meta}


@bp.route("/engines", methods=["GET", "OPTIONS"])
def engines():
    if request.method == "OPTIONS":
        return ("", 204)
    avail = local_scrape.engine_availability()
    return jsonify({
        "ok": True,
        "engines": avail,
        "browser": avail["cloakbrowser"] or avail["playwright"],
    })


@bp.route("/scrape", methods=["POST", "OPTIONS"])
@rate_limit
def scrape():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(force=True, silent=True) or {}
    url = str(payload.get("url") or "").strip()
    engine = str(payload.get("engine") or "curl_cffi").strip().lower()
    formats = payload.get("formats") or ["markdown"]
    use_fallback = bool(payload.get("fallback")) or engine in ("auto", "smart", "fallback")

    if not url:
        return jsonify({"error": "Укажите url"}), 400

    try:
        if use_fallback:
            chain = payload.get("engines")
            if not isinstance(chain, list) or not chain:
                chain = ["curl_cffi", "browser"]
            doc, tried = local_scrape.scrape_with_fallback(url, chain)
            return jsonify(_pack_doc(doc, formats, tried=tried))

        doc = local_scrape.scrape(url, engine)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Локальный scrape не удался: {exc}"}), 502

    return jsonify(_pack_doc(doc, formats))
