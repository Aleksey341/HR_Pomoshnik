let installed = false;

function el(id) {
  return document.getElementById(id);
}

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const nextHeight = Math.max(150, Math.min(textarea.scrollHeight, 360));
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 360 ? 'auto' : 'hidden';
}

function polishProcessWizard() {
  const asIs = el('processAsIs');
  if (asIs && asIs.dataset.uxPolished !== '1') {
    asIs.dataset.uxPolished = '1';
    asIs.rows = 6;
    const label = asIs.closest('.process-field')?.querySelector(':scope > span');
    if (label) label.textContent = 'Опишите, как процесс проходит сейчас';
    asIs.addEventListener('input', () => autoGrow(asIs));
    asIs.addEventListener('focus', () => autoGrow(asIs));
  }

  const next = el('btnProcessNext');
  if (next) next.textContent = 'Продолжить →';

  const run = el('btnRunProcessImprovement');
  if (run && !run.disabled) run.textContent = 'Исследовать и улучшить процесс →';

  const trigger = el('friendlyProcessImprovement');
  if (trigger && trigger.dataset.uxPolishWired !== '1') {
    trigger.dataset.uxPolishWired = '1';
    trigger.addEventListener('click', () => {
      requestAnimationFrame(() => requestAnimationFrame(() => autoGrow(asIs)));
    });
  }
}

function polishAccessState() {
  if (!document.body.classList.contains('access-ready')) return;
  const state = el('friendlyAccessState');
  if (state) state.textContent = 'Доступ подтверждён';
}

export function installUxPolish() {
  if (installed) return;
  installed = true;
  polishProcessWizard();
  polishAccessState();

  window.addEventListener('hrp:access-verified', polishAccessState);
  window.addEventListener('hrp:access-rejected', () => {
    const state = el('friendlyAccessState');
    if (state) state.textContent = 'Введите персональный код доступа HRP.';
  });

  const observer = new MutationObserver(() => {
    polishProcessWizard();
    polishAccessState();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}