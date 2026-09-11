import { callOpenAiAnalysis, renderAiReport } from './ai.js';
import { getLastAiReport, getLastPayload, getReportVariants, setReportVariant } from './state.js';
import { hideError, hideLoader, runLoader, showError, showToast } from './ui.js';

function excerpt(value, limit = 118_000) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '\n\n[...часть полного отчёта сокращена при преобразовании формата...]\n\n';
  const available = limit - marker.length;
  const head = Math.floor(available * 0.72);
  return text.slice(0, head) + marker + text.slice(-(available - head));
}

function ensureFullReport() {
  const variants = getReportVariants();
  if (variants.full) return variants.full;
  const current = getLastAiReport();
  if (current) setReportVariant('full', current);
  return current;
}

const FORMATS = {
  full: {
    label: 'Полный отчёт',
    title: 'Полный аналитический отчёт',
    kicker: 'HR ПОМОЩНИК · EVIDENCE REPORT',
  },
  executive: {
    label: 'Краткая записка',
    title: 'Краткая записка руководителю',
    kicker: 'HR ПОМОЩНИК · EXECUTIVE BRIEF',
    maxTokens: 2800,
    instruction: `Преобразуй полный аналитический отчёт в краткую управленческую записку.\nСтруктура:\n1. Решение в двух абзацах: что происходит и почему это важно.\n2. Пять ключевых выводов с [Sxxx].\n3. Что рекомендуется сделать: 3-7 конкретных действий.\n4. Риски и ограничения данных.\n5. Что проверить дополнительно.\n\nНе добавляй новых фактов. Сохраняй Source ID. Убирай второстепенные детали и реестр источников не дублируй полностью.`,
  },
  presentation: {
    label: 'Презентация',
    title: 'Структура презентации для руководителя',
    kicker: 'HR ПОМОЩНИК · EXECUTIVE DECK',
    maxTokens: 3800,
    instruction: `Преобразуй полный аналитический отчёт в готовую структуру презентации для руководителя на 8-10 слайдов.\nДля каждого слайда дай:\n- заголовок;\n- 2-5 коротких тезисов;\n- ключевые цифры или сравнения, если они есть;\n- Source ID [Sxxx] рядом с фактическими тезисами;\n- строку «Акцент докладчика».\n\nОбязательные слайды: цель/контекст, ключевые выводы, сравнительные практики, проблемные зоны, рекомендации, план действий, риски/ограничения, источники. Не добавляй фактов, которых нет в исходном отчёте.`,
  },
};

async function buildVariant(key) {
  const format = FORMATS[key];
  if (!format) return;
  const full = ensureFullReport();
  if (!full) {
    showToast('Сначала выполните AI-анализ');
    return;
  }

  if (key === 'full') {
    renderAiReport(full, { title: format.title, kicker: format.kicker, preserveQuality: true });
    return;
  }

  const cached = getReportVariants()[key];
  if (cached) {
    renderAiReport(cached, { title: format.title, kicker: format.kicker, preserveQuality: true });
    showToast(`Открыт сохранённый формат: ${format.label}`);
    return;
  }

  const payload = getLastPayload();
  const brief = payload?.meta?.researchBrief || document.getElementById('researchBrief')?.value?.trim() || '';
  hideError();
  const clicked = document.querySelector(`[data-report-format="${key}"]`);
  if (clicked) clicked.disabled = true;

  runLoader('ai', async () => {
    try {
      const transformed = await callOpenAiAnalysis({
        system: 'Ты редактор доказательных HR-отчётов для руководителей. Сохраняй фактическую точность и Source ID из исходного отчёта.',
        user: `Исходное техническое задание:\n${brief || 'не указано'}\n\nПолный аналитический отчёт:\n${excerpt(full)}\n\nЗадача преобразования:\n${format.instruction}\n\nОтвет на русском, в markdown.`
      }, format.maxTokens);
      if (!transformed.trim()) throw new Error('ИИ вернул пустой документ');
      setReportVariant(key, transformed);
      renderAiReport(transformed, { title: format.title, kicker: format.kicker, preserveQuality: true });
      document.getElementById('tabAiBtn')?.click();
      showToast(`${format.label} готова`);
    } catch (error) {
      showError(error.message || String(error));
      showToast(`Не удалось сформировать формат «${format.label}»`);
    } finally {
      if (clicked) clicked.disabled = false;
      hideLoader('ai');
    }
  });
}

export function installReportFormats() {
  if (document.getElementById('reportFormatBar')) return;
  const aiBody = document.querySelector('#panel-ai .card-body');
  const analyzeButton = document.getElementById('btnAiAnalyze');
  if (!aiBody || !analyzeButton) return;

  const box = document.createElement('div');
  box.id = 'reportFormatBar';
  box.className = 'report-format-box';
  const title = document.createElement('div');
  title.className = 'hint';
  title.innerHTML = '<strong>Формат готового материала</strong> - после полного AI-анализа можно переключаться между версиями.';
  const actions = document.createElement('div');
  actions.className = 'report-format-actions';

  for (const [key, format] of Object.entries(FORMATS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sm';
    button.dataset.reportFormat = key;
    button.textContent = format.label;
    button.addEventListener('click', () => buildVariant(key));
    actions.append(button);
  }

  box.append(title, actions);
  analyzeButton.insertAdjacentElement('afterend', box);
}
