"""Local admin utility for HR Pomoshnik managed users.

Stores only SHA-256 hashes in access-users.json. The file is gitignored.
Use `export` to print the JSON value for MANAGED_ACCESS_USERS_JSON.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "access-users.json"


def load_registry() -> list[dict]:
    if not REGISTRY.exists():
        return []
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("access-users.json must contain a JSON array")
    return data


def save_registry(items: list[dict]) -> None:
    REGISTRY.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def cmd_add(user: str) -> int:
    items = load_registry()
    if any(str(item.get("user", "")).casefold() == user.casefold() for item in items):
        raise SystemExit(f"User already exists: {user}")
    code = "HRP-" + secrets.token_urlsafe(18)
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    items.append({"user": user, "hash": digest, "enabled": True})
    save_registry(items)
    print(f"USER={user}")
    print(f"ACCESS_CODE={code}")
    print("Give ACCESS_CODE to the user now. It is not stored locally.")
    return 0


def cmd_disable(user: str, enabled: bool) -> int:
    items = load_registry()
    found = False
    for item in items:
        if str(item.get("user", "")).casefold() == user.casefold():
            item["enabled"] = enabled
            found = True
            break
    if not found:
        raise SystemExit(f"User not found: {user}")
    save_registry(items)
    print(f"{user}: {'enabled' if enabled else 'disabled'}")
    return 0


def cmd_list() -> int:
    items = load_registry()
    if not items:
        print("No users")
        return 0
    for item in items:
        print(f"{item.get('user')}\t{'enabled' if item.get('enabled', True) else 'disabled'}")
    return 0


def cmd_export() -> int:
    items = load_registry()
    print(json.dumps(items, ensure_ascii=False, separators=(",", ":")))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage HR Pomoshnik access users")
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add", help="Create a new user and one-time access code")
    add.add_argument("user")

    disable = sub.add_parser("disable", help="Disable a user")
    disable.add_argument("user")

    enable = sub.add_parser("enable", help="Enable a user")
    enable.add_argument("user")

    sub.add_parser("list", help="List users and status")
    sub.add_parser("export", help="Print MANAGED_ACCESS_USERS_JSON value")

    args = parser.parse_args()
    if args.command == "add":
        return cmd_add(args.user)
    if args.command == "disable":
        return cmd_disable(args.user, False)
    if args.command == "enable":
        return cmd_disable(args.user, True)
    if args.command == "list":
        return cmd_list()
    if args.command == "export":
        return cmd_export()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
