"""Generate an administrator code for the HR Pomoshnik web admin panel."""
from __future__ import annotations

import hashlib
import secrets


def main() -> int:
    code = "HRA-" + secrets.token_urlsafe(24)
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()

    print("ADMIN_CODE=" + code)
    print("SHA256=" + digest)
    print()
    print("Give ADMIN_CODE only to the administrator.")
    print("Store SHA256 in Vercel as ADMIN_ACCESS_CODE_HASH.")
    print("Do not commit ADMIN_CODE or the Vercel API token to GitHub.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
