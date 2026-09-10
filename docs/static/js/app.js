import { initStorage } from './storage.js';
import { abortActiveRequest } from './api.js';

window.addEventListener('pagehide', () => abortActiveRequest());

async function loadLegacy() {
  await import('./legacy.js');
}

initStorage();
loadLegacy().catch(err => {
  console.error(err);
  alert('Не удалось загрузить интерфейс: ' + (err.message || err));
});
