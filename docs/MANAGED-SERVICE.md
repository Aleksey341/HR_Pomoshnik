# HR Помощник: managed access

В production пользователь вводит один код доступа вида `HRP-...`. Ключи OpenAI и Firecrawl хранятся только на backend и не попадают в браузер, GitHub Pages, исходный код или установочные файлы.

## Схема

```text
Пользователь
    |
    | Authorization: Bearer HRP-...
    v
HR Помощник managed gateway
    |                     |
    | FIRECRAWL_API_KEY   | OPENAI_API_KEY
    v                     v
Firecrawl API          OpenAI API
```

## Переменные окружения backend

```text
FIRECRAWL_API_KEY=<серверный Firecrawl key>
OPENAI_API_KEY=<серверный OpenAI key>
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=none
MANAGED_ACCESS_CODE_HASHES=<sha256-1>,<sha256-2>,...
CORS_ORIGINS=https://aleksey341.github.io
```

Реальные значения секретов не добавляются в репозиторий.

## Выдача пользовательского кода

На администраторском компьютере:

```powershell
python scripts/make_access_code.py
```

Скрипт выдаёт:

```text
ACCESS_CODE=HRP-...
SHA256=...
```

Пользователю передаётся только `ACCESS_CODE`. На сервере в `MANAGED_ACCESS_CODE_HASHES` сохраняется только `SHA256`.

Чтобы отключить пользователя, удалите соответствующий hash из `MANAGED_ACCESS_CODE_HASHES` и выполните redeploy backend.

## Backend endpoints

- `POST /api/firecrawl/search`
- `POST /api/firecrawl/scrape`
- `POST /api/firecrawl/crawl`
- `GET /api/firecrawl/get`
- `POST /api/ai/analyze`
- `GET /api/health`

Все рабочие endpoints, кроме health, требуют `Authorization: Bearer HRP-...`.

## Включение managed mode

После развёртывания backend измените `service.json`:

```json
{
  "mode": "managed",
  "managed_base_url": "https://<ваш-домен>/api"
}
```

Если frontend и backend размещены в одном Vercel-проекте, можно использовать:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

После этого интерфейс автоматически заменит поле Firecrawl key на поле `Код доступа HR Помощник`, а отдельное поле OpenAI key скроется.

## Безопасность

- API keys не передаются пользователям.
- Пользовательские коды не хранятся на сервере в открытом виде.
- В браузере код можно сохранить только в `sessionStorage`, то есть до закрытия вкладки.
- CORS ограничивается списком разрешённых Origin.
- Следующая версия механизма доступа может вынести коды из переменной окружения в БД, чтобы добавлять и отзывать пользователей без redeploy.
