import { getApiKey } from './storage.js';

const TASKS = {
  research: {
    title: 'Провести исследование',
    subtitle: 'Опишите HR-задачу, соберите источники и получите доказательный отчёт.'
  },
  search: {
    title: 'Найти информацию',
    subtitle: 'Быстрый поиск по теме с возможностью загрузить полный текст источников.'
  },
  ai: {
    title: 'Получить выводы и рекомендации',
    subtitle: 'Проанализируйте уже собранные материалы и получите выводы с источниками.'
  },
  crawl: {
    title: 'Собрать материалы с сайта',
    subtitle: 'Соберите страницы выбранного сайта или раздела.'
  },
  scrape: {
    title: 'Загрузить страницу по ссылке',
    subtitle: 'Добавьте одну веб-страницу в материалы для анализа.'
  }
};

let installed = false;
let verified = false;

function el(id) {
  return document.getElementById(id);
}

function setWorkspaceTitle(tab) {
  const task = TASKS[tab] || TASKS.research;
  const title = el('friendlyWorkspaceTitle');
  const subtitle = el('friendlyWorkspaceSubtitle');
  if (title) title.textContent = task.title;
  if (subtitle) subtitle.textContent = task.subtitle;
}

function openWorkspace(tab) {
  if (!verified) {
    const state = el('friendlyAccessState');
    if (state) state.textContent = 'Сначала войдите по персональному коду HRP.';
    el('apiKey')?.focus();
    el('friendlyAccess')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const button = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (!button) return;
  document.body.classList.add('workspace-open');
  setWorkspaceTitle(tab);
  button.click();
  el('friendlyWorkspaceHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeWorkspace() {
  document.body.classList.remove('workspace-open');
  el('friendlyHome')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function proxyClick(id) {
  const button = el(id);
  if (!button) return;
  button.click();
}

function setAccessState(ok, user = '') {
  verified = Boolean(ok);
  document.body.classList.toggle('access-ready', verified);
  const state = el('friendlyAccessState');
  const userEl = el('friendlyAccessUser');
  if (state) {
    state.textContent = verified
      ? 'Доступ подтверждён. Можно начинать работу.'
      : 'Введите персональный код доступа HRP.';
  }
  if (userEl) userEl.textContent = user ? `Пользователь: ${user}` : 'Доступ подтверждён';
}

function renameCoreUi() {
  const searchHead = document.querySelector('#panel-search .card-head');
  if (searchHead) searchHead.textContent = 'Быстрый поиск';
  const searchLabel = el('searchQuery')?.closest('.field')?.querySelector('label');
  if (searchLabel) searchLabel.textContent = 'Что нужно найти?';
  const searchLimitLabel = el('searchLimit')?.closest('.field')?.querySelector('label');
  if (searchLimitLabel) searchLimitLabel.textContent = 'Сколько источников';
  const searchButton = el('btnSearch');
  if (searchButton) searchButton.textContent = 'Найти информацию';
  const searchScrape = el('searchScrape')?.closest('label');
  if (searchScrape) {
    const checkbox = el('searchScrape');
    searchScrape.textContent = '';
    if (checkbox) searchScrape.append(checkbox, document.createTextNode(' Добавить полный текст найденных страниц'));
  }

  const aiHead = document.querySelector('#panel-ai .card-head');
  if (aiHead) aiHead.textContent = 'Получить выводы и рекомендации';
  const aiButton = el('btnAiAnalyze');
  if (aiButton) aiButton.textContent = 'Получить выводы и рекомендации';
  const aiTextLabel = el('aiUseMarkdown')?.closest('label');
  if (aiTextLabel) {
    const checkbox = el('aiUseMarkdown');
    aiTextLabel.textContent = '';
    if (checkbox) aiTextLabel.append(checkbox, document.createTextNode(' Использовать полный текст источников'));
  }

  const crawlHead = document.querySelector('#panel-crawl .card-head');
  if (crawlHead) crawlHead.textContent = 'Собрать материалы с сайта';
  const crawlButton = el('btnCrawl');
  if (crawlButton) crawlButton.textContent = 'Собрать материалы';

  const scrapeHead = document.querySelector('#panel-scrape .card-head');
  if (scrapeHead) scrapeHead.textContent = 'Загрузить страницу по ссылке';
  const scrapeLabel = el('scrapeUrl')?.closest('.field')?.querySelector('label');
  if (scrapeLabel) scrapeLabel.textContent = 'Ссылка на страницу';
  const scrapeButton = el('btnScrape');
  if (scrapeButton) scrapeButton.textContent = 'Загрузить страницу';

  document.querySelector('.tab-btn[data-tab="research"]')?.replaceChildren(document.createTextNode('Провести исследование'));
  document.querySelector('.tab-btn[data-tab="search"]')?.replaceChildren(document.createTextNode('Найти информацию'));
  document.querySelector('.tab-btn[data-tab="ai"]')?.replaceChildren(document.createTextNode('Выводы и рекомендации'));
  document.querySelector('.tab-btn[data-tab="crawl"]')?.replaceChildren(document.createTextNode('Материалы с сайта'));
  document.querySelector('.tab-btn[data-tab="scrape"]')?.replaceChildren(document.createTextNode('Страница по ссылке'));
}

function simplifyResearchPanel() {
  const panel = el('panel-research');
  if (!panel || el('friendlyResearchAdvanced')) return;
  const body = panel.querySelector('.card-body');
  if (!body) return;

  const head = panel.querySelector('.card-head');
  if (head) head.textContent = 'Провести исследование';

  const intro = body.querySelector(':scope > .hint');
  if (intro) intro.textContent = 'Опишите задачу обычными словами. HR Помощник поможет сформировать поисковый план и соберёт источники.';

  const brief = el('researchBrief');
  const briefField = brief?.closest('.field');
  if (briefField) {
    const label = briefField.querySelector('label');
    if (label) label.textContent = 'Что нужно исследовать?';
    if (brief) {
      brief.rows = 8;
      brief.placeholder = 'Например: сравни практики удержания ИТ-специалистов у крупных работодателей России за 2024-2026 годы и предложи применимые меры.';
    }
    const step = document.createElement('div');
    step.className = 'friendly-step-label';
    step.textContent = '1. Опишите задачу';
    briefField.insertAdjacentElement('beforebegin', step);
  }

  const planner = el('btnAiPlanResearch');
  if (planner) {
    planner.textContent = 'Сформировать план с ИИ';
    planner.classList.add('friendly-plan-button');
    const planWrap = document.createElement('div');
    planWrap.className = 'friendly-plan-row';
    planWrap.innerHTML = '<div><strong>2. Подготовьте план поиска</strong><span>Рекомендуемый вариант - ИИ сам сформирует поисковые запросы.</span></div>';
    planWrap.append(planner);
    briefField?.insertAdjacentElement('afterend', planWrap);
  }

  const advanced = document.createElement('details');
  advanced.id = 'friendlyResearchAdvanced';
  advanced.className = 'friendly-advanced';
  advanced.innerHTML = '<summary>Настройки исследования</summary><p class="hint">Обычно менять их не требуется. Здесь можно вручную настроить поисковые запросы, домены, период и объём сбора.</p>';

  const blocks = [
    el('researchLimit')?.closest('.field-row'),
    el('researchKeywords')?.closest('.field'),
    el('researchScrapeRow'),
    el('researchDomains')?.closest('.field'),
    el('researchDateFilter')?.closest('.checks')
  ].filter(Boolean);
  blocks.forEach((block) => advanced.append(block));

  const runButton = el('btnResearch');
  if (runButton) {
    runButton.textContent = 'Начать исследование';
    runButton.insertAdjacentElement('beforebegin', advanced);
  } else {
    body.append(advanced);
  }
}

function buildHome() {
  const home = document.createElement('section');
  home.id = 'friendlyHome';
  home.className = 'friendly-home';
  home.innerHTML = `
    <div class="friendly-intro">
      <div class="friendly-kicker">HR ПОМОЩНИК</div>
      <h1>Что вы хотите сделать?</h1>
      <p>Выберите задачу. Технические настройки можно открыть позже, если они действительно понадобятся.</p>
    </div>

    <section class="friendly-access" id="friendlyAccess">
      <div class="friendly-section-head">
        <div>
          <span class="friendly-step">Вход</span>
          <h2>Персональный доступ</h2>
          <p>Для работы нужен только ваш код HRP. Дополнительные ключи и настройки не требуются.</p>
        </div>
        <div class="friendly-access-state" id="friendlyAccessState">Введите персональный код доступа HRP.</div>
      </div>
      <div id="friendlyAccessSlot"></div>
      <div class="friendly-access-ok">
        <div>
          <strong id="friendlyAccessUser">Доступ подтверждён</strong>
          <span>Сервис готов к работе.</span>
        </div>
        <button type="button" class="btn-sm" id="friendlyChangeCode">Сменить код</button>
      </div>
    </section>

    <section class="friendly-after-access">
      <div class="friendly-section-title">
        <span class="friendly-step">Основные задачи</span>
        <h2>Выберите, что нужно сделать</h2>
      </div>
      <div class="friendly-task-grid">
        <button type="button" class="friendly-task-card friendly-task-primary" data-friendly-tab="research">
          <span class="friendly-task-icon">◎</span>
          <span><strong>Провести исследование</strong><small>Собрать источники, сравнить практики и получить доказательный отчёт.</small></span>
          <span class="friendly-arrow">→</span>
        </button>
        <button type="button" class="friendly-task-card" data-friendly-tab="search">
          <span class="friendly-task-icon">⌕</span>
          <span><strong>Найти информацию</strong><small>Быстро найти материалы по теме и при необходимости загрузить полный текст.</small></span>
          <span class="friendly-arrow">→</span>
        </button>
        <button type="button" class="friendly-task-card" data-friendly-tab="ai">
          <span class="friendly-task-icon">✦</span>
          <span><strong>Получить выводы и рекомендации</strong><small>Проанализировать уже собранные материалы и получить проверяемые выводы.</small></span>
          <span class="friendly-arrow">→</span>
        </button>
      </div>

      <button type="button" class="friendly-history-card" id="friendlyHistory">
        <span><strong>Мои исследования</strong><small>Вернуться к сохранённым исследованиям и отчётам.</small></span>
        <span class="friendly-arrow">→</span>
      </button>

      <details class="friendly-tools">
        <summary>Дополнительные инструменты</summary>
        <div class="friendly-tool-grid">
          <button type="button" class="friendly-tool" data-friendly-tab="crawl"><strong>Собрать материалы с сайта</strong><span>Обойти раздел сайта и собрать страницы.</span></button>
          <button type="button" class="friendly-tool" data-friendly-tab="scrape"><strong>Загрузить страницу по ссылке</strong><span>Добавить одну страницу в материалы.</span></button>
          <button type="button" class="friendly-tool" id="friendlyMonitoring"><strong>Мониторинг</strong><span>Повторно проверять исследование и изменения.</span></button>
          <button type="button" class="friendly-tool" id="friendlyLimits"><strong>Лимиты</strong><span>Посмотреть использование сервиса и доступный баланс.</span></button>
        </div>
      </details>
    </section>`;
  return home;
}

function buildWorkspaceHeader() {
  const header = document.createElement('section');
  header.id = 'friendlyWorkspaceHead';
  header.className = 'friendly-workspace-head';
  header.innerHTML = `
    <button type="button" class="friendly-back" id="friendlyBack">← Все задачи</button>
    <div>
      <div class="friendly-kicker">РАБОЧАЯ ОБЛАСТЬ</div>
      <h2 id="friendlyWorkspaceTitle">Провести исследование</h2>
      <p id="friendlyWorkspaceSubtitle">Опишите HR-задачу, соберите источники и получите доказательный отчёт.</p>
    </div>`;
  return header;
}

function wireEvents() {
  document.querySelectorAll('[data-friendly-tab]').forEach((button) => {
    button.addEventListener('click', () => openWorkspace(button.dataset.friendlyTab));
  });
  el('friendlyBack')?.addEventListener('click', closeWorkspace);
  el('friendlyHistory')?.addEventListener('click', () => proxyClick('btnResearchHistory'));
  el('friendlyMonitoring')?.addEventListener('click', () => proxyClick('btnMonitoring'));
  el('friendlyLimits')?.addEventListener('click', () => proxyClick('btnUsage'));
  el('friendlyChangeCode')?.addEventListener('click', () => {
    setAccessState(false);
    const input = el('apiKey');
    if (input) {
      input.focus();
      input.select();
    }
  });

  document.querySelectorAll('.tab-btn[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setWorkspaceTitle(button.dataset.tab));
  });

  window.addEventListener('hrp:access-verified', (event) => {
    setAccessState(true, event.detail?.user || '');
  });
  window.addEventListener('hrp:access-rejected', () => setAccessState(false));
}

export function installFriendlyUi(runtime) {
  if (installed || !runtime?.managed) return;
  installed = true;
  document.body.classList.add('friendly-ui');

  const home = buildHome();
  const banner = document.querySelector('.banner');
  const hero = document.querySelector('.hero');
  (banner || hero)?.insertAdjacentElement('afterend', home);

  const accessCard = el('apiKey')?.closest('.card');
  if (accessCard) {
    accessCard.classList.add('friendly-access-card');
    el('friendlyAccessSlot')?.append(accessCard);
  }

  const wrap = document.querySelector('.wrap');
  const workspaceHead = buildWorkspaceHeader();
  wrap?.insertAdjacentElement('beforebegin', workspaceHead);

  renameCoreUi();
  simplifyResearchPanel();
  wireEvents();
  setAccessState(false);

  const code = getApiKey();
  if (code) {
    const state = el('friendlyAccessState');
    if (state) state.textContent = 'Проверяем сохранённый код…';
    setTimeout(() => el('btnCheckAccess')?.click(), 0);
  }
}