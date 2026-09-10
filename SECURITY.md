# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| main | yes |

## Reporting a vulnerability

If you discover a security issue, report it privately to the repository owner. Do not open a public issue with exploit details or credentials.

## Managed access safeguards

- Production users receive only a personal code `HRP-...`.
- `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` are stored only as backend Environment Variables.
- Real API keys must never be committed to GitHub, `service.json`, frontend JavaScript or documentation.
- User access codes are checked against SHA-256 hashes from `MANAGED_ACCESS_CODE_HASHES`.
- Hash comparison uses `crypto.timingSafeEqual`.
- A user can be revoked by removing the corresponding hash from the server configuration.
- Managed endpoints require `Authorization: Bearer HRP-...`.
- CORS is restricted through `CORS_ORIGINS`.
- `/api/firecrawl/get` only proxies URLs under `https://api.firecrawl.dev/v2`.
- Gateway responses use `Cache-Control: no-store`.

## Browser storage

Keys/codes are not stored in `localStorage`. Optional persistence uses `sessionStorage`, which is limited to the browser tab/session.

## Local mode safeguards

- Run the local Flask proxy on `127.0.0.1`.
- Local `FIRECRAWL_API_KEY` and `OPENAI_API_KEY` belong in `.env` or environment variables.
- `.env`, logs and other local secrets must stay outside Git.
- Local API routes retain request validation, CORS checks and rate limiting.

## Deployment

See `docs/MANAGED-SERVICE.md` for production setup. Before enabling `service.json` mode `managed`, configure backend secrets and at least one user access-code hash.
