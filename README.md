# HR Помощник

Веб-инструмент для доказательных HR-исследований: поиск и сбор источников, AI-планирование, многоэтапный анализ, Evidence Score, управленческие отчёты и повторный мониторинг.

## Основные возможности

- веб-поиск, парсинг страниц и обход сайтов через Firecrawl;
- пакетные исследования по техническому заданию;
- AI Research Planner: формирует вопросы исследования, поисковые запросы и полезные домены;
- HR Playbooks: готовые сценарии для удержания, адаптации, наставничества, зарплат и мотивации, wellbeing, дефицитного найма, HR-tech и HR benchmark;
- стабильные `Source ID` вида `S001` для каждого источника;
- многоэтапный AI-анализ всех собранных источников, до 8 промежуточных пакетов плюс финальный синтез;
- доказательный отчёт с ссылками `[S001]` на первоисточники;
- Evidence Score 0-100: цитирование, покрытие источников, разнообразие доменов, полнота текста, корректность Source ID и перекрёстное подтверждение;
- три формата материала: полный отчёт, краткая записка руководителю и структура презентации на 8-10 слайдов;
- `Мои исследования`: приватное серверное хранение с локальным fallback в браузер;
- повторные исследования: daily / weekly / monthly monitoring, сравнение снимков источников и change report;
- персональные месячные квоты и Usage Ledger по Firecrawl и OpenAI;
- экспорт в Excel, Markdown и JSON;
- локальный Flask-режим;
- managed access по персональному коду `HRP-...`.

## Основной сценарий

```text
Техническое задание
        ↓
HR Playbook или свободное ТЗ
        ↓
AI Research Planner
        ↓
поисковые запросы
        ↓
Firecrawl / web sources
        ↓
S001, S002, S003 ...
        ↓
пакетный AI-анализ всех источников
        ↓
Evidence Report + Evidence Score
        ↓
Полный отчёт / Executive Brief / Executive Deck
        ↓
Сохранение / повторный мониторинг
```

## Managed access

Production работает по схеме:

```text
Пользователь -> HRP-код -> HR Помощник gateway -> OpenAI / Firecrawl
                                      |
                                      +-> Private server storage
```

Настоящие `OPENAI_API_KEY` и `FIRECRAWL_API_KEY` находятся на backend и не передаются в браузер.

Текущий `service.json`:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

Managed gateway ограничивает объём запросов независимо от frontend:

- Firecrawl search: до 50 результатов за запрос;
- Firecrawl crawl: до 100 страниц и глубина до 6;
- whitelist поддерживаемых Firecrawl-параметров;
- AI input: до 140000 символов;
- AI output: до 6000 completion tokens;
- per-user rate limits;
- месячные квоты по тарифу пользователя.

## Usage Ledger и квоты

Для каждого именованного HRP-пользователя учитываются поисковые запросы, Firecrawl units, crawl pages, AI calls, AI input chars и реальные OpenAI token usage. В интерфейсе кнопка `Лимиты` показывает текущий тариф, использование и остатки.

Планы по умолчанию: `demo`, `standard`, `owner`. План и индивидуальные квоты можно задавать прямо в `MANAGED_ACCESS_USERS_JSON`:

```json
[
  {
    "user": "ivan.petrov",
    "hash": "<sha256>",
    "enabled": true,
    "plan": "standard",
    "quota": {
      "ai_calls": 250,
      "firecrawl_units": 8000,
      "saved_researches": 50,
      "monitors": 10
    }
  }
]
```

При подключённом private server storage Usage Ledger централизован между serverless-инстансами. Без него код переходит на runtime fallback, при этом жёсткие лимиты одного запроса продолжают действовать.

Опционально можно показывать оценочную стоимость, если заданы тарифные переменные:

```text
HRP_OPENAI_INPUT_PER_MILLION_USD
HRP_OPENAI_OUTPUT_PER_MILLION_USD
HRP_FIRECRAWL_UNIT_USD
```

## Мои исследования

В managed-режиме кнопка `Сохранить` записывает исследование в приватное server storage в пользовательский namespace. Сохраняются ТЗ, источники, AI-отчёт, Evidence Score и подготовленные форматы отчёта. Кнопка `Мои исследования` позволяет открыть или удалить сохранённый проект с другого сеанса после входа тем же HRP-кодом.

Если private server storage ещё не подключено, интерфейс использует локальный `localStorage` как fallback. Такой fallback доступен только в текущем браузере.

## Evidence Score

После AI-анализа система рассчитывает Evidence Score 0-100. Оценка строится детерминированно по самому отчёту и набору источников, а не отдельным AI-суждением.

