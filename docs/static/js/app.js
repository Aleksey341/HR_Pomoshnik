import { initStorage } from './storage.js';
import { abortActiveRequest } from './api.js';
import { getApiRuntime } from './config.js';

window.addEventListener('pagehide', () => abortActiveRequest());

function installAccessCheck(runtime, apiField, apiInput) {
  if (!apiField || !apiInput || document.getElementById('btnCheckAccess')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btnCheckAccess';
  button.className = 'btn-sm';
  button.style.marginTop = '.5rem';
  button.style.width = '100%';
  button.textContent = 'Проверить доступ';

  const status = document.createElement('p');
  status.id = 'accessCheckStatus';
  status.className = 'hint';
  status.style.marginTop = '.4rem';

  button.addEventListener('click', async () => {
    const code = apiInput.value.trim();
    if (!code) {
      status.textContent = 'Введите код доступа HRP-...';
      return;
    }
    button.disabled = true;
    status.textContent = 'Проверка доступа…';
    try {
      const res = await fetch(`${runtime.base}/access/check`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${code}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      status.textContent = `Доступ подтверждён: ${data.user || 'пользователь'}`;
    } catch (err) {
      status.textContent = `Доступ не подтверждён: ${err.message || err}`;
    } finally {
      button.disabled = false;
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

  observer.observe(tab, {
    attributes: true,
    attributeFilter: ['class']
  });
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
    if (accessCardHead) accessCardHead.textContent = 'Доступ';
    if (apiLabel) apiLabel.textContent = 'Код доступа HR Помощник';
    if (apiInput) {
      apiInput.placeholder = 'HRP-xxxxxxxx';
      apiInput.setAttribute('data-tip', 'Введите персональный код доступа, выданный администратором');
    }
    if (apiHint) apiHint.textContent = 'Один код используется для поиска, парсинга и AI-анализа. Серверные API-ключи пользователю не выдаются.';
    if (rememberLabel) {
      const checkbox = document.getElementById('rememberKeys');
      rememberLabel.textContent = '';
      if (checkbox) rememberLabel.append(checkbox, document.createTextNode(' Запомнить код доступа в этой вкладке'));
    }
    if (openAiField) openAiField.style.display = 'none';
    if (aiPanelHint) aiPanelHint.textContent = 'AI-анализ доступен после поиска, исследования или парсинга URL, если собран хотя бы один материал. OpenAI API-ключ хранится только на сервере.';
    if (aiButton) aiButton.setAttribute('data-tip', 'Отправит собранные материалы в OpenAI через защищённый сервер и покажет отчёт справа');
    if (aiCopyButton) aiCopyButton.setAttribute('data-tip', 'Скопирует сформированный промпт и собранные материалы для использования в ChatGPT');
    if (heroLead) heroLead.textContent = 'Введите код доступа, выполните поиск, исследование или парсинг и получите AI-анализ собранных материалов.';
    if (banner) banner.textContent = 'Защищённый режим: используйте персональный код HRP. OpenAI и Firecrawl API-ключи хранятся только на сервере.';
    installAccessCheck(runtime, apiField, apiInput);
    installAiNavigation();
  }
}

async function loadLegacy() {
  await import('./legacy.js');
}

async function bootstrap() {
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
    await applyRuntimeUi();
  } catch (err) {
    console.warn('Runtime UI config after legacy:', err);
  }
}

bootstrap();
