# PROJECT.md

## 1. Что такое HR Помощник
`HR_Pomoshnik` - веб-инструмент для доказательных HR-исследований: поиск и сбор источников, AI-планирование, пакетный анализ, оценка доказательной базы, управленческие отчёты, сохранение проектов и повторный мониторинг.

## 2. Продуктовые принципы
- Проверяемый исследовательский результат с сохранением связи с источниками.
- Каждый собранный источник получает стабильный `Source ID` вида `S001`.
- Существенные факты в AI-отчёте должны ссылаться на Source ID.
- Evidence Score показывает качество доказательной базы по детерминированным правилам и не заменяет профессиональную проверку.
- Большие исследования анализируются пакетно без ограничения первыми 30 источниками.
- Повторный мониторинг сравнивает snapshots, но отсутствие ссылки в новой выдаче не считается доказательством прекращения практики.
- Секреты внешних сервисов хранятся на backend или локально, а не в публичном клиентском коде.
- Пользовательские и HR-данные не должны попадать в Git без необходимости и обезличивания.
- Managed access должен позволять отключать отдельного пользователя и применять индивидуальные квоты.

## 3. Capability Ledger
| Capability | State | Note |
|---|---|---|
| Веб-поиск и сбор источников | included | Основной исследовательский сценарий |
| Пакетные исследования | included | Работа по техническому заданию |
| AI Research Planner | included | Формирует вопросы, поисковые запросы и полезные домены |
| HR Playbooks | included | 8 готовых HR-сценариев с параметрами |
| Парсинг полного текста страниц | included | Firecrawl / local pipeline |
| Обход каталогов и сайтов | included | Для исследовательских задач |
| Source ID / evidence links | included | Источники `S001...`, ссылки из AI-выводов |
| Многоэтапный AI-анализ | included | До 8 промежуточных пакетов + финальный синтез |
| Evidence report | included | Rich markdown, source refs, реестр источников |
| Evidence Score | included | 0-100: citations, coverage, diversity, full text, validity, corroboration |
| Executive Brief | included | Краткая записка руководителю из полного отчёта |
| Executive Deck | included | Структура презентации на 8-10 слайдов |
| Серверные `Мои исследования` | available | Private Blob; localStorage fallback при недоступном storage |
| Персональный Usage Ledger | included | Search/Firecrawl/AI usage, monthly quotas, runtime fallback |
| Централизованный Usage Ledger | available | Требует private server storage |
| Daily/weekly/monthly monitors | available | Server snapshots + change detection; требует private server storage |
| Vercel Cron monitor runner | available | Ежедневный scheduler; требует `CRON_SECRET` |
| Экспорт Excel/Markdown/JSON | included | Source ID сохраняются в экспорте |
| Локальный Flask-режим | included | Для локальной работы |
| Managed access по HRP-коду | included | Серверная проверка кода |
| Server-side Firecrawl limits | included | Whitelist payload, search <= 50, crawl <= 100, rate limits |
| Server-side AI limits | included | Input <= 140000 chars, output <= 6000 tokens |
| OpenAI/Firecrawl secrets в browser-коде | prohibited | В managed mode секреты остаются на backend |
| Коммит открытых access-кодов | prohibited | Коды не должны попадать в Git |
| Коммит HR-персональных данных | prohibited | Только при отдельной задаче и после обезличивания |
| Ослабление CORS без отдельной задачи | prohibited | Security boundary |

## 4. Основные контуры
### Managed research
`Пользователь -> HRP-код -> gateway -> OpenAI / Firecrawl`

`ТЗ -> HR Playbook / Planner -> search -> Source ID -> batch AI -> Evidence Score -> report formats`

### Managed persistence
`HRP-user -> hashed user namespace -> private server storage -> researches / usage / monitors`

### Recurring monitor
`Monitor definition -> Vercel Cron / manual run -> Firecrawl -> snapshot diff -> AI Change Report -> next run`

### Local
`browser -> Flask -> local integrations`

Режим задаётся через `service.json`. Production использует `managed`.

## 5. Безопасность и данные
Источники истины: `SECURITY.md` и `docs/MANAGED-SERVICE.md`.

Обязательные правила:
- API keys не коммитятся;
- открытые пользовательские коды не сохраняются в Git;
- backend secrets не передаются в браузер;
- managed gateway ограничивает размер, частоту и месячное потребление запросов независимо от frontend;
- server storage должен быть private;
- server-side research и monitors изолируются по хэшированному user namespace;
- пользовательские исследования и HR-данные не используются как test fixtures без обезличивания;
- Evidence Score и AI conclusions не должны использоваться как единственное основание для решений о конкретном сотруднике;
- cron endpoint требует `CRON_SECRET`;
- изменение managed access сопровождается positive/negative tests.

## 6. Критерий готовности изменения
Для изменения продукта должен существовать наблюдаемый сигнал:
- unit/integration/regression test;
- успешный `ci-build.yml`;
- успешный `AI Project Standard`;
- JavaScript syntax checks для managed gateway и research suite;
- managed access / Evidence Score tests;
- static build;
- отсутствие secrets в Git;
- для production-инфраструктуры - health/status check после deployment.

## 7. Источники истины
| Вопрос | Источник |
|---|---|
| Правила AI-агентов | `AGENTS.md` |
| Возможности продукта | `PROJECT.md` |
| Пользовательское описание и запуск | `README.md` |
| Security | `SECURITY.md`, `docs/MANAGED-SERVICE.md` |
| Реальное поведение | код и тесты текущей ветки |
