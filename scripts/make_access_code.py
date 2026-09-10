"""Generate a named HR Pomoshnik user access code and SHA-256 registry entry."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets


def normalize_user(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("user name is required")
    if len(value) > 80:
        raise ValueError("user name is too long")
    if not re.fullmatch(r"[\w .@+-]+", value, flags=re.UNICODE):
        raise ValueError("user name contains unsupported characters")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Create HR Pomoshnik managed access code")
    parser.add_argument("--user", required=True, help="User label, e.g. ivan.petrov or HR-team-01")
    args = parser.parse_args()

    user = normalize_user(args.user)
    code = "HRP-" + secrets.token_urlsafe(18)
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    entry = {"user": user, "hash": digest, "enabled": True}

    print("USER=" + user)
    print("ACCESS_CODE=" + code)
    print("SHA256=" + digest)
    print("REGISTRY_ENTRY=" + json.dumps(entry, ensure_ascii=False, separators=(",", ":")))
    print()
    print("Give only ACCESS_CODE to the user.")
    print("Add REGISTRY_ENTRY to MANAGED_ACCESS_USERS_JSON on the server.")
    print("Do not commit ACCESS_CODE or server secrets to GitHub.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
