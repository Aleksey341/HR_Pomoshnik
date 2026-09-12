import { initStorage } from './storage.js';
import { abortActiveRequest } from './api.js';
import { getApiRuntime } from './config.js';
import { installUsageDashboard, refreshUsageQuietly } from './usage.js';
import { installFriendlyUi } from './friendly-ui.js';

window.addEventListener('pagehide', () => abortActiveRequest());

function ensureStylesheet(id, path) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL(path, document.baseURI).href;
  document.head.append(link);
}

function ensureFeatureStyles() {
  ensureStylesheet('researchSuiteStyles', 'static/css/research-suite.css');
  ensureStylesheet('friendlyUiStyles', 'static/css/friendly-ui.css');
  ensureStylesheet('researchQualityStyles', 'static/css/research-quality.css');
}

function capSelect(id, maxValue) {
  const select = document.getElementById(id);
  if (!select) return;
  let best = null;
  [...select.options].forEach((option) => {
    const value = Number(option.value);
    if (Number.isFinite(value) && value > maxValue) option.disabled = true;
    if (Number.isFinite(value) && value <= maxValue && (best === null || value > best)) best = value;
  });
  if (Number(select.value) > maxValue && best !== null) select.value = String(best);
}

function applyManagedUiLimits() {
  capSelect('searchLimit', 50);
  capSelect('researchLimit', 50);
  capSelect('crawlLimit', 100);
  capSelect('crawlDepth', 6);
}

function installAccessCheck(runtime, apiField, apiInput) {
  if (!apiField || !apiInput || document.getElementById('btnCheckAccess')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btnCheckAccess';
  button.className = 'btn-sm';
  button.style.marginTop = '.5rem';
  button.style.width = '100%';
  button.textContent = 'Войти';

  const status = document.createElement('p');
  status.id = 'accessCheckStatus';
  status.className = 'hint';
  status.style.marginTop = '.4rem';

  button.addEventListener('click', async () => {
    const code = apiInput.value.trim();
    if (!code) {
      status.textContent = 'Введите персональный код доступа HRP.';
      window.dispatchEvent(new CustomEvent('hrp:access-rejected'));
      return;
    }
    button.disabled = true;
    button.textContent = 'Проверяем…';
    status.textContent = 'Проверяем доступ…';
    try {
      const res = await fetch(`${runtime.base}/access/check`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${code}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      status.textContent = `Доступ подтверждён${data.user ? `: ${data.user}` : ''}`;
      window.dispatchEvent(new CustomEvent('hrp:access-verified', { detail: { user: data.user || '' } }));
      await refreshUsageQuietly(code);
    } catch (err) {
      status.textContent = `Не удалось войти: ${err.message || err}`;
      window.dispatchEvent(new CustomEvent('hrp:access-rejected'));
    } finally {
      button.disabled = false;
      button.textContent = 'Войти';
    }
  });

  apiField.append(button, status);
}

function installAiNavigation() {
  const tab = document.getElementById('tabAiBtn');
  if (!tab) return;
  tab.classList.remove('tab-hidden');
  if (tab.dataset.autoOpenInstalled === '1') return;
  tab.dataset.autoOpenInstalled = '1';

  const observer = new MutationObserver(() => {
    if (tab.classList.contains('tab-new')) {
      tab.click();
      tab.classList.remove('tab-new');
    }
  });

  observer.observe(tab, { attributes: true, attributeFilter: ['class'] });
}

async function applyRuntimeUi() {
  const runtime = await getApiRuntime();
  const apiInput = document.getElementById('apiKey');
  const apiField = apiInput?.closest('.field');
  const apiLabel = apiField?.querySelector('label');
  const apiHint = apiField?.querySelector('.hint');
  const accessCardHead = apiField?.closest('.card')?.querySelector('.card-head');
  const rememberLabel = document.getElementById('rememberKeys')?.closest('label');
  const openAiField = document.getElementById('openaiKey')?.closest('.field');
  const aiPanelHint = document.querySelector('#panel-ai .card-body > .hint');
  const aiButton = document.getElementById('btnAiAnalyze');
  const aiCopyButton = document.getElementById('btnAiCopyPrompt');
  const heroLead = document.getElementById('heroLead');
  const banner = document.getElementById('serverBanner');
  const brand = document.querySelector('.topbar-brand');
  const heroTitle = document.querySelector('.hero h1');

  document.title = 'HR Помощник';
  if (brand) brand.textContent = 'HR Помощник';
  if (heroTitle) heroTitle.textContent = 'HR Помощник: поиск, исследования и AI-анализ';

  if (runtime.managed) {
    applyManagedUiLimits();
    if (accessCardHead) accessCardHead.textContent = 'Доступ';
    if (apiLabel) apiLabel.textContent = 'Код доступа HR Помощник';
    if (apiInput) {
      apiInput.placeholder = 'HRP-xxxxxxxx';
      apiInput.setAttribute('data-tip', 'Введите персональный код доступа, выданный администратором');
    }
    if (apiHint) apiHint.textContent = 'Для работы нужен только персональный код HRP. Дополнительные API-ключи и настройки не требуются.';
    if (rememberLabel) {
      const checkbox = document.getElementById('rememberKeys');
      rememberLabel.textContent = '';
      if (checkbox) rememberLabel.append(checkbox, document.createTextNode(' Запомнить код доступа в этой вкладке'));
    }
    if (openAiField) openAiField.style.display = 'none';
    if (aiPanelHint) aiPanelHint.textContent = 'Используйте уже собранные материалы. HR Помощник проанализирует источники, сформирует выводы и сохранит ссылки на доказательства.';
    if (aiButton) aiButton.setAttribute('data-tip', 'Проанализирует собранные источники и сформирует evidence-отчёт');
    if (aiCopyButton) aiCopyButton.setAttribute('data-tip', 'Скопирует сформированный промпт и собранные материалы для использования в ChatGPT');
    if (heroLead) heroLead.textContent = 'Выберите задачу: провести исследование, найти информацию или получить выводы по собранным материалам.';
    if (banner) banner.textContent = 'Защищённый режим: для работы нужен только персональный код доступа HRP.';
    installAccessCheck(runtime, apiField, apiInput);
    installAiNavigation();
    installUsageDashboard();
  }

  return runtime;
}

async function loadLegacy() {
  await import('./legacy.js');
}

async function bootstrap() {
  ensureFeatureStyles();
  initStorage();

  try {
    await applyRuntimeUi();
  } catch (err) {
    console.warn('Runtime UI config:', err);
  }

  try {
    await loadLegacy();
  } catch (err) {
    console.error(err);
    alert('Не удалось загрузить интерфейс: ' + (err.message || err));
    return;
  }

  try {
    const runtime = await applyRuntimeUi();
    installFriendlyUi(runtime);
  } catch (err) {
    console.warn('Runtime UI config after legacy:', err);
  }
}

bootstrap();