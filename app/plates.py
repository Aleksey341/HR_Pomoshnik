# -*- coding: utf-8 -*-
from __future__ import annotations

import re

# Единый источник правды. JS синхронизируется через scripts/build_static.py → plate-pattern.js
PLATE_PATTERN_SOURCE = (
    r"[ABEKMHOPCTYXАВЕКМНОРСТУХ]\d{3}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2}\d{2,3}"
)

PLATE_PATTERN = re.compile(PLATE_PATTERN_SOURCE, re.IGNORECASE)


def extract_plate_numbers(text: str) -> list[str]:
    if not text:
        return []
    found: list[str] = []
    seen: set[str] = set()
    for match in PLATE_PATTERN.finditer(str(text).upper().replace(" ", "")):
        plate = match.group(0).upper()
        if plate not in seen:
            seen.add(plate)
            found.append(plate)
    return found
