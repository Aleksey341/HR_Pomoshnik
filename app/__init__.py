# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from app.config import BASE_DIR, STATIC_DIR, cors_origins
from app.routes.firecrawl import bp as firecrawl_bp
from app.routes.local import bp as local_bp
from app.routes.openai import bp as openai_bp
from app.services.local_scrape import engine_availability

logging.basicConfig(level=logging.INFO)


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(STATIC_DIR),
        static_url_path="/static",
        template_folder=str(BASE_DIR / "templates"),
    )
    # Защита от огромных тел запросов (ключи + markdown в AI)
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

    allowed_origins = cors_origins()

    @app.after_request
    def apply_cors(resp):
        origin = request.headers.get("Origin")
        if origin and origin in allowed_origins:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-Api-Key"
        )
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["X-Frame-Options"] = "DENY"
        return resp

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/api/health")
    def health():
        engines = engine_availability()
        return jsonify({
            "ok": True,
            "service": "firecrawl-proxy",
            "firecrawl_key": bool(os.environ.get("FIRECRAWL_API_KEY")),
            "local_engines": engines,
        })

    app.register_blueprint(firecrawl_bp)
    app.register_blueprint(openai_bp)
    app.register_blueprint(local_bp)
    return app