Проверяются:

- доля фактических тезисов с Source ID;
- доля источников, реально использованных в доказательствах;
- разнообразие доменов;
- наличие полных текстов;
- отсутствие выдуманных Source ID;
- наличие перекрёстного подтверждения несколькими источниками.

Score помогает увидеть слабые места исследования, но не заменяет профессиональную проверку выводов, особенно для решений о конкретных сотрудниках.

## HR Playbooks

Кнопка `HR-сценарии` открывает готовые исследовательские шаблоны:

- удержание и текучесть;
- адаптация новичков;
- наставничество;
- рынок зарплат и мотивация;
- льготы и wellbeing;
- найм дефицитных специалистов;
- HR-tech и автоматизация;
- HR benchmark работодателей.

Пользователь заполняет 3-5 параметров, после чего получает развёрнутое ТЗ и может запустить AI Research Planner.

## Форматы отчёта

После полного AI-анализа доступны:

- `Полный отчёт` - доказательный аналитический документ;
- `Краткая записка` - executive summary, ключевые выводы, действия и риски;
- `Презентация` - готовая структура 8-10 слайдов с тезисами, Source ID и акцентом докладчика.

Форматы создаются из уже проверенного полного отчёта и не должны добавлять новые факты.

## Повторные исследования и мониторинг

Текущее ТЗ и поисковые запросы можно сохранить как daily, weekly или monthly monitor. При каждом запуске система повторяет поиск, строит новый snapshot и сравнивает его с предыдущим:

```text
предыдущий snapshot
        +
новый поиск
        ↓
added / changed / not found again
        ↓
AI Change Report
```

Отсутствие старой ссылки в новой поисковой выдаче не трактуется как доказательство прекращения практики. Такие случаи помечаются как требующие проверки.

Ручной `Проверить сейчас` работает через managed endpoint. Автоматический запуск настроен через Vercel Cron один раз в сутки и запускает те monitors, срок которых наступил. Для автоматического режима требуется `CRON_SECRET` и private server storage.

## Vercel production

Обязательные backend variables:

```text
OPENAI_API_KEY
FIRECRAWL_API_KEY
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=none
MANAGED_ACCESS_USERS_JSON
CORS_ORIGINS
```

Для автоматического monitoring:

```text
CRON_SECRET
```

Для админ-панели дополнительно используются:

```text
ADMIN_ACCESS_CODE_HASH
VERCEL_API_TOKEN
```

Для централизованного Usage Ledger, `Мои исследования` и monitors проект должен иметь подключённое private Vercel Blob storage. Backend работает через `@vercel/blob` с `access: "private"`.

`GET /api/health` показывает безопасный статус инфраструктуры, включая:

```text
server_storage_ready
usage_ledger_mode
cron_configured
recurring_monitoring_ready
```

## Локальный запуск

```powershell
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env
python server.py
```

Откройте `http://127.0.0.1:8765/`.

## Проверки качества

Основной CI выполняет:

```text
Python tests
-> Node dependencies
-> JavaScript syntax checks
-> managed access tests
-> Evidence Score regression tests
-> secret scan
-> static build
```

Отдельный `AI Project Standard` контролирует обязательные проектные файлы и отсутствие локальных/чувствительных файлов в Git.

## Структура

```text
HR_Pomoshnik/
├── api/
│   ├── _lib/              # access, quotas, private storage, monitor runner
│   ├── ai/                # OpenAI gateway
│   ├── firecrawl/         # Firecrawl gateway
│   ├── usage/             # personal usage dashboard API
│   ├── research/          # server-side research CRUD
│   ├── monitor/           # monitor CRUD/manual run
│   └── cron/              # scheduled monitor runner
├── app/                   # локальный Flask-контур
├── static/                # frontend JS/CSS
├── templates/             # HTML-шаблон
├── docs/                  # статическая сборка и документация
├── tests/                 # Python и Node regression tests
├── service.json
├── AGENTS.md
├── PROJECT.md
├── SECURITY.md
├── vercel.json
└── server.py
```

## Безопасность

Секреты исключаются из Git. HRP-коды проверяются по SHA-256. CORS ограничивается разрешёнными Origin. Персональные исследования в server storage разделены по хэшированному пользовательскому namespace. Исследования могут содержать чувствительные сведения, поэтому пользователь должен сохранять только те данные, которые разрешено обрабатывать в данном сервисе.

Подробно: [SECURITY.md](SECURITY.md) и [docs/MANAGED-SERVICE.md](docs/MANAGED-SERVICE.md).
