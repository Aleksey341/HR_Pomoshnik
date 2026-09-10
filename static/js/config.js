export const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';
export const USE_LOCAL_PROXY = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '8765';
export const API_BASE = location.origin;
export const REQUEST_TIMEOUT_MS = 120_000;

export const LOADERS = {
  search: ['Отправка запроса…', 'Поиск по интернету…', 'Парсинг найденных страниц…', 'Готово'],
  scrape: ['Загрузка страницы…', 'Рендер и извлечение контента…', 'Форматирование markdown…', 'Готово'],
  research: ['Разбор задания…', 'Пакетный поиск…', 'Объединение результатов…', 'Готово'],
  crawl: ['Запуск обхода…', 'Сканирование страниц…', 'Сбор markdown…', 'Готово'],
  ai: ['Подготовка материалов…', 'Отправка в GPT…', 'Формирование рекомендаций…', 'Готово']
};

export const MAX_SEARCH_QUERY = 500;
export const MAX_SEARCH_LIMIT = 100;
