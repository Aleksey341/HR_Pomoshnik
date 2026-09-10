/**
 * Bootstrap: wires UI events. Logic lives in focused modules.
 */
import { API_BASE, USE_LOCAL_PROXY } from './config.js';
import { copyAiPrompt, doAiAnalyze } from './ai.js';
import { doCrawl, loadCrawlPresetAuto } from './crawl.js';
import { copyJson, downloadMarkdown, exportToExcel } from './export.js';
import { getLastPayload } from './state.js';
import { doScrape, doSearch, initScrapeEngineUI } from './search.js';
import {
  initResearchDatePicker,
  initResearchKeywordCount,
  loadHrTemplate,
  loadSvoTemplate,
  parseBriefFields,
  doResearch
} from './research.js';
import { updateResultsViewForTab } from './results.js';
import { loadOpenAiKey, saveApiKey, saveOpenAiKey } from './storage.js';
import { showToast } from './ui.js';

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    btn.classList.remove('tab-new');
    updateResultsViewForTab(btn.dataset.tab);
    if (btn.dataset.tab !== 'ai') {
      document.getElementById('resultsTitle').textContent = getLastPayload()?.title || 'Результаты';
    }
  });
});

document.getElementById('btnAiAnalyze').addEventListener('click', doAiAnalyze);
document.getElementById('btnAiCopyPrompt').addEventListener('click', copyAiPrompt);
document.getElementById('openaiKey').addEventListener('change', saveOpenAiKey);

document.getElementById('btnSearch').addEventListener('click', doSearch);
document.getElementById('btnResearch').addEventListener('click', doResearch);
document.getElementById('btnCrawl').addEventListener('click', doCrawl);
document.getElementById('btnCrawlPresetAuto').addEventListener('click', loadCrawlPresetAuto);
document.getElementById('btnLoadHrTemplate').addEventListener('click', () => loadHrTemplate(true));
document.getElementById('btnLoadSvoTemplate').addEventListener('click', () => loadSvoTemplate(true));
document.getElementById('btnParseBriefFields').addEventListener('click', () => {
  const { keywords, domains } = parseBriefFields(true);
  if (!keywords.length && !domains.length) {
    alert(
      'Не удалось собрать запросы из задания. Добавьте ключевые слова вручную (фразы из 2+ слов).'
    );
  } else if (keywords.length) {
    showToast(`Сформировано ${keywords.length} поисковых запросов`);
  }
});
document.getElementById('btnScrape').addEventListener('click', doScrape);
document.getElementById('apiKey').addEventListener('change', saveApiKey);

document.getElementById('btnCopyJson').addEventListener('click', copyJson);
document.getElementById('btnCopyMd').addEventListener('click', downloadMarkdown);
document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);

async function checkServer() {
  const status = document.getElementById('serverStatus');
  const banner = document.getElementById('serverBanner');

  if (USE_LOCAL_PROXY) {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error('offline');
      await res.json();
      status.innerHTML = '<span class="dot ok"></span>Локальный сервер';
      banner.classList.add('ok');
      banner.innerHTML =
        'Локальный режим. Ключ — в поле слева или в <code>FIRECRAWL_API_KEY</code>.';
    } catch {
      status.innerHTML = '<span class="dot"></span>Сервер не найден';
    }
    return;
  }

  status.innerHTML = '<span class="dot ok"></span>Онлайн-режим';
  banner.classList.add('ok');
  banner.innerHTML =
    'Введите API-ключ слева и нажмите «Найти» или «Распарсить». Экспорт в Excel — кнопкой справа над результатами.';
}

loadOpenAiKey();
initResearchDatePicker();
initResearchKeywordCount();
initScrapeEngineUI();
checkServer();
