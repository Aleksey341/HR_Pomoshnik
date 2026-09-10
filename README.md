# HR Помощник

Веб-инструмент для HR-исследований: поиск информации в интернете, пакетный сбор источников, парсинг страниц, экспорт материалов и AI-анализ результатов.

Проект перенесён из Parser в отдельный репозиторий и развивается как самостоятельный продукт.

## Основные возможности

- веб-поиск и сбор источников;
- пакетные исследования по техническому заданию;
- загрузка полного текста страниц;
- обход каталогов и сайтов;
- экспорт результатов в Excel и Markdown;
- AI-анализ собранных материалов;
- локальный режим с Flask;
- managed access для пользователей по персональному коду `HRP-...`.

## Managed access

Архитектура сделана по модели 1С Аналитик.

В production пользователь вводит только персональный код доступа. Настоящие `OPENAI_API_KEY` и `FIRECRAWL_API_KEY` находятся на backend и не передаются в браузер.

```text
Пользователь -> HRP-код -> HR Помощник gateway -> OpenAI / Firecrawl
```

Для постоянного администрирования пользователей:

```powershell
python scripts/access_users.py add ivan.petrov
python scripts/access_users.py list
python scripts/access_users.py disable ivan.petrov
python scripts/access_users.py export
```

Открытый `ACCESS_CODE` показывается только при создании пользователя. Локальный `access-users.json` хранит имя, SHA-256 и статус, включён в `.gitignore` и не содержит самого открытого кода.

Разовая генерация без реестра:

```powershell
python scripts/make_access_code.py --user ivan.petrov
```

На backend основной реестр задаётся в `MANAGED_ACCESS_USERS_JSON`.

Подробно: [docs/MANAGED-SERVICE.md](docs/MANAGED-SERVICE.md).

## Текущий режим

`service.json` пока установлен в `direct`. Это сохраняет работоспособность текущего браузерного варианта до подключения production backend и серверных секретов.

После deployment backend достаточно переключить:

```json
{
  "mode": "managed",
  "managed_base_url": "https://<ваш-домен>/api"
}
```

При размещении frontend и API в одном Vercel-проекте можно использовать `/api`.

## Vercel

Репозиторий подготовлен для Vercel:

- `api/ai/analyze.js` - OpenAI gateway;
- `api/firecrawl/*` - Firecrawl gateway;
- `api/health.js` - безопасная проверка конфигурации;
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

`MANAGED_ACCESS_CODE_HASHES` поддерживается для совместимости со старой схемой.

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
├── vercel.json
├── server.py
└── README.md
```

## Безопасность

Секреты исключаются из Git. Пользовательские коды в managed mode проверяются по SHA-256. Именованного пользователя можно отключить отдельно. CORS ограничивается разрешёнными Origin. Код, введённый пользователем, может сохраняться только в `sessionStorage` до закрытия вкладки.

См. [SECURITY.md](SECURITY.md) и [docs/MANAGED-SERVICE.md](docs/MANAGED-SERVICE.md).
