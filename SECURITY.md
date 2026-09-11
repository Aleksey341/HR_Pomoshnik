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
- User access codes are checked against SHA-256 hashes from `MANAGED_ACCESS_USERS_JSON` / legacy hashes.
- Hash comparison uses `crypto.timingSafeEqual`.
- A named user can be disabled independently.
- Managed endpoints require `Authorization: Bearer HRP-...`.
- CORS is restricted through `CORS_ORIGINS`.
- `/api/firecrawl/get` only proxies URLs under `https://api.firecrawl.dev/v2`.
- Gateway responses use `Cache-Control: no-store`.

## Server-side usage guards

Frontend limits are not trusted as a security boundary. Managed gateway validates requests again on the server.

- Firecrawl search query: maximum 500 characters.
- Firecrawl search results: maximum 50 per request.
- Firecrawl includeDomains: maximum 20.
- Firecrawl crawl: maximum 100 pages per job.
- Crawl discovery depth: maximum 6.
- Firecrawl request bodies are rebuilt from an allowlist of supported fields; unknown fields are discarded.
- AI request: maximum 16 messages and 140000 characters of input.
- AI completion: maximum 6000 tokens.
- Per-user rate buckets protect search, scrape, crawl, polling and AI calls.

The current rate bucket is an in-memory serverless guard. It protects a warm runtime instance but is not a distributed quota across every Vercel instance. Hard per-request caps remain enforced regardless of instance. A distributed quota store should be added before high-volume public access.

## Evidence and AI output

- Every result is assigned a `Source ID` (`S001`, `S002`, ...).
- AI prompts instruct the model to cite Source IDs for substantive factual claims.
- Source IDs are preserved in Markdown/JSON/Excel exports.
- AI citations improve auditability but do not replace human verification of sensitive HR conclusions.

## Browser storage

- HRP/API codes are not stored in `localStorage`.
- Optional credential persistence uses `sessionStorage`, limited to the browser tab/session.
- Research history is saved to `localStorage` only after an explicit user action (`Сохранить`).
- Research history can contain excerpts from collected pages and AI reports. Do not save sensitive personal data on a shared computer.
- Local history is not uploaded to GitHub by the application.

## Local mode safeguards

- Run the local Flask proxy on `127.0.0.1`.
- Local `FIRECRAWL_API_KEY` and `OPENAI_API_KEY` belong in `.env` or environment variables.
- `.env`, logs and other local secrets must stay outside Git.
- Local API routes retain request validation, CORS checks and rate limiting.
- Local OpenAI analysis uses the same 140000-character and 6000-token caps as managed mode.

## Deployment

See `docs/MANAGED-SERVICE.md` for production setup. Before enabling managed mode, configure backend secrets and at least one user access-code hash.
