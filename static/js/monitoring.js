import { getApiRuntime } from './config.js';
import { renderMarkdownSafe } from './markdown.js';
import { parseKeywordInput } from './research-brief.js';
import { getApiKey } from './storage.js';
import { esc, showToast } from './ui.js';

const CADENCE_LABELS = { daily: 'ежедневно', weekly: 'еженедельно', monthly: 'ежемесячно' };

async function request(path, options = {}) {
  const runtime = await getApiRuntime();
  const code = getApiKey();
  if (!runtime.managed) throw new Error('Мониторинг доступен в managed-режиме');
  if (!code) throw new Error('Введите код доступа HR Помощник');
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${code}` };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${runtime.base}${path}`, { cache: 'no-store', ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function currentDefinition() {
  const brief = document.getElementById('researchBrief')?.value?.trim() || '';
  const queries = parseKeywordInput(document.getElementById('researchKeywords')?.value || '');
  const domains = String(document.getElementById('researchDomains')?.value || '')
    .split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  const title = document.getElementById('monitorTitle')?.value?.trim() || brief.split('\n').find(Boolean)?.slice(0, 120) || 'HR мониторинг';
  const cadence = document.getElementById('monitorCadence')?.value || 'monthly';
  return {
    title,
    brief,
    queries,
    domains,
    cadence,
    active: true,
    settings: {
      limit: Math.min(Number(document.getElementById('researchLimit')?.value || 10), 20),
      scrape: Boolean(document.getElementById('researchScrape')?.checked),
      broad: Boolean(document.getElementById('researchBroad')?.checked),
      dateFrom: document.getElementById('researchDateFilter')?.checked ? document.getElementById('researchDateFrom')?.value || '' : '',
    },
  };
}

async function saveCurrentMonitor() {
  const definition = currentDefinition();
  if (!definition.brief) {
    showToast('Сначала заполните техническое задание исследования');
    return;
  }
  if (!definition.queries.length) {
    showToast('Сначала сформируйте поисковые запросы');
    return;
  }
  const button = document.getElementById('btnSaveMonitor');
  button.disabled = true;
  try {
    await request('/monitor/save', { method: 'POST', body: JSON.stringify(definition) });
    showToast(`Мониторинг создан: ${CADENCE_LABELS[definition.cadence]}`);
    await loadMonitors();
  } catch (error) {
    showToast(`Не удалось создать мониторинг: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function runResultHtml(run) {
  const counts = run?.counts || {};
  return `<div class="monitor-run-result">
    <div class="monitor-counts">
      <span>Источников <strong>${counts.sources || 0}</strong></span>
      <span>Новых <strong>${counts.added || 0}</strong></span>
      <span>Изменено <strong>${counts.changed || 0}</strong></span>
      <span>Не найдено повторно <strong>${counts.removed || 0}</strong></span>
    </div>
    <div class="ai-report-body">${renderMarkdownSafe(run?.summary || 'Сводка изменений отсутствует.')}</div>
  </div>`;
}

async function runNow(id, button) {
  button.disabled = true;
  button.textContent = 'Проверка…';
  const resultArea = document.getElementById('monitorRunResult');
  resultArea.innerHTML = '<p class="hint">Повторное исследование выполняется. Это может занять несколько минут…</p>';
  try {
    const data = await request('/monitor/run', { method: 'POST', body: JSON.stringify({ id }) });
    resultArea.innerHTML = runResultHtml(data.run);
    showToast(`Мониторинг обновлён: новых ${data.run?.counts?.added || 0}, изменено ${data.run?.counts?.changed || 0}`);
    await loadMonitors(false);
  } catch (error) {
    resultArea.innerHTML = `<p class="error-box visible">${esc(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Проверить сейчас';
  }
}

async function deleteMonitor(id) {
  try {
    await request('/monitor/delete', { method: 'POST', body: JSON.stringify({ id }) });
    showToast('Мониторинг удалён');
    await loadMonitors();
  } catch (error) {
    showToast(`Не удалось удалить мониторинг: ${error.message}`);
  }
}

function renderMonitorRows(items) {
  const list = document.getElementById('monitorList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="hint">Мониторинги пока не созданы. Заполните исследование и сохраните его как мониторинг.</p>';
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'monitor-row';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title || 'HR мониторинг';
    const meta = document.createElement('div');
    meta.className = 'hint';
    const next = item.nextRunAt ? new Date(item.nextRunAt).toLocaleString('ru-RU') : '—';
    const last = item.lastRunAt ? new Date(item.lastRunAt).toLocaleString('ru-RU') : 'ещё не запускался';
    const changes = item.lastCounts ? ` · прошлый запуск: +${item.lastCounts.added || 0} / Δ${item.lastCounts.changed || 0}` : '';
    meta.textContent = `${CADENCE_LABELS[item.cadence] || item.cadence} · последний: ${last} · следующий: ${next}${changes}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'btn-sm';
    run.textContent = 'Проверить сейчас';
    run.addEventListener('click', () => runNow(item.id, run));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-sm';
    del.textContent = 'Удалить';
    del.addEventListener('click', () => deleteMonitor(item.id));
    actions.append(run, del);
    row.append(info, actions);
    list.append(row);
  }
}

async function loadMonitors(showLoading = true) {
  const list = document.getElementById('monitorList');
  if (!list) return;
  if (showLoading) list.innerHTML = '<p class="hint">Загрузка мониторингов…</p>';
  try {
    const data = await request('/monitor/list');
    renderMonitorRows(data.items || []);
  } catch (error) {
    list.innerHTML = `<p class="error-box visible">${esc(error.message)}</p><p class="hint">Для серверного мониторинга требуется приватное Vercel Blob-хранилище. Ручные исследования продолжают работать независимо.</p>`;
  }
}

async function openMonitoring() {
  document.getElementById('monitorOverlay')?.classList.add('visible');
  const brief = document.getElementById('researchBrief')?.value?.trim() || '';
  const title = document.getElementById('monitorTitle');
  if (title && !title.value) title.value = brief.split('\n').find(Boolean)?.slice(0, 120) || '';
  await loadMonitors();
}

export function installMonitoring() {
  if (document.getElementById('monitorOverlay')) return;
  const topbar = document.querySelector('.topbar-meta');
  if (topbar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sm';
    button.id = 'btnMonitoring';
    button.textContent = 'Мониторинг';
    button.setAttribute('data-tip', 'Повторные исследования и контроль изменений');
    button.addEventListener('click', openMonitoring);
    topbar.prepend(button);
  }

  const overlay = document.createElement('div');
  overlay.id = 'monitorOverlay';
  overlay.className = 'history-overlay';
  overlay.innerHTML = `
    <div class="history-dialog monitor-dialog" role="dialog" aria-modal="true" aria-labelledby="monitorTitleHeading">
      <div class="history-head">
        <div><div class="ai-report-kicker">RESEARCH MONITOR</div><h2 id="monitorTitleHeading">Повторные исследования</h2></div>
        <button type="button" class="btn-sm" id="btnCloseMonitoring">Закрыть</button>
      </div>
      <p class="hint">Сохраните текущее ТЗ и поисковые запросы. Сервис повторит поиск, сравнит снимок источников и покажет только новые, изменившиеся и исчезнувшие из текущей выдачи материалы.</p>
      <div class="monitor-create-grid">
        <div class="field"><label>Название мониторинга</label><input id="monitorTitle" placeholder="Например: Практики наставничества - рынок"></div>
        <div class="field"><label>Периодичность</label><select id="monitorCadence"><option value="monthly" selected>Ежемесячно</option><option value="weekly">Еженедельно</option><option value="daily">Ежедневно</option></select></div>
      </div>
      <button type="button" class="btn-run" id="btnSaveMonitor">Сохранить текущее исследование как мониторинг</button>
      <p class="hint">Автоматический запуск выполняет Vercel Cron один раз в сутки и запускает те мониторинги, срок которых наступил. Для него должны быть настроены приватное server storage и CRON_SECRET.</p>
      <h3 class="monitor-section-title">Мои мониторинги</h3>
      <div id="monitorList" class="history-list"></div>
      <h3 class="monitor-section-title">Последние изменения</h3>
      <div id="monitorRunResult"><p class="hint">Запустите мониторинг вручную, чтобы увидеть change report.</p></div>
    </div>`;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.classList.remove('visible'); });
  document.body.append(overlay);
  document.getElementById('btnCloseMonitoring')?.addEventListener('click', () => overlay.classList.remove('visible'));
  document.getElementById('btnSaveMonitor')?.addEventListener('click', saveCurrentMonitor);
}
