# HR Помощник: managed access

В production пользователь вводит один персональный код вида `HRP-...`. Ключи OpenAI и Firecrawl хранятся только на backend и не попадают в браузер, GitHub Pages или исходный код.

## Схема

```text
Пользователь
    |
    | Authorization: Bearer HRP-...
    v
HR Помощник managed gateway
    |             |                |
    |             |                +-> private server storage
    |             +-> OPENAI_API_KEY
    +-> FIRECRAWL_API_KEY
```

## Переменные окружения backend

Обязательные:

```text
FIRECRAWL_API_KEY=<server Firecrawl key>
OPENAI_API_KEY=<server OpenAI key>
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=none
MANAGED_ACCESS_USERS_JSON=[{"user":"ivan.petrov","hash":"<sha256>","enabled":true,"plan":"standard"}]
CORS_ORIGINS=https://aleksey341.github.io
```

Для автоматического повторного мониторинга:

```text
CRON_SECRET=<random secret>
```

Опционально:

```text
HRP_DEFAULT_PLAN=standard
HRP_OPENAI_INPUT_PER_MILLION_USD=<rate>
HRP_OPENAI_OUTPUT_PER_MILLION_USD=<rate>
HRP_FIRECRAWL_UNIT_USD=<rate>
```

`MANAGED_ACCESS_CODE_HASHES` оставлен для совместимости со старой схемой. Для новых пользователей используется `MANAGED_ACCESS_USERS_JSON`.

## Тариф и индивидуальные квоты

Именованному пользователю можно задать план и overrides:

```json
[
  {
    "user": "ivan.petrov",
    "hash": "<sha256>",
    "enabled": true,
    "plan": "standard",
    "quota": {
      "search_requests": 500,
      "firecrawl_units": 10000,
      "ai_calls": 400,
      "ai_input_chars": 15000000,
      "ai_output_tokens": 600000,
      "saved_researches": 100,
      "monitors": 20
    }
  }
]
```

Built-in планы: `demo`, `standard`, `owner`. Индивидуальный `quota` переопределяет отдельные лимиты выбранного плана.

## Private server storage

Для централизованного Usage Ledger, `Мои исследования` и recurring monitors проект должен иметь подключённое private Vercel Blob storage. Node backend использует `@vercel/blob` с private access.

Назначение storage:

```text
usage/<user-hash>/<month>/...        monthly usage events
research/<user-hash>/...             saved researches
research-index/<user-hash>.json      user research index
monitors/<user-hash>/...             monitor definitions and snapshots
monitor-runs/<user-hash>/...         change reports
```

Literal username в storage pathname не используется. `user-hash` строится из SHA-256 managed username. Авторизация всё равно проверяется на endpoint и не заменяется знанием pathname.

Если storage не подключено:

- поиск, парсинг и AI продолжают работать;
- жёсткие server-side request caps продолжают работать;
- Usage Ledger переходит в runtime fallback;
- `Мои исследования` использует browser localStorage fallback;
- server recurring monitors недоступны.

Текущий режим можно проверить через `GET /api/health`.

## Управление пользователями

Локальный реестр `access-users.json` включён в `.gitignore`. Он хранит имя пользователя, SHA-256 кода и статус. Сам открытый `HRP-...` после генерации в реестр не записывается.

```powershell
python scripts/access_users.py add ivan.petrov
python scripts/access_users.py list
python scripts/access_users.py disable ivan.petrov
python scripts/access_users.py enable ivan.petrov
python scripts/access_users.py export
```

`ACCESS_CODE=HRP-...` показывается только при создании пользователя. Результат `export` записывается в `MANAGED_ACCESS_USERS_JSON`, после чего выполняется redeploy.

## Backend endpoints

Access and health:

```text
GET  /api/access/check
GET  /api/health
```

Research providers:

```text
POST /api/firecrawl/search
POST /api/firecrawl/scrape
POST /api/firecrawl/crawl
GET  /api/firecrawl/get
POST /api/ai/analyze
```

Usage:

```text
GET /api/usage/me
```

Server researches:

```text
GET  /api/research/list
GET  /api/research/get?id=...
POST /api/research/save
POST /api/research/delete
```

Recurring monitoring:

```text
GET  /api/monitor/list
POST /api/monitor/save
POST /api/monitor/run
POST /api/monitor/delete
GET  /api/cron/monitor
```

Рабочие user endpoints требуют `Authorization: Bearer HRP-...`. `/api/health` возвращает только безопасный статус. `/api/cron/monitor` использует `Authorization: Bearer <CRON_SECRET>`.

## Usage Ledger

Интерактивные Firecrawl/OpenAI calls и monitor runs записывают использование по именованному пользователю. `GET /api/usage/me` возвращает:

```text
plan
month
usage
limits
remaining
centralized
estimated_cost_usd
```

OpenAI usage записывает фактические token counts из API response. Firecrawl расход учитывается в условных units по типу операции. Для billing-grade расчёта тарифная модель Firecrawl должна быть синхронизирована с фактическим тарифом внешнего сервиса.

## Мои исследования

В managed mode `Сохранить` отправляет компактную копию исследования на backend. Сохраняются:

- ТЗ;
- source metadata и ограниченные фрагменты текста;
- AI report;
- Evidence Score;
- Executive Brief / Deck variants, если они уже сформированы.

Пользователь может открыть или удалить свои записи. При отсутствии server storage frontend использует localStorage fallback.

## Recurring monitoring

Пользователь может сохранить текущее ТЗ и поисковые запросы как monitor с cadence:

```text
daily
weekly
monthly
```

Ручная кнопка `Проверить сейчас` выполняет run сразу. `vercel.json` содержит daily cron `0 6 * * *`. Один cron tick выбирает due monitors и запускает их серверно.

Run строит новый snapshot URL/content hashes и сравнивает его с предыдущим:

```text
added
changed
not found again
```

`not found again` означает только отсутствие ссылки в текущей поисковой выборке. Это не доказательство прекращения HR-практики.

Для automatic cron обязательны private server storage и `CRON_SECRET`.

## Включение managed mode

Если frontend и backend находятся в одном Vercel-проекте:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

Если frontend размещён отдельно, `managed_base_url` должен указывать на разрешённый backend URL, а `CORS_ORIGINS` должен содержать frontend origin.

## Проверка production

Без передачи пользовательского кода можно проверить:

```text
GET /api/health
```

Важные поля:

```text
openai_configured
firecrawl_configured
access_codes_configured
server_storage_ready
usage_ledger_mode
cron_configured
recurring_monitoring_ready
```

`recurring_monitoring_ready=true` означает, что доступны и private server storage, и `CRON_SECRET`.

## Безопасность

- API keys не передаются пользователям.
- HRP-коды проверяются по SHA-256.
- Пользовательские researches/monitors изолируются по authenticated user.
- Private storage может содержать чувствительные исследования, поэтому не следует загружать данные, которые нельзя обрабатывать в сервисе.
- CORS ограничивается разрешёнными Origin.
- CI проверяет Python, JavaScript, access tests, Evidence Score regression и отсутствие похожих на реальные `sk-...` / `fc-...` secrets.
- Подробнее: `SECURITY.md`.
