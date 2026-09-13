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

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function polishProcessWizard() {
  const asIs = el('processAsIs');
  if (asIs && asIs.dataset.uxPolished !== '1') {
    asIs.dataset.uxPolished = '1';
    asIs.rows = 6;
    const label = asIs.closest('.process-field')?.querySelector(':scope > span');
    setText(label, 'Опишите, как процесс проходит сейчас');
    asIs.addEventListener('input', () => autoGrow(asIs));
    asIs.addEventListener('focus', () => autoGrow(asIs));
  }

  const next = el('btnProcessNext');
  setText(next, 'Продолжить →');

  const run = el('btnRunProcessImprovement');
  if (run && !run.disabled) setText(run, 'Исследовать и улучшить процесс →');

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
  setText(el('friendlyAccessState'), 'Доступ подтверждён');
}

export function installUxPolish() {
  if (installed) return;
  installed = true;
  polishProcessWizard();
  polishAccessState();

  window.addEventListener('hrp:access-verified', polishAccessState);
  window.addEventListener('hrp:access-rejected', () => {
    setText(el('friendlyAccessState'), 'Введите персональный код доступа HRP.');
  });

  const observer = new MutationObserver(() => {
    polishProcessWizard();
    polishAccessState();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}