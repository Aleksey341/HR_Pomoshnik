import {
  API_BASE,
  FIRECRAWL_API,
  MAX_SEARCH_LIMIT,
  REQUEST_TIMEOUT_MS,
  USE_LOCAL_PROXY,
  getApiRuntime
} from './config.js';
import { getApiKey } from './storage.js';

let activeController = null;
let totalEstimatedCredits = 0;

export function abortActiveRequest() {
  activeController?.abort();
  activeController = null;
}

export function resetCreditCounter() {
  totalEstimatedCredits = 0;
}

export function getCreditCounter() {
  return totalEstimatedCredits;
}

function trackCredits(json) {
  const credits = json?._meta?.estimated_credits;
  if (typeof credits === 'number') {
    totalEstimatedCredits += credits;
    const el = document.getElementById('creditCounter');
    if (el && !el.dataset.managedBalance) el.textContent = `≈ ${totalEstimatedCredits} кред.`;
  }
}

export function extractApiError(json, status) {
  if (!json || typeof json !== 'object') return `HTTP ${status}`;
  if (typeof json.error === 'string' && json.error) return json.error;
  if (typeof json.message === 'string' && json.message) return json.message;
  if (Array.isArray(json.details) && json.details.length) {
    return json.details.map(d => d.message || d.path || JSON.stringify(d)).join('; ');
  }
  if (json.error && typeof json.error === 'object') {
    return json.error.message || JSON.stringify(json.error);
  }
  return `HTTP ${status}`;
}

function retryAfterSeconds(res) {
  const raw = String(res.headers.get('retry-after') || '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(1, Math.ceil(Number(raw)));
  if (raw) {
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(1, Math.ceil((when - Date.now()) / 1000));
  }
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const seconds = reset > 1_000_000_000 ? reset - Date.now() / 1000 : reset;
    return Math.max(1, Math.ceil(seconds));
  }
  return null;
}

function attachRateLimitMeta(json, res) {
  if (!json || typeof json !== 'object') return json;
  const limit = Number(res.headers.get('x-ratelimit-limit'));
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if ([limit, remaining, reset].some(Number.isFinite)) {
    json._meta = {
      ...(json._meta || {}),
      rate_limit: {
        limit: Number.isFinite(limit) ? limit : null,
        remaining: Number.isFinite(remaining) ? remaining : null,
        reset: Number.isFinite(reset) ? reset : null,
      },
    };
  }
  return json;
}

