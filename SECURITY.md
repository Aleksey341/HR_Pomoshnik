# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| main | yes |

## Reporting a vulnerability

Report security issues privately to the repository owner. Do not open a public issue with exploit details or credentials.

## Managed access safeguards

- Production users receive only a personal code `HRP-...`.
- `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` are backend Environment Variables.
- Real API keys must never be committed to GitHub, `service.json`, frontend JavaScript or documentation.
- User access codes are checked against SHA-256 hashes from `MANAGED_ACCESS_USERS_JSON` / legacy hashes.
- Hash comparison uses `crypto.timingSafeEqual`.
- A named user can be disabled independently.
- Managed endpoints require `Authorization: Bearer HRP-...` unless an endpoint is explicitly documented as public health or protected cron.
- CORS is restricted through `CORS_ORIGINS`.
- Gateway responses use `Cache-Control: no-store`.

## Server-side usage guards

Frontend limits are not trusted as a security boundary. Managed gateway validates requests again on the server.

- Firecrawl search query: maximum 500 characters.
- Firecrawl search results: maximum 50 per request.
- Firecrawl includeDomains: maximum 20.
- Firecrawl crawl: maximum 100 pages per job.
- Crawl discovery depth: maximum 6.
- Firecrawl request bodies are rebuilt from an allowlist; unknown fields are discarded.
- AI request: maximum 16 messages and 140000 characters of input.
- AI completion: maximum 6000 tokens.
- Per-user rate buckets protect search, scrape, crawl and AI calls.
- Monthly per-user quotas protect aggregate Firecrawl and AI consumption.

When private server storage is available, monthly usage events are written to a shared store and aggregate quotas work across serverless instances. If storage is unavailable, the service exposes `usage_ledger_mode=runtime-fallback`; the hard per-request caps remain enforced, but the monthly counter is only best-effort inside a warm runtime and must not be treated as a billing-grade quota.

## Private server storage

The server persistence adapter uses private Blob access. User-owned records are written under a namespace derived from a SHA-256 hash of the managed user name. The namespace reduces accidental cross-user mixing and avoids exposing the literal username in object paths. Authorization is still enforced at every API endpoint; path hashing is not an authentication mechanism.

Server storage can contain:

- saved research briefs;
- collected source metadata and excerpts/full-text fragments;
- AI reports and report variants;
- Evidence Score metadata;
- usage events;
- recurring monitor definitions, snapshots and change reports.

These records can contain confidential business information or personal data that was present in the user's research. The application does not make such content safe merely by storing it privately. Users and administrators remain responsible for determining what data may be processed and retained.

Research CRUD is scoped to the authenticated HRP-user. A user can explicitly delete a saved research. Monitor definitions can also be deleted by their owner. A formal automatic retention period is not currently enforced; organizations with retention requirements should define one before broad production rollout.

If private server storage is unavailable, `Мои исследования` falls back to browser `localStorage`. Credentials still do not use `localStorage`.

## Evidence and AI output

- Every result receives a `Source ID` (`S001`, `S002`, ...).
- AI prompts instruct the model to cite Source IDs for substantive factual claims.
- Evidence Score checks citation coverage, source coverage, domain diversity, full-text availability, ID validity and corroboration.
- Evidence Score is an auditability and research-quality indicator. It is not a factual truth score.
- AI citations and Evidence Score do not replace human verification for sensitive HR conclusions.
- The system must not use AI output or Evidence Score as the sole basis for employment decisions about an identified individual.

## Recurring monitoring

- User monitor definitions are private and scoped to the authenticated managed user.
- Manual monitor runs require the owner's HRP authorization.
- The scheduled endpoint `/api/cron/monitor` requires `CRON_SECRET` and does not accept HRP credentials as a substitute.
- Automatic monitoring requires private server storage because it needs monitor definitions and snapshots across invocations.
- A URL that is missing from a later search result is labelled as `not found again`; this is not proof that a policy, benefit or practice ended.
- Monitor runs consume the same monthly Firecrawl/OpenAI quota ledger as interactive use.

## Browser storage

- HRP/API codes are not stored in `localStorage`.
- Optional credential persistence uses `sessionStorage`, limited to the browser tab/session.
- Browser research fallback uses `localStorage` only after the user presses `Сохранить`.
- Local history can contain source excerpts and AI reports. Do not save sensitive personal data on a shared computer.
- Local history is not uploaded to GitHub by the application.

## Local mode safeguards

- Run the local Flask proxy on `127.0.0.1`.
- Local `FIRECRAWL_API_KEY` and `OPENAI_API_KEY` belong in `.env` or environment variables.
- `.env`, logs and other local secrets must stay outside Git.
- Local API routes retain request validation, CORS checks and rate limiting.
- Local OpenAI analysis uses the same 140000-character and 6000-token per-request caps as managed mode.

## Deployment

See `docs/MANAGED-SERVICE.md` for production setup. Before enabling managed mode, configure backend secrets and at least one user access-code hash. For centralized history, quota ledger and monitors, connect private server storage. For scheduled monitoring, configure `CRON_SECRET`.
