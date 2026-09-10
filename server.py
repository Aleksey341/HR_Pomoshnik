# -*- coding: utf-8 -*-
"""Точка входа локального сервера."""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"Откройте: http://127.0.0.1:{port}/")
    app.run(host="127.0.0.1", port=port, debug=False)
