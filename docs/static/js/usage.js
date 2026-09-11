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

function setCreditBadge(data, state = 'ready') {
  const el = document.getElementById('creditCounter');
  if (!el) return;
  el.dataset.managedBalance = '1';
  const firecrawl = data?.firecrawl;
  if (firecrawl && Number.isFinite(Number(firecrawl.remainingCredits))) {
    const remaining = formatNumber(firecrawl.remainingCredits);
    const total = Number(firecrawl.planCredits || 0);
    el.textContent = total > 0 ? `Firecrawl: ${remaining} / ${formatNumber(total)}` : `Firecrawl: ${remaining} кред.`;
    el.title = 'Реальный остаток кредитов Firecrawl. Это общий баланс серверного Firecrawl-аккаунта, а не персональный лимит HRP-пользователя.';
    return;
  }
  if (state === 'missing-code') {
    el.textContent = 'Firecrawl: введите код';
    el.title = 'После ввода кода HRP будет показан реальный баланс Firecrawl.';
    return;
  }
  el.textContent = 'Firecrawl: баланс н/д';
  el.title = 'Баланс Firecrawl сейчас не удалось получить. Внутренние лимиты HR Помощника доступны по кнопке «Лимиты».';
}

async function loadUsage(runtime, code) {
  const usageRes = await fetch(`${runtime.base}/usage/me`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${code}` },
  });
  const data = await usageRes.json().catch(() => ({}));
  if (!usageRes.ok) throw new Error(data.error || `HTTP ${usageRes.status}`);

  try {
    const creditsRes = await fetch(`${runtime.base}/firecrawl/credits`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${code}` },
    });
    const credits = await creditsRes.json().catch(() => ({}));
    if (creditsRes.ok && credits?.ok) data.firecrawl = credits;
  } catch (_error) {
    // Credit balance is informative and must not block the usage ledger.
  }
  return data;
}

function renderUsage(data) {
  const content = document.getElementById('usageContent');
  if (!content) return;
  const metrics = Object.keys(data.limits || {}).filter((key) => LABELS[key]);
  const firecrawl = data.firecrawl;
  content.innerHTML = `
    <div class="usage-summary">
      <div><span class="hint">Пользователь</span><strong>${esc(data.user || '—')}</strong></div>
      <div><span class="hint">Тариф HRP</span><strong>${esc(data.plan || '—')}</strong></div>
      <div><span class="hint">Период</span><strong>${esc(data.month || '—')}</strong></div>
      <div><span class="hint">Учёт</span><strong>${data.centralized ? 'серверный' : 'локальный runtime'}</strong></div>
    </div>
    ${firecrawl ? `
      <div class="usage-summary" style="margin-top:.8rem">
        <div><span class="hint">Firecrawl осталось</span><strong>${formatNumber(firecrawl.remainingCredits)} кред.</strong></div>
        <div><span class="hint">Firecrawl план</span><strong>${formatNumber(firecrawl.planCredits)} кред.</strong></div>
      </div>
      <p class="hint">Это реальный общий баланс Firecrawl для серверного API. Он отличается от персональных месячных лимитов HR Помощника ниже.</p>
    ` : '<p class="hint usage-warning">Реальный баланс Firecrawl сейчас недоступен. Значение «0» больше не показывается как будто это остаток кредитов.</p>'}
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
    const data = await loadUsage(runtime, code);
    setCreditBadge(data);
    renderUsage(data);
  } catch (error) {
    content.innerHTML = `<p class="error-box visible">${esc(error.message || String(error))}</p>`;
  }
}

export function installUsageDashboard() {
  const topbar = document.querySelector('.topbar-meta');
  if (!topbar) return;
  const counter = document.getElementById('creditCounter');
  if (counter) {
    counter.dataset.managedBalance = '1';
    counter.textContent = 'Firecrawl: баланс…';
    counter.title = 'Реальный остаток кредитов Firecrawl загружается с сервера.';
  }
  if (!document.getElementById('btnUsage')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btnUsage';
    button.className = 'btn-sm';
    button.textContent = 'Лимиты';
    button.setAttribute('data-tip', 'Показать реальный баланс Firecrawl и персональные месячные лимиты HR Помощника');
    button.addEventListener('click', openUsage);
    topbar.prepend(button);
  }
  ensureDialog();
  setTimeout(() => refreshUsageQuietly(), 0);
}

export async function refreshUsageQuietly(accessCode = '') {
  try {
    const runtime = await getApiRuntime();
    const code = accessCode || getApiKey();
    if (!runtime.managed) return;
    if (!code) {
      setCreditBadge(null, 'missing-code');
      return;
    }
    const data = await loadUsage(runtime, code);
    setCreditBadge(data);
    const remainingAi = data.remaining?.ai_calls;
    if (Number.isFinite(Number(remainingAi)) && Number(remainingAi) <= 5) {
      showToast(`Осталось AI-вызовов в этом месяце: ${remainingAi}`);
    }
  } catch (_error) {
    setCreditBadge(null, 'unavailable');
    // Usage hints must never block the research workflow.
  }
}
