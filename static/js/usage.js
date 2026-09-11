import { getApiRuntime } from './config.js';
import { getApiKey } from './storage.js';
import { esc, showToast } from './ui.js';

const LABELS = {
  search_requests: 'Поисковых запросов',
  firecrawl_units: 'Firecrawl единиц',
  crawl_pages: 'Страниц crawl',
  ai_calls: 'AI-вызовов',
  ai_input_chars: 'AI-контекст, символов',
  ai_output_tokens: 'AI output tokens',
  saved_researches: 'Сохранённых исследований',
  monitors: 'Мониторингов',
};

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function progress(used, limit) {
  if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return 0;
  return Math.min(100, Math.round(Number(used || 0) / Number(limit) * 100));
}

function ensureDialog() {
  if (document.getElementById('usageOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'usageOverlay';
  overlay.className = 'history-overlay';
  overlay.innerHTML = `
    <div class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="usageTitle">
      <div class="history-head">
        <div>
          <div class="ai-report-kicker">USAGE LEDGER</div>
          <h2 id="usageTitle">Мои лимиты</h2>
        </div>
        <button type="button" class="btn-sm" id="btnCloseUsage">Закрыть</button>
      </div>
      <div id="usageContent"><p class="hint">Загрузка…</p></div>
    </div>`;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.classList.remove('visible');
  });
  document.body.append(overlay);
  document.getElementById('btnCloseUsage')?.addEventListener('click', () => overlay.classList.remove('visible'));
}

function renderUsage(data) {
  const content = document.getElementById('usageContent');
  if (!content) return;
  const metrics = Object.keys(data.limits || {}).filter((key) => LABELS[key]);
  content.innerHTML = `
    <div class="usage-summary">
      <div><span class="hint">Пользователь</span><strong>${esc(data.user || '—')}</strong></div>
      <div><span class="hint">Тариф</span><strong>${esc(data.plan || '—')}</strong></div>
      <div><span class="hint">Период</span><strong>${esc(data.month || '—')}</strong></div>
      <div><span class="hint">Учёт</span><strong>${data.centralized ? 'серверный' : 'локальный runtime'}</strong></div>
    </div>
    ${data.estimated_cost_usd != null ? `<p class="usage-cost">Оценочная стоимость периода: <strong>$${Number(data.estimated_cost_usd).toFixed(2)}</strong></p>` : ''}
    <div class="usage-list">
      ${metrics.map((key) => {
        const used = Number(data.usage?.[key] || 0);
        const limit = Number(data.limits?.[key] || 0);
        const pct = progress(used, limit);
        return `<div class="usage-row">
          <div class="usage-row-head"><span>${esc(LABELS[key])}</span><strong>${formatNumber(used)} / ${formatNumber(limit)}</strong></div>
          <div class="usage-bar"><span style="width:${pct}%"></span></div>
        </div>`;
      }).join('')}
    </div>
    ${data.centralized ? '' : '<p class="hint usage-warning">Централизованное Vercel Blob-хранилище пока не подключено. Жёсткие лимиты одного запроса действуют, месячный счётчик сохраняется только внутри текущего serverless runtime.</p>'}`;
}

async function openUsage() {
  ensureDialog();
  const overlay = document.getElementById('usageOverlay');
  const content = document.getElementById('usageContent');
  overlay.classList.add('visible');
  content.innerHTML = '<p class="hint">Загрузка лимитов…</p>';
  try {
    const runtime = await getApiRuntime();
    if (!runtime.managed) throw new Error('Лимиты доступны в managed-режиме');
    const code = getApiKey();
    if (!code) throw new Error('Введите код доступа HR Помощник');
    const res = await fetch(`${runtime.base}/usage/me`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${code}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderUsage(data);
  } catch (error) {
    content.innerHTML = `<p class="error-box visible">${esc(error.message || String(error))}</p>`;
  }
}

export function installUsageDashboard() {
  if (document.getElementById('btnUsage')) return;
  const topbar = document.querySelector('.topbar-meta');
  if (!topbar) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btnUsage';
  button.className = 'btn-sm';
  button.textContent = 'Лимиты';
  button.setAttribute('data-tip', 'Показать месячное использование Firecrawl и AI');
  button.addEventListener('click', openUsage);
  topbar.prepend(button);
  ensureDialog();
}

export async function refreshUsageQuietly() {
  try {
    const runtime = await getApiRuntime();
    const code = getApiKey();
    if (!runtime.managed || !code) return;
    const res = await fetch(`${runtime.base}/usage/me`, { cache: 'no-store', headers: { Authorization: `Bearer ${code}` } });
    if (!res.ok) return;
    const data = await res.json();
    const remainingAi = data.remaining?.ai_calls;
    if (Number.isFinite(Number(remainingAi)) && Number(remainingAi) <= 5) {
      showToast(`Осталось AI-вызовов в этом месяце: ${remainingAi}`);
    }
  } catch (_error) {
    // Usage hints must never block the research workflow.
  }
}
