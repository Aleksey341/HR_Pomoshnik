# HR Помощник: managed access

В production пользователь вводит один персональный код вида `HRP-...`. Ключи OpenAI и Firecrawl хранятся только на backend и не попадают в браузер, GitHub Pages или исходный код.

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
MANAGED_ACCESS_USERS_JSON=[{"user":"ivan.petrov","hash":"<sha256>","enabled":true}]
CORS_ORIGINS=https://aleksey341.github.io
```

`MANAGED_ACCESS_CODE_HASHES` оставлен только для совместимости со старой схемой. Для новых пользователей используется `MANAGED_ACCESS_USERS_JSON`.

## Управление пользователями

Локальный реестр `access-users.json` включён в `.gitignore`. Он хранит имя пользователя, SHA-256 кода и статус. Сам открытый `HRP-...` после генерации в реестр не записывается.

### Добавить пользователя

```powershell
python scripts/access_users.py add ivan.petrov
```

Команда один раз покажет:

```text
USER=ivan.petrov
ACCESS_CODE=HRP-...
```

Передайте пользователю только `ACCESS_CODE`.

### Посмотреть пользователей

```powershell
python scripts/access_users.py list
```

### Отключить пользователя

```powershell
python scripts/access_users.py disable ivan.petrov
```

### Включить обратно

```powershell
python scripts/access_users.py enable ivan.petrov
```

### Получить значение для Vercel

```powershell
python scripts/access_users.py export
```

Результат целиком записывается в Environment Variable `MANAGED_ACCESS_USERS_JSON`, затем выполняется redeploy.

Для разовой генерации без локального реестра также доступно:

```powershell
python scripts/make_access_code.py --user ivan.petrov
```

## Backend endpoints

- `GET /api/access/check` - бесплатная проверка пользовательского кода;
- `POST /api/firecrawl/search`;
- `POST /api/firecrawl/scrape`;
- `POST /api/firecrawl/crawl`;
- `GET /api/firecrawl/get`;
- `POST /api/ai/analyze`;
- `GET /api/health`.

Все рабочие endpoints, кроме health, требуют `Authorization: Bearer HRP-...`.

`/api/access/check` возвращает подтверждение доступа и имя пользователя из реестра. Интерфейс использует этот endpoint для кнопки `Проверить доступ`, поэтому для проверки кода не расходуются кредиты Firecrawl и OpenAI.

`/api/health` показывает только безопасный статус конфигурации: настроены ли OpenAI, Firecrawl и сколько именованных пользователей активно. Секреты и хэши endpoint не возвращает.

## Включение managed mode

После развёртывания backend измените `service.json`.

Если frontend размещён на GitHub Pages, укажите абсолютный адрес backend:

```json
{
  "mode": "managed",
  "managed_base_url": "https://<ваш-vercel-домен>/api"
}
```

Если frontend и backend находятся в одном Vercel-проекте:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

После переключения интерфейс показывает поле `Код доступа HR Помощник`, кнопку `Проверить доступ`, а отдельное поле OpenAI key скрывается.

## Безопасность

- API keys не передаются пользователям.
- Пользовательские коды на backend проверяются только по SHA-256.
- Именованный пользователь может быть отключён отдельно от остальных.
- В браузере код может сохраняться только в `sessionStorage`, до закрытия вкладки.
- CORS ограничивается разрешёнными Origin.
- `access-users.json`, `.env` и реальные секреты исключены из Git.
- CI проверяет синтаксис gateway, тестирует named access и отклоняет коммиты с похожими на реальные `sk-...`/`fc-...` секретами.
