import { firecrawlCrawlStart, firecrawlGet } from './api.js';
import { parsePathPatterns } from './domains.js';
import { collectPlatesFromItems } from './plates.js';
import { renderResults } from './results.js';
import { getApiKey } from './storage.js';
import { hideError, hideLoader, hideProgress, runLoader, setProgress, showError } from './ui.js';

function normalizeCrawlPage(page) {
  const meta = page.metadata || {};
  return {
    title: meta.title || page.title || 'Без названия',
    url: meta.sourceURL || meta.url || page.url || '',
    description: meta.description || '',
    markdown: page.markdown || page.content || ''
  };
}

async function waitForCrawl(jobId, onProgress) {
  const pages = [];
  let pollTarget = `/crawl/${jobId}`;
  let stagnant = 0;

  for (let i = 0; i < 240; i++) {
    const json = await firecrawlGet(pollTarget);
    if (Array.isArray(json.data)) pages.push(...json.data);

    const status = json.status || 'unknown';
    const completed = json.completed ?? pages.length;
    const total = json.total ?? json.limit ?? '?';
    onProgress?.(`Статус: ${status} · страниц ${completed}/${total}`);

    if (json.next) {
      pollTarget = json.next;
      stagnant = 0;
      continue;
    }

    if (status === 'completed') break;
    if (status === 'failed') throw new Error(json.error || 'Обход завершился с ошибкой');

    stagnant++;
    if (stagnant > 180) throw new Error('Превышено время ожидания обхода (9 мин)');

    pollTarget = `/crawl/${jobId}`;
    await new Promise((r) => setTimeout(r, 3000));
  }

  return pages;
}

export function loadCrawlPresetAuto() {
  document.getElementById('crawlUrl').value = 'https://auto-nomera.ru/';
  document.getElementById('crawlLimit').value = '50';
  document.getElementById('crawlDepth').value = '4';
  document.getElementById('crawlIncludePaths').value = '';
  document.getElementById('crawlExcludePaths').value = '';
  document.getElementById('crawlEntireDomain').checked = true;
  document.getElementById('crawlScrape').checked = true;
  document.getElementById('crawlExtractPlates').checked = true;
  document.querySelector('[data-tab="crawl"]').click();
}

export async function doCrawl() {
  const url = document.getElementById('crawlUrl').value.trim();
  if (!url) {
    alert('Укажите URL каталога');
    return;
  }
  if (!getApiKey()) {
    alert('Укажите API-ключ');
    return;
  }

  const btn = document.getElementById('btnCrawl');
  btn.disabled = true;
  hideError();

  const body = {
    url,
    limit: Number(document.getElementById('crawlLimit').value),
    maxDiscoveryDepth: Number(document.getElementById('crawlDepth').value),
    crawlEntireDomain: document.getElementById('crawlEntireDomain').checked,
    scrape: document.getElementById('crawlScrape').checked,
    includePaths: parsePathPatterns(document.getElementById('crawlIncludePaths').value),
    excludePaths: parsePathPatterns(document.getElementById('crawlExcludePaths').value)
  };
  const extractPlates = document.getElementById('crawlExtractPlates').checked;

  runLoader('crawl', async () => {
    try {
      const t0 = performance.now();
      setProgress('crawlProgress', 'Запуск обхода…');
      const started = await firecrawlCrawlStart(body);
      const jobId = started.id || started.jobId;
      if (!jobId) throw new Error('Не получен ID задачи обхода');

      const pages = await waitForCrawl(jobId, (t) => setProgress('crawlProgress', t));
      const items = pages.map(normalizeCrawlPage).filter((it) => it.url);
      const plateRows = extractPlates ? collectPlatesFromItems(items) : [];

      renderResults(`Обход: ${url}`, items, {
        ms: Math.round(performance.now() - t0),
        mode: 'crawl',
        limit: body.limit,
        platesCount: plateRows.length,
        plateRows
      });

      if (!items.length) {
        showError(
          'Страницы не найдены. Увеличьте глубину, включите «Весь домен» или уберите фильтр путей.'
        );
      } else if (extractPlates && !plateRows.length) {
        showError(
          'Страницы собраны, но госномера в тексте не распознаны. Проверьте markdown или URL карточек объявлений.'
        );
      }
    } catch (e) {
      showError(e.message || String(e));
      document.getElementById('resultsArea').style.display = 'block';
      document.getElementById('placeholder').style.display = 'none';
    } finally {
      hideLoader('crawl');
      hideProgress('crawlProgress');
      btn.disabled = false;
    }
  });
}
