# -*- coding: utf-8 -*-
"""Сборка GitHub Pages из templates/ + static/ и синхронизация plate-pattern.js."""

from __future__ import annotations

import json
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def sync_plate_pattern_js() -> Path:
    from app.plates import PLATE_PATTERN_SOURCE

    out = ROOT / "static" / "js" / "plate-pattern.js"
    literal = json.dumps(PLATE_PATTERN_SOURCE, ensure_ascii=False)
    out.write_text(
        "/** Auto-generated from app/plates.py — do not edit by hand. */\n"
        f"export const PLATE_PATTERN_SOURCE = {literal};\n",
        encoding="utf-8",
    )
    return out


def build_docs() -> None:
    sync_plate_pattern_js()

    template = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    docs_html = (
        template.replace("{{ url_for('static', filename='css/app.css') }}", "static/css/app.css")
        .replace("{{ url_for('static', filename='js/app.js') }}", "static/js/app.js")
    )
    DOCS.mkdir(exist_ok=True)
    (DOCS / "index.html").write_text(docs_html, encoding="utf-8")

    docs_static = DOCS / "static"
    if docs_static.exists():
        shutil.rmtree(docs_static)
    shutil.copytree(ROOT / "static", docs_static)


if __name__ == "__main__":
    build_docs()
    print("Built docs/ from templates/ + static/ (plate-pattern.js synced)")