function responseError(json, res) {
  const error = new Error(extractApiError(json, res.status));
  error.status = res.status;
  error.retryAfterSeconds = retryAfterSeconds(res);
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  activeController?.abort();
  activeController = new AbortController();
  const timer = setTimeout(() => activeController.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: activeController.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Запрос отменён или превышено время ожидания');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function requireAccessCode() {
  const code = getApiKey();
  if (!code) throw new Error('Введите код доступа HR Помощник');
  return code;
}

async function managedJson(url, options = {}) {
  const code = requireAccessCode();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${code}`
  };
  const res = await fetchWithTimeout(url, { ...options, headers });
  const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
  if (!res.ok) throw responseError(json, res);
  if (json.success === false) throw responseError(json, res);
  return json;
}

export function buildDirectPayload(kind, body) {
  if (kind === 'search') {
    const query = String(body.query || '').trim();
    const limit = Math.max(1, Math.min(parseInt(body.limit, 10) || 5, MAX_SEARCH_LIMIT));
    const payload = { query, limit };

    const domains = (body.includeDomains || [])
      .map(d => String(d).trim().replace(/^https?:\/\//i, '').split('/')[0])
      .filter(Boolean);
    if (domains.length) payload.includeDomains = domains;
    if (body.tbs) payload.tbs = body.tbs;

    const sourceTypes = Array.isArray(body.sources) && body.sources.length ? body.sources : ['web'];
    const lang = body.lang ? String(body.lang).trim() : '';
    const needsSources = lang || sourceTypes.length > 1 || sourceTypes.some(s => s !== 'web');
    if (needsSources) {
      payload.sources = sourceTypes.map(type => {
        const src = { type };
        if (lang && (type === 'web' || type === 'news')) {
          src.lang = lang;
          if (lang === 'ru') src.country = 'RU';
          else if (lang === 'en') src.country = 'US';
        }
        return src;
      });
    }
    if (body.scrape) payload.scrapeOptions = { formats: ['markdown'] };
    return payload;
  }
  const formats = body.formats || ['markdown'];
  return { url: body.url, formats };
}

export async function apiPost(path, body) {
  const apiKey = getApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, apiKey: apiKey || undefined })
  });
  const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
  if (!res.ok) throw responseError(json, res);
  if (json.success === false) throw responseError(json, res);
  trackCredits(json);
  return json;
}

export async function firecrawlRequest(kind, body) {
  const runtime = await getApiRuntime();
  if (runtime.managed) {
    return managedJson(`${runtime.base}/firecrawl/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDirectPayload(kind, body))
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Укажите API-ключ Firecrawl в поле слева');

  if (USE_LOCAL_PROXY) return apiPost(`/api/firecrawl/${kind}`, body);

  const res = await fetchWithTimeout(`${FIRECRAWL_API}/${kind}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildDirectPayload(kind, body))
  });
  const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
  if (!res.ok) {
    const error = responseError(json, res);
    if (/cors|failed to fetch|network/i.test(String(error.message))) {
      throw new Error('Браузер заблокировал запрос. Запустите локально: python server.py');
    }
    throw error;
  }
  if (json.success === false) throw responseError(json, res);
  return json;
}

export async function firecrawlGet(pathOrUrl) {
  const runtime = await getApiRuntime();
  if (runtime.managed) {
    const params = new URLSearchParams();
    if (pathOrUrl.startsWith('http')) params.set('next', pathOrUrl);
    else params.set('path', pathOrUrl);
    return managedJson(`${runtime.base}/firecrawl/get?${params}`, { cache: 'no-store' });
  }

  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Укажите API-ключ Firecrawl в поле слева');

  if (USE_LOCAL_PROXY) {
    const params = new URLSearchParams();
    if (pathOrUrl.startsWith('http')) params.set('next', pathOrUrl);
    else params.set('path', pathOrUrl);
    const res = await fetchWithTimeout(`${API_BASE}/api/firecrawl/get?${params}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
    if (!res.ok) throw responseError(json, res);
    if (json.success === false) throw responseError(json, res);
    trackCredits(json);
    return json;
  }

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${FIRECRAWL_API}${pathOrUrl}`;
  if (pathOrUrl.startsWith('http') && !url.startsWith(FIRECRAWL_API)) {
    throw new Error('Разрешены только URL API v2');
  }
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store'
  });
  const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
  if (!res.ok) throw responseError(json, res);
  if (json.success === false) throw responseError(json, res);
  return json;
}

function buildCrawlPayload(body) {
  const payload = {
    url: body.url,
    limit: Math.max(1, Math.min(parseInt(body.limit, 10) || 50, 500)),
    maxDiscoveryDepth: Math.max(1, parseInt(body.maxDiscoveryDepth, 10) || 3),
    crawlEntireDomain: !!body.crawlEntireDomain
  };
  if (body.includePaths?.length) payload.includePaths = body.includePaths;
  if (body.excludePaths?.length) payload.excludePaths = body.excludePaths;
  if (body.scrape) payload.scrapeOptions = { formats: ['markdown'] };
  return payload;
}

export async function firecrawlCrawlStart(body) {
  const runtime = await getApiRuntime();
  if (runtime.managed) {
    return managedJson(`${runtime.base}/firecrawl/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCrawlPayload(body))
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Укажите API-ключ Firecrawl в поле слева');

  if (USE_LOCAL_PROXY) return apiPost('/api/firecrawl/crawl', body);

  const res = await fetchWithTimeout(`${FIRECRAWL_API}/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildCrawlPayload(body))
  });
  const json = attachRateLimitMeta(await res.json().catch(() => ({})), res);
  if (!res.ok) throw responseError(json, res);
  if (json.success === false) throw responseError(json, res);
  return json;
}

/** Локальный scrape: curl_cffi или browser (только через server.py). */
export async function localScrape(body) {
  if (!USE_LOCAL_PROXY) {
    throw new Error('Локальные движки доступны только при python server.py (127.0.0.1:8765)');
  }
  const res = await fetchWithTimeout(`${API_BASE}/api/local/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw responseError(json, res);
  if (json.success === false) throw responseError(json, res);
  return json;
}

function markdownLen(json) {
  return String(json?.data?.markdown || json?.data?.content || '').trim().length;
}

function looksWeakClient(json) {
  const md = String(json?.data?.markdown || '').trim();
  const html = String(json?.data?.html || '').toLowerCase();
  if (md.length < 80) return true;
  const blob = `${html.slice(0, 4000)} ${md.slice(0, 500).toLowerCase()}`;
  return /just a moment|checking your browser|cf-browser-verification|access denied|captcha|cloudflare/i.test(blob);
}

export async function scrapeSmart(url, formats = ['markdown']) {
  const tried = [];
  let lastJson = null;
  let lastError = null;
  const apiKey = getApiKey();

  if (apiKey) {
    tried.push('firecrawl');
    try {
      lastJson = await firecrawlRequest('scrape', { url, formats: [...new Set([...formats, 'html'])] });
      if (!looksWeakClient(lastJson) && markdownLen(lastJson) >= 80) {
        return {
          ...lastJson,
          _meta: { ...(lastJson._meta || {}), engine: 'firecrawl', fallback_tried: tried }
        };
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (USE_LOCAL_PROXY) {
    tried.push('local-auto');
    try {
      lastJson = await localScrape({
        url,
        formats: [...new Set([...formats, 'html'])],
        engine: 'auto',
        fallback: true
      });
      const engine = lastJson._meta?.engine || 'local';
      return {
        ...lastJson,
        _meta: {
          ...(lastJson._meta || {}),
          engine,
          fallback_tried: [...tried, ...(lastJson._meta?.fallback_tried || [])]
        }
      };
    } catch (e) {
      lastError = e;
    }
  }

  if (lastJson && markdownLen(lastJson) > 0) {
    return {
      ...lastJson,
      _meta: { ...(lastJson._meta || {}), weak: true, fallback_tried: tried }
    };
  }

  throw lastError || new Error('Не удалось загрузить текст страницы');
}
