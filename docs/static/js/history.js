import { renderAiReport } from './ai.js';
import { getLastAiReport, getLastPayload } from './state.js';
import { renderResults } from './results.js';
import { showToast } from './ui.js';

const STORAGE_KEY = 'hr_pomoshnik_research_history_v1';
const MAX_ENTRIES = 6;
const MAX_TEXT_PER_SOURCE = 3000;

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
      description: excerpt(item.description || item.snippet, 1000),
      snippet: excerpt(item.snippet, 1000),
      searchKeyword: item.searchKeyword,
      markdown: excerpt(item.markdown || item.content),
      links: Array.isArray(item.links) ? item.links.slice(0, 50) : undefined,
    }))
  };
}

export function saveCurrentResearch() {
  const payload = getLastPayload();
  if (!payload?.items?.length) {
    showToast('Нет исследования для сохранения');
    return;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    title: payload.title || 'Исследование',
    brief: payload.meta?.researchBrief || document.getElementById('researchBrief')?.value?.trim() || '',
    payload: compactPayload(payload),
    aiReport: excerpt(getLastAiReport(), 80_000),
  };

  const entries = loadEntries().filter((item) => item.id !== entry.id);
  const saved = writeEntries([entry, ...entries]);
  if (saved.some((item) => item.id === entry.id)) {
    showToast('Исследование сохранено локально в этом браузере');
    renderHistoryList();
  } else {
    showToast('Не удалось сохранить: хранилище браузера заполнено');
  }
}

function openEntry(entry) {
  if (!entry?.payload?.items?.length) return;
  const brief = document.getElementById('researchBrief');
  if (brief && entry.brief) brief.value = entry.brief;
  renderResults(entry.payload.title, entry.payload.items, entry.payload.meta || {});
  if (entry.aiReport) {
    renderAiReport(entry.aiReport);
    document.getElementById('tabAiBtn')?.click();
  }
  closeHistory();
  showToast('Исследование восстановлено из локальной истории');
}

function deleteEntry(id) {
  writeEntries(loadEntries().filter((item) => item.id !== id));
  renderHistoryList();
}

function renderHistoryList() {
  const list = document.getElementById('researchHistoryList');
  if (!list) return;
  list.innerHTML = '';
  const entries = loadEntries();
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
    const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString('ru-RU') : '';
    meta.textContent = `${date} · источников: ${entry.payload?.items?.length || 0}${entry.aiReport ? ' · AI-отчёт' : ''}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn-sm';
    open.textContent = 'Открыть';
    open.addEventListener('click', () => openEntry(entry));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-sm';
    del.textContent = 'Удалить';
    del.addEventListener('click', () => deleteEntry(entry.id));
    actions.append(open, del);
    row.append(info, actions);
    list.append(row);
  }
}

function closeHistory() {
  document.getElementById('researchHistoryOverlay')?.classList.remove('visible');
}

function openHistory() {
  renderHistoryList();
  document.getElementById('researchHistoryOverlay')?.classList.add('visible');
}

export function installResearchHistory() {
  if (document.getElementById('researchHistoryOverlay')) return;

  const topbar = document.querySelector('.topbar-meta');
  if (topbar) {
    const historyButton = document.createElement('button');
    historyButton.type = 'button';
    historyButton.className = 'btn-sm';
    historyButton.id = 'btnResearchHistory';
    historyButton.textContent = 'История';
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
    saveButton.setAttribute('data-tip', 'Сохранит исследование и AI-отчёт только в этом браузере');
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
          <div class="ai-report-kicker">ЛОКАЛЬНОЕ ХРАНИЛИЩЕ</div>
          <h2 id="researchHistoryTitle">История исследований</h2>
        </div>
        <button type="button" class="btn-sm" id="btnCloseResearchHistory">Закрыть</button>
      </div>
      <p class="hint">Данные сохраняются только в localStorage этого браузера. Не сохраняйте сюда чувствительные персональные данные на общем компьютере.</p>
      <div id="researchHistoryList" class="history-list"></div>
    </div>`;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHistory();
  });
  document.body.append(overlay);
  document.getElementById('btnCloseResearchHistory')?.addEventListener('click', closeHistory);
}
