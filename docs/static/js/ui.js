import { LOADERS } from './config.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;

export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

export function flashButton(btn) {
  btn.classList.add('flash-ok');
  setTimeout(() => btn.classList.remove('flash-ok'), 1200);
}

export function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.classList.add('visible');
}

export function hideError() {
  document.getElementById('errorBox').classList.remove('visible');
}

export function runLoader(id, done) {
  const el = document.getElementById('loader-' + id);
  el.innerHTML = LOADERS[id]
    .map((t, i) => `<div class="loader-step" data-i="${i}">${esc(t)}</div>`)
    .join('');
  el.classList.add('visible');
  const steps = el.querySelectorAll('.loader-step');
  let i = 0;
  (function tick() {
    steps.forEach((s, idx) => {
      s.classList.toggle('active', idx === i);
      s.classList.toggle('done', idx < i);
    });
    if (i++ >= steps.length) {
      setTimeout(done, 250);
      return;
    }
    setTimeout(tick, 450);
  })();
}

export function hideLoader(id) {
  document.getElementById('loader-' + id).classList.remove('visible');
}

export function setProgress(elId, text) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.classList.add('visible');
}

export function hideProgress(elId) {
  document.getElementById(elId).classList.remove('visible');
}
