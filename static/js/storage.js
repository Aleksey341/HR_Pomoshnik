const KEY_ACCESS = 'hr_pomoshnik_access_code';
const KEY_OPENAI = 'openai_api_key';
const KEY_REMEMBER = 'hr_pomoshnik_remember_access';

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
  else if (!rememberEnabled()) sessionStorage.removeItem(KEY_ACCESS);
}

export function persistOpenAiKey() {
  const key = getOpenAiKey();
  if (rememberEnabled() && key) sessionStorage.setItem(KEY_OPENAI, key);
  else if (!rememberEnabled()) sessionStorage.removeItem(KEY_OPENAI);
}

export function initStorage() {
  const remember = document.getElementById('rememberKeys');
  if (remember) {
    const shouldRemember =
      sessionStorage.getItem(KEY_REMEMBER) === '1' ||
      Boolean(sessionStorage.getItem(KEY_ACCESS));

    remember.checked = shouldRemember;
    if (shouldRemember) sessionStorage.setItem(KEY_REMEMBER, '1');

    remember.addEventListener('change', () => {
      if (remember.checked) {
        sessionStorage.setItem(KEY_REMEMBER, '1');
        persistApiKey();
        persistOpenAiKey();
      } else {
        sessionStorage.removeItem(KEY_REMEMBER);
        sessionStorage.removeItem(KEY_ACCESS);
        sessionStorage.removeItem(KEY_OPENAI);
      }
    });
  }

  document.getElementById('apiKey')?.addEventListener('input', persistApiKey);
  document.getElementById('openaiKey')?.addEventListener('input', persistOpenAiKey);

  loadApiKey();
  loadOpenAiKey();
}

// Совместимость со старым кодом: managed-режим сам использует значение из поля.
export function saveApiKey() {
  persistApiKey();
}

export function saveOpenAiKey() {
  persistOpenAiKey();
}
