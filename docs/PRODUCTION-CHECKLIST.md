# HR Помощник: запуск production

Используйте этот порядок при первом развёртывании и при смене API-ключей.

## 1. Backend

Подключить репозиторий `Aleksey341/HR_Pomoshnik` к Vercel.

Задать Environment Variables:

```text
OPENAI_API_KEY=<новый серверный OpenAI key>
FIRECRAWL_API_KEY=<серверный Firecrawl key>
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=none
MANAGED_ACCESS_USERS_JSON=<JSON из scripts/access_users.py export>
CORS_ORIGINS=https://aleksey341.github.io
```

Секреты не добавлять в GitHub.

## 2. Первый пользователь

На администраторском компьютере:

```powershell
python scripts/access_users.py add admin
python scripts/access_users.py export
```

Передать `ACCESS_CODE=HRP-...` владельцу. Значение из `export` записать в `MANAGED_ACCESS_USERS_JSON` и выполнить redeploy.

## 3. Health-check

Открыть:

```text
https://<vercel-domain>/api/health
```

Ожидается:

```json
{
  "ok": true,
  "openai_configured": true,
  "firecrawl_configured": true,
  "access_codes_configured": true,
  "named_users_configured": 1
}
```

Не включать managed mode, пока хотя бы один из трёх флагов конфигурации не готов.

## 4. Проверка HRP-кода

Вызвать `GET /api/access/check` с заголовком:

```text
Authorization: Bearer HRP-...
```

Ожидается `200` и имя пользователя.

## 5. Проверка сервисов

Сначала выполнить небольшой Firecrawl search, затем AI-анализ на коротком тестовом наборе. Проверить отсутствие `401`, `403`, `429`, `5xx`.

## 6. Включение managed mode

Если frontend и backend на одном Vercel-домене:

```json
{
  "mode": "managed",
  "managed_base_url": "/api"
}
```

Если frontend остаётся на GitHub Pages:

```json
{
  "mode": "managed",
  "managed_base_url": "https://<vercel-domain>/api"
}
```

Обновить также `docs/service.json` или выполнить `python scripts/build_static.py`.

## 7. Проверка интерфейса

В браузере должны отображаться:

- название `HR Помощник`;
- поле `Код доступа HR Помощник`;
- кнопка `Проверить доступ`;
- скрытое поле OpenAI API key;
- подтверждение имени пользователя после проверки HRP-кода.

## 8. Смена OpenAI API key

Заменить только `OPENAI_API_KEY` в Environment Variables Vercel и выполнить redeploy. Пользовательские `HRP-...` коды менять не требуется.

## 9. Отзыв пользователя

```powershell
python scripts/access_users.py disable user.name
python scripts/access_users.py export
```

Обновить `MANAGED_ACCESS_USERS_JSON` на backend и выполнить redeploy. Остальные пользователи продолжают работать со своими кодами.
