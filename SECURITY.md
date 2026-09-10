# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| main | yes |

## Reporting a vulnerability

If you discover a security issue, please report it privately to the repository owner. Do not open a public issue with exploit details.

## Known safeguards (v2)

- `/api/firecrawl/get` accepts only `https://api.firecrawl.dev/v2/...` URLs in the `next` parameter (SSRF guard).
- API keys for proxy GET are sent via `Authorization: Bearer` / `X-Api-Key`, **not** in the query string (avoids access-log leaks).
- API keys are not forwarded to third-party domains by the proxy.
- CORS is limited to configured origins (`CORS_ORIGINS`); preflight allows `Authorization` and `X-Api-Key`.
- Response hardening: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- Request body size capped (`MAX_CONTENT_LENGTH` = 2 MB).
- In-memory rate limit on API routes (`RATE_LIMIT_PER_MINUTE`, default 60).
- Browser keys are not persisted in `localStorage` by default; optional session-only storage (`sessionStorage`).

## Deployment recommendations

- Run the local proxy only on `127.0.0.1` (default in `server.py`).
- Keep `FIRECRAWL_API_KEY` and `OPENAI_API_KEY` in environment variables / `.env` (see `.env.example`), not in git. `server.py` loads `.env` via python-dotenv.
- Review `logs/firecrawl_credits.log` for unexpected usage spikes.
- Do not expose the proxy to the public internet without additional auth; rate limit alone is not enough.

## Legacy note

Root `index.html` / `firecrawl_parser.html` redirect to `docs/`. Prefer `templates/` + `static/` (local server) or `docs/` (GitHub Pages).
