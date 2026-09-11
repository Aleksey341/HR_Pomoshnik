import { renderAiReport } from './ai.js';
import { getApiRuntime } from './config.js';
import { getLastAiReport, getLastPayload, getLastQuality, getReportVariants, setLastQuality, setReportVariants } from './state.js';
import { renderResults } from './results.js';
import { getApiKey } from './storage.js';
import { esc, showToast } from './ui.js';

const STORAGE_KEY = 'hr_pomoshnik_research_history_v1';
const MAX_ENTRIES = 6;
const MAX_TEXT_PER_SOURCE = 6000;

function excerpt(value, limit = MAX_TEXT_PER_SOURCE) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '\n[…сохранён сокращённый текст…]\n';
  const available = Math.max(0, limit - marker.length);
  const head = Math.floor(available * 0.65);
  return text.slice(0, head) + marker + text.slice(-(available - head));
}

function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  let compact = entries.slice(0, MAX_ENTRIES);
  while (compact.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      return compact;
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error;
      compact = compact.slice(0, -1);
    }
  }
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

function compactPayload(payload) {
  return {
    title: payload.title || 'Исследование',
    meta: { ...(payload.meta || {}) },
    items: (payload.items || []).map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      url: item.url,
      sourceURL: item.sourceURL,
      description: excerpt(item.description || item.snippet, 1500),
      snippet: excerpt(item.snippet, 1500),
      searchKeyword: item.searchKeyword,
      markdown: excerpt(item.markdown || item.content),
      publishedDate: item.publishedDate || item.published_at || item.date,
      links: Array.isArray(item.links) ? item.links.slice(0, 50) : undefined,
    }))
  };
}

async function managedContext() {
  const runtime = await getApiRuntime();
  const code = getApiKey();
  return { runtime, code, available: Boolean(runtime.managed && code) };
}

async function serverRequest(path, options = {}) {
  const { runtime, code, available } = await managedContext();
  if (!available) throw Object.assign(new Error('Managed storage is unavailable'), { localFallback: true });
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${code}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${runtime.base}${path}`, { cache: 'no-store', ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.code = data.code;
    error.localFallback = data.code === 'SERVER_STORAGE_UNAVAILABLE';
    throw error;
  }
  return data;
}

function buildCurrentEntry() {
  const payload = getLastPayload();
  if (!payload?.items?.length) return null;
  return {
    createdAt: new Date().toISOString(),
    title: payload.title || 'Исследование',
    brief: payload.meta?.researchBrief || document.getElementById('researchBrief')?.value?.trim() || '',
    payload: compactPayload(payload),
    aiReport: excerpt(getLastAiReport(), 180_000),
    reportVariants: getReportVariants(),
    quality: getLastQuality(),
  };
}

function saveLocal(entry) {
  const localEntry = {
    ...entry,
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const entries = loadEntries().filter((item) => item.id !== localEntry.id);
  const saved = writeEntries([localEntry, ...entries]);
  return saved.some((item) => item.id === localEntry.id);
}

export async function saveCurrentResearch() {
  const entry = buildCurrentEntry();
  if (!entry) {
    showToast('Нет исследования для сохранения');
    return;
  }

  try {
    const data = await serverRequest('/research/save', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    showToast(`Исследование сохранено на сервере: ${data.item?.sourceCount || entry.payload.items.length} источников`);
    await renderHistoryList();
    return;
  } catch (error) {
    if (!error.localFallback) {
      showToast(`Серверное сохранение не выполнено: ${error.message}`);
      return;
    }
  }

  if (saveLocal(entry)) {
    showToast('Серверное хранилище не подключено - сохранено только в этом браузере');
    await renderHistoryList();
  } else {
    showToast('Не удалось сохранить: локальное хранилище заполнено');
  }
}

function restoreEntry(entry, locationLabel) {
  if (!entry?.payload?.items?.length) return;
  const brief = document.getElementById('researchBrief');
  if (brief && entry.brief) brief.value = entry.brief;
  setReportVariants(entry.reportVariants || {});
  setLastQuality(entry.quality || null);
  renderResults(entry.payload.title, entry.payload.items, entry.payload.meta || {});
  if (entry.aiReport) {
    renderAiReport(entry.aiReport);
    document.getElementById('tabAiBtn')?.click();
  }
  closeHistory();
  showToast(`Исследование восстановлено: ${locationLabel}`);
}

async function openServerEntry(id) {
  try {
    const data = await serverRequest(`/research/get?id=${encodeURIComponent(id)}`);
    restoreEntry(data.item, 'серверная история');
  } catch (error) {
    showToast(`Не удалось открыть исследование: ${error.message}`);
  }
}

async function deleteServerEntry(id) {
  try {
    await serverRequest('/research/delete', { method: 'POST', body: JSON.stringify({ id }) });
    showToast('Исследование удалено с сервера');
    await renderHistoryList();
  } catch (error) {
    showToast(`Не удалось удалить: ${error.message}`);
  }
}

function deleteLocalEntry(id) {
  writeEntries(loadEntries().filter((item) => item.id !== id));
  renderHistoryList();
}

function renderRows(entries, mode) {
  const list = document.getElementById('researchHistoryList');
  list.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Сохранённых исследований пока нет.';
    list.append(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'history-row';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.title || 'Исследование';
    const meta = document.createElement('div');
    meta.className = 'hint';
    const dateValue = entry.updatedAt || entry.createdAt;
    const date = dateValue ? new Date(dateValue).toLocaleString('ru-RU') : '';
    const sources = entry.sourceCount ?? entry.payload?.items?.length ?? 0;
    const hasAi = entry.hasAiReport ?? Boolean(entry.aiReport);
    const scoreValue = entry.qualityScore ?? entry.quality?.score;
    const score = scoreValue ? ` · Evidence ${scoreValue}/100` : '';
    meta.textContent = `${date} · источников: ${sources}${hasAi ? ' · AI-отчёт' : ''}${score}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn-sm';
    open.textContent = 'Открыть';
    open.addEventListener('click', () => mode === 'server' ? openServerEntry(entry.id) : restoreEntry(entry, 'этот браузер'));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-sm';
    del.textContent = 'Удалить';
    del.addEventListener('click', () => mode === 'server' ? deleteServerEntry(entry.id) : deleteLocalEntry(entry.id));
    actions.append(open, del);
    row.append(info, actions);
    list.append(row);
  }
}

