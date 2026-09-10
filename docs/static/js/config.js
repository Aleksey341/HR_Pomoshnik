export const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';
export const USE_LOCAL_PROXY =
  (location.hostname === '127.0.0.1' || location.hostname === 'localhost') &&
  location.port === '8765';
export const API_BASE = location.origin;
export const REQUEST_TIMEOUT_MS = 120_000;

let serviceConfigPromise = null;

export async function getServiceConfig() {
  if (!serviceConfigPromise) {
    const url = new URL('service.json', document.baseURI);
    serviceConfigPromise = fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          mode: String(data?.mode || 'direct').toLowerCase(),
          managed_base_url: String(data?.managed_base_url || '').trim().replace(/\/$/, '')
        };
      })
      .catch(() => ({ mode: 'direct', managed_base_url: '' }));
  }
  return serviceConfigPromise;
}

export async function getApiRuntime() {
  if (USE_LOCAL_PROXY) {
    return { managed: false, base: API_BASE, mode: 'direct' };
  }
  const cfg = await getServiceConfig();
  let managedBase = '';
  if (cfg.managed_base_url) {
    try {
      managedBase = new URL(cfg.managed_base_url, location.origin).href.replace(/\/$/, '');
    } catch {
      managedBase = '';
    }
  }
  const managed = cfg.mode === 'managed' && /^https?:\/\//i.test(managedBase);
  return {
    managed,
    base: managed ? managedBase : API_BASE,
    mode: managed ? 'managed' : 'direct'
  };
}

export const LOADERS = {
  search: ['Отправка запроса…', 'Поиск по интернету…', 'Парсинг найденных страниц…', 'Готово'],
  scrape: ['Загрузка страницы…', 'Рендер и извлечение контента…', 'Форматирование markdown…', 'Готово'],
  research: ['Разбор задания…', 'Пакетный поиск…', 'Объединение результатов…', 'Готово'],
  crawl: ['Запуск обхода…', 'Сканирование страниц…', 'Сбор markdown…', 'Готово'],
  ai: ['Подготовка материалов…', 'Отправка в GPT…', 'Формирование рекомендаций…', 'Готово']
};

export const MAX_SEARCH_QUERY = 500;
export const MAX_SEARCH_LIMIT = 100;
