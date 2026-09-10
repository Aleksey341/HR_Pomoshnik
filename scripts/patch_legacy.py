# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT / "static" / "js" / "legacy.js"

IMPORTS = """import { FIRECRAWL_API, USE_LOCAL_PROXY, API_BASE, LOADERS, MAX_SEARCH_QUERY, MAX_SEARCH_LIMIT } from './config.js';
import { getApiKey, getOpenAiKey, saveApiKey, saveOpenAiKey, loadApiKey, loadOpenAiKey } from './storage.js';
import { apiPost, firecrawlRequest, firecrawlGet, firecrawlCrawlStart, extractApiError } from './api.js';

"""

REMOVE_BLOCKS = [
    "const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';\n",
    "const USE_LOCAL_PROXY = ",
    "const API_BASE = location.origin;\n\n",
    "const LOADERS = ",
    "const MAX_SEARCH_QUERY = 500;\n",
    "const MAX_SEARCH_LIMIT = 100;\n\n",
]


def strip_block(text: str, start: str) -> str:
    if start not in text:
        return text
    idx = text.index(start)
    if start.endswith("= "):
        end = text.index("};", idx) + 2
        return text[:idx] + text[end + 1 :]
    line_end = text.index("\n", idx) + 1
    return text[:idx] + text[line_end:]


def remove_function(text: str, name: str) -> str:
    marker = f"function {name}("
    while marker in text:
        idx = text.index(marker)
        brace = text.index("{", idx)
        depth = 0
        i = brace
        while i < len(text):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    i += 1
                    break
            i += 1
        text = text[:idx] + text[i:]
    return text


def main() -> None:
    text = LEGACY.read_text(encoding="utf-8")
    if text.startswith("import {"):
        print("legacy.js already patched")
        return

    for block in REMOVE_BLOCKS:
        text = strip_block(text, block)

    for fn in [
        "getApiKey",
        "saveApiKey",
        "loadApiKey",
        "getOpenAiKey",
        "saveOpenAiKey",
        "loadOpenAiKey",
        "apiPost",
        "extractApiError",
        "buildDirectPayload",
        "firecrawlRequest",
        "firecrawlGet",
        "firecrawlCrawlStart",
    ]:
        text = remove_function(text, fn)

    text = text.replace("async function apiPost", "// removed apiPost")
    text = IMPORTS + text.lstrip()
    LEGACY.write_text(text, encoding="utf-8")
    print("patched legacy.js")


if __name__ == "__main__":
    main()
