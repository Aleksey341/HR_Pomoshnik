# PROJECT.md

## 1. Что такое HR Помощник
`HR_Pomoshnik` - веб-инструмент для HR-исследований: поиск и сбор источников, парсинг страниц, пакетный AI-анализ, доказательные отчёты и экспорт результатов. Продукт поддерживает локальный режим и managed access через backend gateway.

## 2. Продуктовые принципы
- Проверяемый исследовательский результат с сохранением связи с источниками.
- Каждый собранный источник получает стабильный `Source ID` вида `S001`.
- Существенные факты в AI-отчёте должны ссылаться на Source ID.
- Большие исследования анализируются пакетно без ограничения первыми 30 источниками.
- Секреты внешних сервисов хранятся на backend или локально, а не в публичном клиентском коде.
- Пользовательские и HR-данные не должны попадать в Git без необходимости и обезличивания.
- AI-вывод отделяется от фактов, полученных из источников.
- Managed access должен позволять отключать отдельного пользователя без раскрытия открытого кода.

## 3. Capability Ledger
| Capability | State | Note |
|---|---|---|
| Веб-поиск и сбор источников | included | Основной исследовательский сценарий |
| Пакетные исследования | included | Работа по техническому заданию |
| AI Research Planner | included | Формирует вопросы, 8-20+ поисковых запросов и полезные домены из ТЗ |
| Парсинг полного текста страниц | included | Через существующий pipeline |
| Обход каталогов и сайтов | included | Используется в исследовательских задачах |
| Source ID / evidence links | included | Источники `S001...`, ссылки из AI-выводов на первоисточники |
| Многоэтапный AI-анализ | included | До 8 промежуточных пакетов + финальный синтез |
| Evidence report | included | Rich markdown, таблицы, source refs и реестр источников |
| Локальная история исследований | included | До 6 сохранённых исследований в localStorage браузера |
| Экспорт Excel/Markdown/JSON | included | Excel содержит Source ID и отдельный лист `Источники` |
| Локальный Flask-режим | included | Для локальной работы |
| Managed access по HRP-коду | included | Серверная проверка кода |
| Server-side Firecrawl limits | included | Whitelist payload, search <= 50, crawl <= 100, rate limits |
| Server-side AI limits | included | Вход <= 140000 символов, output <= 6000 tokens, rate limit |
| OpenAI/Firecrawl secrets в browser-коде | prohibited | В managed mode секреты остаются на backend |
| Коммит открытых access-кодов | prohibited | Коды не должны попадать в Git |
| Коммит HR-персональных данных | prohibited | Только при отдельной задаче и после обезличивания |
| Ослабление CORS без отдельной задачи | prohibited | Security boundary |
| Production backend | available | Vercel managed gateway |

## 4. Основные контуры
### Managed
`Пользователь -> HRP-код -> gateway -> OpenAI / Firecrawl`

Исследование:
`ТЗ -> AI Research Planner -> поисковые запросы -> Firecrawl -> Source ID -> пакетный AI-анализ -> Evidence Report`

### Local
`browser -> Flask -> локальные integrations`

Режим задается через `service.json`. Текущий production-конфиг использует `managed`.

## 5. Безопасность
Источники истины по безопасности: `SECURITY.md` и `docs/MANAGED-SERVICE.md`.

Обязательные правила:
- API keys не коммитятся;
- открытые пользовательские коды не сохраняются в Git;
- backend secrets не передаются в браузер;
- managed gateway ограничивает размер и стоимость запросов независимо от frontend;
- пользовательские исследования и HR-данные не используются как test fixtures без обезличивания;
- локальная история хранится только в браузере пользователя и не отправляется в Git;
- изменение managed access сопровождается тестами отказа и успешной авторизации.

## 6. Критерий готовности изменения
Для изменения продукта должен существовать наблюдаемый сигнал:
- unit/integration test;
- успешный `ci-build.yml`;
- успешный `AI Project Standard`;
- JavaScript syntax checks для managed gateway и research suite;
- managed access/limits tests;
- smoke-check локального режима при изменении Flask-контура;
- проверка отсутствия утечки secrets для security-изменений.

## 7. Источники истины
| Вопрос | Источник |
|---|---|
| Правила AI-агентов | `AGENTS.md` |
| Возможности продукта | `PROJECT.md` |
| Пользовательское описание и запуск | `README.md` |
| Security | `SECURITY.md`, `docs/MANAGED-SERVICE.md` |
| Реальное поведение | код и тесты текущей ветки |
