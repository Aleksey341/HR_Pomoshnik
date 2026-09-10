import { MAX_SEARCH_QUERY } from './config.js';
import { bindEnrichButtons, flashResearchScrapeHint, markdownPlaceholderHtml } from './enrich.js';
import { getLastAiReport, getLastPayload, setLastPayload } from './state.js';
import { esc, showToast } from './ui.js';

export function setAiTabVisible(show, pulse = false) {
  const tab = document.getElementById('tabAiBtn');
  tab.classList.toggle('tab-hidden', !show);
  tab.classList.toggle('tab-new', show && pulse);
}

export function updateResultsViewForTab(tabName) {
  const isAi = tabName === 'ai';
  document.getElementById('resultsList').style.display = isAi ? 'none' : '';
  document.getElementById('aiResultsArea').style.display = isAi ? 'block' : 'none';
  document.getElementById('kpiRow').style.display = isAi ? 'none' : '';
  document.querySelector('.export-hint').style.display = isAi ? 'none' : '';
  if (isAi && !getLastAiReport()) {
    const n = getLastPayload()?.items?.length || 0;
    document.getElementById('aiResultsArea').innerHTML = `<div class="ai-placeholder">
      <p><strong>AI-анализ ещё не выполнен.</strong></p>
      <p>Нажмите «Провести AI-анализ» слева. ИИ изучит ${n} собранных источников и подготовит рекомендации.</p>
      <p>Нет ключа OpenAI? Используйте «Скопировать промпт для ChatGPT».</p>
    </div>`;
  }
}

export function normalizeItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const items = [];
  for (const key of ['web', 'news', 'images']) {
    if (Array.isArray(data[key])) items.push(...data[key]);
  }
  return items;
}

export function renderResults(title, items, meta = {}) {
  document.getElementById('placeholder').style.display = 'none';
  const area = document.getElementById('resultsArea');
  area.style.display = 'block';
  document.getElementById('resultsTitle').textContent = title;
  document.getElementById('errorBox').classList.remove('visible');

  const withMd = items.filter((i) => i.markdown || i.content).length;
  let kpiCols;
  if (meta.mode === 'crawl') {
    kpiCols = `
    <div class="kpi"><div class="kpi-val">${items.length}</div><div class="kpi-label">Страниц</div></div>
    <div class="kpi"><div class="kpi-val">${meta.platesCount ?? 0}</div><div class="kpi-label">Номеров</div></div>
    <div class="kpi"><div class="kpi-val">${withMd}</div><div class="kpi-label">С markdown</div></div>
    <div class="kpi"><div class="kpi-val">${meta.ms ?? '—'}</div><div class="kpi-label">мс</div></div>`;
  } else if (meta.queriesRun != null) {
    kpiCols = `
    <div class="kpi"><div class="kpi-val">${items.length}</div><div class="kpi-label">Уник. ссылок</div></div>
    <div class="kpi"><div class="kpi-val">${meta.keywordsUsed ?? '—'}</div><div class="kpi-label">Ключ. слов</div></div>
    <div class="kpi"><div class="kpi-val">${meta.queriesRun ?? '—'}</div><div class="kpi-label">Запросов API</div></div>
    <div class="kpi"><div class="kpi-val">${meta.ms ?? '—'}</div><div class="kpi-label">мс</div></div>`;
  } else {
    kpiCols = `
    <div class="kpi"><div class="kpi-val">${items.length}</div><div class="kpi-label">Результатов</div></div>
    <div class="kpi"><div class="kpi-val">${withMd}</div><div class="kpi-label">С markdown</div></div>
    <div class="kpi"><div class="kpi-val">${meta.ms ?? '—'}</div><div class="kpi-label">мс</div></div>
    <div class="kpi"><div class="kpi-val">${meta.limit ?? '—'}</div><div class="kpi-label">Лимит</div></div>`;
  }
  document.getElementById('kpiRow').innerHTML = kpiCols;

  const list = document.getElementById('resultsList');
  if (!items.length) {
    const hints = [];
    if (meta.mode === 'crawl') {
      hints.push('Проверьте URL каталога, глубину ссылок и фильтры путей.');
      hints.push('1 страница = 1 кредит API. Начните с лимита 25–50.');
    } else if (meta.queryLen > MAX_SEARCH_QUERY) {
      hints.push(
        `Запрос ${meta.queryLen} символов — лимит API ${MAX_SEARCH_QUERY}. Сократите до ключевых слов.`
      );
    } else if (meta.queryLen > 120) {
      hints.push('Запрос слишком длинный для поиска — оставьте 5–15 ключевых слов.');
    }
    if (meta.domainsCount) {
      hints.push(`Фильтр по ${meta.domainsCount} доменам — убедитесь, что они указаны верно.`);
    }
    if (meta.scrape) {
      hints.push(
        'Попробуйте снять галочку «Загрузить полный текст (markdown)» слева — иногда так быстрее находятся ссылки.'
      );
    }
    hints.push('Поиск находит страницы в интернете, а не заполняет таблицы по инструкции.');
    list.innerHTML = `<p style="padding:1rem;color:var(--text-muted)">Ничего не найдено.</p>
      <ul style="padding:0 1.25rem 1rem;color:var(--text-muted);font-size:.82rem;line-height:1.6">
        ${hints.map((h) => `<li>${esc(h)}</li>`).join('')}
      </ul>`;
    setLastPayload({ title, items, meta });
    return;
  }

  list.innerHTML = items
    .map((item, idx) => {
      const md = item.markdown || item.content || '';
      const body = md
        ? `<pre>${esc(md)}</pre>`
        : markdownPlaceholderHtml(meta.mode);
      return `<article class="result-item${idx === 0 ? ' open' : ''}" data-idx="${idx}">
      <div class="result-item-head">
        <div class="result-item-title">${esc(item.title || 'Без названия')}</div>
        <div class="result-item-url">${esc(item.url || item.sourceURL || '')}</div>
        ${item.searchKeyword ? `<div class="result-item-desc">Ключ: ${esc(item.searchKeyword)}</div>` : ''}
        ${item.description || item.snippet ? `<div class="result-item-desc">${esc(item.description || item.snippet)}</div>` : ''}
      </div>
      <div class="result-item-body">${body}</div>
    </article>`;
    })
    .join('');

  list.querySelectorAll('.result-item-head').forEach((head) => {
    head.addEventListener('click', () => head.parentElement.classList.toggle('open'));
  });
  bindEnrichButtons(list);

  setLastPayload({ title, items, meta });

  if (meta.mode === 'research' && items.length > 0) {
    setAiTabVisible(true, true);
    const withText = items.filter((i) => i.markdown || i.content).length;
    if (withText === 0) {
      showToast('Ссылки собраны без текста — включите «Загрузить markdown» слева или догрузите по одной');
      flashResearchScrapeHint();
    } else {
      showToast(`Исследование готово (${items.length} источников). Доступен AI-анализ →`);
    }
  }
}
