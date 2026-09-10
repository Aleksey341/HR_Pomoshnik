const KEY_ACCESS = 'hr_pomoshnik_access_code';
const KEY_OPENAI = 'openai_api_key';

function rememberEnabled() {
  return document.getElementById('rememberKeys')?.checked ?? false;
}

export function getApiKey() {
  return document.getElementById('apiKey')?.value.trim() || '';
}

export function getOpenAiKey() {
  return document.getElementById('openaiKey')?.value.trim() || '';
}

export function loadApiKey() {
  if (!rememberEnabled()) return;
  const key = sessionStorage.getItem(KEY_ACCESS);
  if (key) document.getElementById('apiKey').value = key;
}

export function loadOpenAiKey() {
  if (!rememberEnabled()) return;
  const key = sessionStorage.getItem(KEY_OPENAI);
  if (key && document.getElementById('openaiKey')) document.getElementById('openaiKey').value = key;
}

export function persistApiKey() {
  const key = getApiKey();
  if (rememberEnabled() && key) sessionStorage.setItem(KEY_ACCESS, key);
  else sessionStorage.removeItem(KEY_ACCESS);
}

export function persistOpenAiKey() {
  const key = getOpenAiKey();
  if (rememberEnabled() && key) sessionStorage.setItem(KEY_OPENAI, key);
  else sessionStorage.removeItem(KEY_OPENAI);
}

export function initStorage() {
  const remember = document.getElementById('rememberKeys');
  if (remember) {
    remember.addEventListener('change', () => {
      persistApiKey();
      persistOpenAiKey();
    });
  }
  document.getElementById('apiKey')?.addEventListener('change', persistApiKey);
  document.getElementById('openaiKey')?.addEventListener('change', persistOpenAiKey);
  loadApiKey();
  loadOpenAiKey();
}

// Совместимость со старым кодом — без автосохранения при каждом запросе
export function saveApiKey() {}
export function saveOpenAiKey() {}
