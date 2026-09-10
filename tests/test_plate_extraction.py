# -*- coding: utf-8 -*-
from __future__ import annotations

from app.plates import extract_plate_numbers


def test_extract_plate_numbers_basic():
    text = "Продам авто A123BC77 и ещё X777XX777"
    plates = extract_plate_numbers(text)
    assert "A123BC77" in plates


def test_plate_pattern_js_synced():
    """JS pattern must match app/plates.py (run build_static.py after changes)."""
    import json
    import re
    from pathlib import Path

    from app.plates import PLATE_PATTERN_SOURCE

    js = (Path(__file__).resolve().parent.parent / "static" / "js" / "plate-pattern.js").read_text(
        encoding="utf-8"
    )
    match = re.search(r"PLATE_PATTERN_SOURCE\s*=\s*(.+);", js)
    assert match, "plate-pattern.js missing export"
    assert json.loads(match.group(1)) == PLATE_PATTERN_SOURCE
