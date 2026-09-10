import { MAX_SEARCH_QUERY, USE_LOCAL_PROXY } from './config.js';
import { firecrawlRequest, localScrape, scrapeSmart } from './api.js';
import { parseDomainsInput } from './domains.js';
import { normalizeItems, renderResults } from './results.js';
import { hideError, hideLoader, runLoader, showError } from './ui.js';

export async function doSearch() {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) {
    alert('Введите поисковый запрос');
    return;
  }
  if (query.length > MAX_SEARCH_QUERY) {
    showError(
      `Запрос ${query.length} символов — лимит API ${MAX_SEARCH_QUERY}. Перейдите на вкладку «Исследование» для длинных заданий.`
    );
    document.getElementById('resultsArea').style.display = 'block';
    document.getElementById('placeholder').style.display = 'none';
    document.querySelector('[data-tab="research"]').click();
    return;
  }

  const btn = document.getElementById('btnSearch');
  btn.disabled = true;
  hideError();

  const sources = [];
  if (document.getElementById('srcWeb').checked) sources.push('web');
  if (document.getElementById('srcNews').checked) sources.push('news');

  const body = {
    query,
    limit: Number(document.getElementById('searchLimit').value),
    scrape: document.getElementById('searchScrape').checked,
    lang: document.getElementById('searchLang').value || undefined,
    sources: sources.length ? sources : ['web']
  };
  const domains = parseDomainsInput(document.getElementById('includeDomains').value);
  if (domains.length) body.includeDomains = domains;

  runLoader('search', async () => {
    try {
      const t0 = performance.now();
      const json = await firecrawlRequest('search', body);
      const items = normalizeItems(json.data);
      renderResults(`Поиск: «${query.slice(0, 80)}${query.length > 80 ? '…' : ''}»`, items, {
        ms: Math.round(performance.now() - t0),
        queryLen: query.length,
        domainsCount: domains.length,
        scrape: body.scrape,
        limit: body.limit
      });
    } catch (e) {
      showError(e.message || String(e));
      document.getElementById('resultsArea').style.display = 'block';
      document.getElementById('placeholder').style.display = 'none';
    } finally {
      hideLoader('search');
      btn.disabled = false;
    }
  });
}

export function initScrapeEngineUI() {
  const select = document.getElementById('scrapeEngine');
  const hint = document.getElementById('scrapeEngineHint');
  if (!select) return;
  if (!USE_LOCAL_PROXY) {
    [...select.options].forEach((opt) => {
      if (opt.value !== 'firecrawl' && opt.value !== 'auto') opt.disabled = true;
    });
    if (!select.value || select.querySelector(`option[value="${select.value}"]`)?.disabled) {
      select.value = 'auto';
    }
    if (hint) {
      hint.textContent =
        'Онлайн-режим: Авто ≈ Firecrawl. Для curl_cffi / браузера запустите python server.py.';
    }
  } else if (hint) {
    hint.textContent =
      'Авто: Firecrawl (если есть ключ), иначе curl_cffi, при challenge — браузер.';
  }
}

export async function doScrape() {
  const url = document.getElementById('scrapeUrl').value.trim();
  if (!url) {
    alert('Введите URL');
    return;
  }

  const formats = [];
  if (document.getElementById('fmtMarkdown').checked) formats.push('markdown');
  if (document.getElementById('fmtLinks').checked) formats.push('links');
  if (document.getElementById('fmtHtml').checked) formats.push('html');
  if (!formats.length) formats.push('markdown');

  const engine = document.getElementById('scrapeEngine')?.value || 'auto';
  if ((engine === 'curl_cffi' || engine === 'browser') && !USE_LOCAL_PROXY) {
    showError('Локальные движки доступны только через python server.py');
    return;
  }

  const btn = document.getElementById('btnScrape');
  btn.disabled = true;
  hideError();

  runLoader('scrape', async () => {
    try {
      const t0 = performance.now();
      let json;
      if (engine === 'auto') {
        json = await scrapeSmart(url, formats);
      } else if (engine === 'firecrawl') {
        json = await firecrawlRequest('scrape', { url, formats });
      } else {
        json = await localScrape({ url, formats, engine });
      }
      const doc = json.data || {};
      const usedEngine = json._meta?.engine || doc.metadata?.engine || engine;
      const items = [
        {
          title: doc.metadata?.title || url,
          url: doc.metadata?.sourceURL || url,
          description: doc.metadata?.description || '',
          markdown: doc.markdown || '',
          links: doc.links || []
        }
      ];
      const tried = json._meta?.fallback_tried;
      renderResults(`Страница [${usedEngine}]: ${url}`, items, {
        ms: Math.round(performance.now() - t0),
        engine: usedEngine,
        fallbackTried: tried
      });
      if (json._meta?.weak) {
        showError('Текст получился коротким — возможно, antibot. Попробуйте движок «Браузер».');
      }
    } catch (e) {
      showError(e.message || String(e));
      document.getElementById('resultsArea').style.display = 'block';
      document.getElementById('placeholder').style.display = 'none';
    } finally {
      hideLoader('scrape');
      btn.disabled = false;
    }
  });
}
