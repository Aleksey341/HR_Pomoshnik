# Firecrawl Parser

Инструмент для **поиска в интернете**, **пакетного исследования**, **обхода каталогов** и **AI-анализа** собранных материалов.

## Онлайн (GitHub Pages)

**https://aleksey341.github.io/Parser/**

1. Введите полученный API-ключ.
2. Вкладка **«Исследование»** → сформируйте запросы → запустите сбор.
3. Экспорт в **Excel** / **Markdown**, затем **AI-анализ**.

> Python не нужен — работает в браузере. Ключи по умолчанию **не сохраняются** в `localStorage`.

> Корневые `index.html` / `firecrawl_parser.html` — только редирект на `docs/`. Рабочий UI: Pages или `python server.py`.

---

## Локальный запуск

```bash
pip install -r requirements.txt
python -m playwright install chromium
# опционально: скопируйте .env.example → .env и задайте ключи
python server.py
```

Откройте: http://127.0.0.1:8765/

Переменные окружения — см. [`.env.example`](.env.example).

### Локальные движки парсинга (вкладка «Парсинг URL»)

| Движок | Когда использовать |
| --- | --- |
| **Firecrawl** | Поиск, crawl, облачный scrape (нужен ключ) |
| **curl_cffi** | Быстрый локальный scrape с TLS-fingerprint Chrome, без кредитов |
| **Браузер** | JS / antibot: CloakBrowser, иначе Playwright |

AgentReach в продукт не встроен — это отдельный CLI для агента (соцсети, YouTube и т.д.).

---

## Сборка GitHub Pages

```bash
python scripts/build_static.py
```

Публикуется содержимое папки `docs/` (генерируется из `templates/` + `static/`).

---

## Структура проекта

```
Parser/
├── app/                 # Flask-приложение, валидация, клиенты API
├── static/js/           # ESM-модули (api, ai, crawl, research, …)
├── templates/           # Единый HTML-шаблон
├── tests/               # pytest
├── scripts/build_static.py
├── docs/                # GitHub Pages (генерируется)
├── server.py
├── .env.example
└── README.md
```

---

## Безопасность

См. [SECURITY.md](SECURITY.md).

---

## Лицензия

MIT
