# HR Помощник

Веб-инструмент для HR-исследований: поиск информации в интернете, пакетный сбор источников, парсинг страниц, AI-планирование исследования, многоэтапный AI-анализ и evidence-отчёты.

Проект перенесён из Parser в отдельный репозиторий и развивается как самостоятельный продукт.

## Основные возможности

- веб-поиск и сбор источников;
- пакетные исследования по техническому заданию;
- AI Research Planner: формирует вопросы исследования, поисковые запросы и полезные домены из ТЗ;
- загрузка полного текста страниц;
- обход каталогов и сайтов;
- присвоение каждому источнику стабильного `Source ID` вида `S001`;
- многоэтапный AI-анализ всех собранных источников, а не только первых 30;
- доказательный AI-отчёт с ссылками `[S001]` на первоисточники и реестром источников;
- rich markdown: заголовки, списки, таблицы, ссылки, цитаты;
- локальная история до 6 сохранённых исследований в браузере;
- экспорт результатов в Excel, Markdown и JSON;
- локальный режим с Flask;
- managed access для пользователей по персональному коду `HRP-...`.

## Managed access

Production работает по схеме:

```text
Пользователь -> HRP-код -> HR Помощник gateway -> OpenAI / Firecrawl
```

Настоящие `OPENAI_API_KEY` и `FIRECRAWL_API_KEY` находятся на backend и не передаются в браузер.

Текущий `service.json`:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

Managed gateway дополнительно ограничивает стоимость и объём запросов независимо от frontend:

- Firecrawl search: до 50 результатов за один запрос;
- Firecrawl crawl: до 100 страниц и глубина до 6;
- whitelist поддерживаемых Firecrawl-параметров;
- rate-limit по HRP-пользователю;
- AI input: до 140 000 символов за запрос;
- AI output: до 6 000 completion tokens;
- отдельный rate-limit AI-вызовов.

## Как работает большое исследование

```text
Техническое задание
        ↓
AI Research Planner
        ↓
8-20+ поисковых запросов
        ↓
Firecrawl / web sources
        ↓
S001, S002, S003 ...
        ↓
до 8 промежуточных AI-пакетов
        ↓
финальный синтез
        ↓
Evidence Report + реестр источников
```

При большом количестве источников система распределяет их по нескольким пакетам так, чтобы каждый источник участвовал в анализе. Существенные фактические выводы должны сопровождаться Source ID.

## История исследований

Кнопка `Сохранить` сохраняет текущее исследование и AI-отчёт в `localStorage` этого браузера. Кнопка `История` позволяет открыть или удалить сохранённое исследование.

История локальная: данные не отправляются в GitHub и не синхронизируются между устройствами. На общем компьютере не следует сохранять исследования с чувствительными персональными данными.

## Управление пользователями

Для постоянного администрирования пользователей:

```powershell
python scripts/access_users.py add ivan.petrov
python scripts/access_users.py list
python scripts/access_users.py disable ivan.petrov
python scripts/access_users.py enable ivan.petrov
python scripts/access_users.py export
```

Открытый `ACCESS_CODE` показывается только при создании пользователя. Локальный `access-users.json` хранит имя, SHA-256 и статус, включён в `.gitignore` и не содержит самого открытого кода.

На backend основной реестр задаётся в `MANAGED_ACCESS_USERS_JSON`.

Подробно: [docs/MANAGED-SERVICE.md](docs/MANAGED-SERVICE.md).

## Vercel

Репозиторий подготовлен для Vercel:

- `api/ai/analyze.js` - OpenAI gateway;
- `api/firecrawl/*` - Firecrawl gateway;
- `api/health.js` - безопасная проверка конфигурации;
- `api/admin/*` - управление пользователями и deployment;
- `vercel.json` - маршрутизация frontend;
- `package.json` - Node runtime.

В Environment Variables production-проекта задаются:

```text
OPENAI_API_KEY
FIRECRAWL_API_KEY
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=none
MANAGED_ACCESS_USERS_JSON
CORS_ORIGINS
```

Для автоматизированной админ-панели дополнительно используются `ADMIN_ACCESS_CODE_HASH` и `VERCEL_API_TOKEN`.

Реальные ключи нельзя коммитить в GitHub.

## Локальный запуск

```powershell
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env
python server.py
```

Откройте `http://127.0.0.1:8765/`.

В локальном режиме можно использовать собственные Firecrawl/OpenAI keys из `.env`.

## Сборка статической версии

```powershell
python scripts/build_static.py
```

Скрипт формирует `docs/` из `templates/` и `static/`, а также копирует `service.json`.

## Проверки качества

Основной CI запускает:

```text
Python tests
→ JavaScript syntax checks
→ managed access / API guard tests
→ secret scan
→ static build
```

Отдельный `AI Project Standard` контролирует обязательные проектные файлы и отсутствие локальных/чувствительных файлов в Git.

## Структура

```text
HR_Pomoshnik/
├── api/                 # managed gateway для OpenAI и Firecrawl
├── app/                 # локальное Flask-приложение
├── static/              # клиентский JavaScript/CSS
├── templates/           # HTML-шаблон
├── docs/                # статическая сборка и документация
├── scripts/             # сборка и управление HRP-пользователями
├── tests/               # Python и Node-тесты
├── service.json         # direct/managed runtime mode
├── AGENTS.md
├── PROJECT.md
├── vercel.json
└── server.py
```

## Безопасность

Секреты исключаются из Git. Пользовательские коды в managed mode проверяются по SHA-256. Именованного пользователя можно отключить отдельно. CORS ограничивается разрешёнными Origin. Код, введённый пользователем, может сохраняться только в `sessionStorage` до закрытия вкладки.

См. [SECURITY.md](SECURITY.md) и [docs/MANAGED-SERVICE.md](docs/MANAGED-SERVICE.md).
