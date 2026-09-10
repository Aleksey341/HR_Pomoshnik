import { USE_LOCAL_PROXY } from './config.js';
import { scrapeSmart } from './api.js';
import { getLastPayload, setLastPayload } from './state.js';
import { esc, showToast } from './ui.js';
import { getApiKey } from './storage.js';

function emptyMarkdownHint(mode) {
  if (mode === 'research') {
    return {
      lead: 'Текст страницы не загружен — исследование шло без полного текста.',
      detail:
        'Сейчас нажмите кнопку ниже, чтобы догрузить только эту ссылку. Либо слева, сразу под «Ключевые слова», включите «Загрузить markdown» и запустите исследование заново.',
      checkbox: 'Загрузить markdown (полный текст страниц)'
    };
  }
  if (mode === 'crawl') {
    return {
      lead: 'Текст страницы не загружен.',
      detail:
        'Во вкладке «Обход каталога» включите «Markdown каждой страницы» или догрузите эту страницу кнопкой ниже.',
      checkbox: 'Markdown каждой страницы'
    };
  }
  return {
    lead: 'Текст страницы не загружен.',
    detail:
      'Во вкладке «Поиск» слева есть галочка «Загрузить полный текст (markdown)» — не отдельная кнопка. Либо догрузите только эту страницу:',
    checkbox: 'Загрузить полный текст (markdown)'
  };
}

export function markdownPlaceholderHtml(mode) {
  const hint = emptyMarkdownHint(mode);
  const canLoad = USE_LOCAL_PROXY || !!getApiKey();
  return `<div class="md-missing">
    <p><strong>${esc(hint.lead)}</strong></p>
    <p>${esc(hint.detail)}</p>
    ${
      canLoad
        ? `<button type="button" class="btn-sm btn-load-md" data-tip="Скачает markdown только для этой ссылки (Firecrawl → curl_cffi → браузер)">Догрузить текст этой страницы</button>`
        : `<p class="hint">Чтобы догрузить здесь: укажите API-ключ Firecrawl слева вверху.</p>`
    }
    <p class="hint">Галочка в параметрах: «${esc(hint.checkbox)}»</p>
  </div>`;
}

export function flashResearchScrapeHint() {
  const row = document.getElementById('researchScrapeRow');
  const input = document.getElementById('researchScrape');
  if (!row || !input) return;
  row.classList.add('pulse-hint');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => row.classList.remove('pulse-hint'), 2400);
}

export async function enrichItemMarkdown(idx, btn) {
  const payload = getLastPayload();
  if (!payload?.items?.[idx]) {
    showToast('Нет данных результата');
    return;
  }
  const item = payload.items[idx];
  const url = item.url || item.sourceURL;
  if (!url) {
    showToast('У результата нет URL');
    return;
  }

  if (!USE_LOCAL_PROXY && !getApiKey()) {
    showToast('Укажите API-ключ Firecrawl слева');
    return;
  }

  const label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Загрузка…';
  }

  try {
    const json = await scrapeSmart(url, ['markdown', 'html', 'links']);
    const doc = json.data || {};
    const md = doc.markdown || '';
    if (!md.trim()) throw new Error('Движки вернули пустой текст');

    payload.items[idx] = {
      ...item,
      title: doc.metadata?.title || item.title,
      url: doc.metadata?.sourceURL || url,
      markdown: md,
      links: doc.links || item.links || [],
      enrichedEngine: json._meta?.engine
    };
    setLastPayload({ ...payload, items: [...payload.items] });

    const article = document.querySelector(`.result-item[data-idx="${idx}"]`);
    const body = article?.querySelector('.result-item-body');
    if (body) {
      const engine = json._meta?.engine || 'scrape';
      body.innerHTML = `<p class="hint">Догружено через ${esc(engine)}</p><pre>${esc(md)}</pre>`;
    }
    article?.classList.add('open');
    showToast(`Текст загружен (${json._meta?.engine || 'ok'})`);
  } catch (e) {
    showToast(e.message || String(e));
    if (btn) {
      btn.disabled = false;
      btn.textContent = label || 'Догрузить текст этой страницы';
    }
  }
}

export function bindEnrichButtons(listEl) {
  listEl.querySelectorAll('.btn-load-md').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const article = btn.closest('.result-item');
      const idx = Number(article?.dataset?.idx);
      if (Number.isNaN(idx)) return;
      enrichItemMarkdown(idx, btn);
    });
  });
}