async function renderHistoryList() {
  const list = document.getElementById('researchHistoryList');
  const kicker = document.getElementById('researchHistoryKicker');
  const hint = document.getElementById('researchHistoryHint');
  if (!list) return;
  list.innerHTML = '<p class="hint">Загрузка истории…</p>';

  try {
    const data = await serverRequest('/research/list');
    if (kicker) kicker.textContent = 'МОИ ИССЛЕДОВАНИЯ · SERVER';
    if (hint) hint.textContent = 'Исследования хранятся в приватном серверном хранилище и доступны после входа по вашему HRP-коду.';
    renderRows(data.items || [], 'server');
    return;
  } catch (error) {
    if (!error.localFallback) {
      list.innerHTML = `<p class="error-box visible">${esc(error.message)}</p>`;
      return;
    }
  }

  if (kicker) kicker.textContent = 'МОИ ИССЛЕДОВАНИЯ · LOCAL FALLBACK';
  if (hint) hint.textContent = 'Серверное хранилище пока недоступно. Показаны исследования из localStorage этого браузера.';
  renderRows(loadEntries(), 'local');
}

function closeHistory() {
  document.getElementById('researchHistoryOverlay')?.classList.remove('visible');
}

async function openHistory() {
  document.getElementById('researchHistoryOverlay')?.classList.add('visible');
  await renderHistoryList();
}

export function installResearchHistory() {
  if (document.getElementById('researchHistoryOverlay')) return;

  const topbar = document.querySelector('.topbar-meta');
  if (topbar) {
    const historyButton = document.createElement('button');
    historyButton.type = 'button';
    historyButton.className = 'btn-sm';
    historyButton.id = 'btnResearchHistory';
    historyButton.textContent = 'Мои исследования';
    historyButton.addEventListener('click', openHistory);
    topbar.prepend(historyButton);
  }

  const resultActions = document.querySelector('.result-actions');
  if (resultActions) {
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn-sm';
    saveButton.id = 'btnSaveResearch';
    saveButton.textContent = 'Сохранить';
    saveButton.setAttribute('data-tip', 'В managed-режиме сохранит исследование в приватном серверном хранилище; без него использует локальный fallback');
    saveButton.addEventListener('click', saveCurrentResearch);
    resultActions.prepend(saveButton);
  }

  const overlay = document.createElement('div');
  overlay.id = 'researchHistoryOverlay';
  overlay.className = 'history-overlay';
  overlay.innerHTML = `
    <div class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="researchHistoryTitle">
      <div class="history-head">
        <div>
          <div class="ai-report-kicker" id="researchHistoryKicker">МОИ ИССЛЕДОВАНИЯ</div>
          <h2 id="researchHistoryTitle">История исследований</h2>
        </div>
        <button type="button" class="btn-sm" id="btnCloseResearchHistory">Закрыть</button>
      </div>
      <p class="hint" id="researchHistoryHint">Загрузка режима хранения…</p>
      <div id="researchHistoryList" class="history-list"></div>
    </div>`;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHistory();
  });
  document.body.append(overlay);
  document.getElementById('btnCloseResearchHistory')?.addEventListener('click', closeHistory);
}
