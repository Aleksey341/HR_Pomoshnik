import { API_BASE, USE_LOCAL_PROXY, getApiRuntime } from './config.js';
import { extractApiError } from './api.js';
import { clearReportVariants, getLastPayload, setLastAiReport, setLastQuality } from './state.js';
import { getApiKey, getOpenAiKey, saveOpenAiKey } from './storage.js';
import { hideError, hideLoader, hideProgress, runLoader, setProgress, showError, showToast } from './ui.js';
import { updateResultsViewForTab } from './results.js';
import { renderMarkdownSafe } from './markdown.js';
import { calculateEvidenceScore } from './quality.js';

const MAX_BATCHES = 8;
const BATCH_CONTEXT_CHARS = 30_000;
const COPY_CONTEXT_CHARS = 120_000;

function qualityHtml(quality) {
  const metrics = [
    ['Цитирование фактов', quality.metrics.citation],
    ['Покрытие источников', quality.metrics.coverage],
    ['Разнообразие доменов', quality.metrics.diversity],
    ['Полные тексты', quality.metrics.fullText],
    ['Корректность Source ID', quality.metrics.validity],
    ['Перекрёстное подтверждение', quality.metrics.corroboration],
  ];
  return `
    <section class="evidence-score-card">
      <div class="evidence-score-main">
        <div class="evidence-score-number">${quality.score}</div>
        <div><strong>Evidence Score / 100</strong><div class="hint">Качество доказательной базы: ${quality.level}</div></div>
      </div>
      <div class="evidence-metrics">
        ${metrics.map(([label, value]) => `<div class="evidence-metric"><span>${label}</span><strong>${value}%</strong><div class="usage-bar"><span style="width:${value}%"></span></div></div>`).join('')}
      </div>
      <div class="evidence-facts">
        <span>Фактических тезисов: <strong>${quality.factualClaims}</strong></span>
        <span>С Source ID: <strong>${quality.citedClaims}</strong></span>
        <span>Источников в доказательствах: <strong>${quality.evidenceSources}/${quality.sourceCount}</strong></span>
        <span>Доменов: <strong>${quality.domainCount}</strong></span>
      </div>
      ${quality.warnings.length ? `<details class="evidence-warnings"><summary>Что требует проверки (${quality.warnings.length})</summary><ul>${quality.warnings.map((item) => `<li>${item}</li>`).join('')}</ul></details>` : '<div class="evidence-ok">Критических замечаний к доказательной базе не найдено.</div>'}
    </section>`;
}

export function renderAiReport(text, options = {}) {
  setLastAiReport(text);
  const payload = getLastPayload();
  const sourceCount = payload?.items?.length || 0;
  const evidenceCount = new Set(String(text || '').match(/S\d{3,}/g) || []).size;
  const generatedAt = new Date().toLocaleString('ru-RU');
  const quality = calculateEvidenceScore(payload, text);
  if (!options.preserveQuality) setLastQuality(quality);

  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('resultsArea').style.display = 'block';
  document.getElementById('resultsTitle').textContent = options.resultsTitle || 'AI-анализ и рекомендации';
  document.getElementById('aiResultsArea').innerHTML = `
    <section class="ai-report-hero">
      <div class="ai-report-kicker">${options.kicker || 'HR ПОМОЩНИК · EVIDENCE REPORT'}</div>
      <h2>${options.title || 'Итоговый аналитический отчёт'}</h2>
      <div class="ai-report-meta">
        <span>Источников: <strong>${sourceCount}</strong></span>
        <span>Использовано ID: <strong>${evidenceCount}</strong></span>
        <span>Сформирован: <strong>${generatedAt}</strong></span>
      </div>
    </section>
    ${qualityHtml(quality)}
    <section class="ai-report-body">${renderMarkdownSafe(text)}</section>`;
  updateResultsViewForTab('ai');
}

function excerptText(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '\n\n[...середина источника сокращена...]\n\n';
  const available = Math.max(0, limit - marker.length);
  const head = Math.floor(available * 0.65);
  const tail = Math.max(0, available - head);
  return `${text.slice(0, head)}${marker}${text.slice(-tail)}`;
}

function sourceId(item, index) {
  return item?.sourceId || `S${String(index + 1).padStart(3, '0')}`;
}

function buildContextForItems(items, useMarkdown, maxTotal) {
  const metadataReserve = Math.min(12_000, Math.floor(maxTotal * 0.25));
  const textBudget = Math.max(0, maxTotal - metadataReserve);
  const perItemMdLimit = items.length ? Math.max(350, Math.floor(textBudget / items.length)) : 0;
  let totalChars = 0;
  const blocks = [];

  items.forEach((it, index) => {
    const id = sourceId(it, index);
    let chunk = `### [${id}]\nЗаголовок: ${it.title || 'Без названия'}\nURL: ${it.url || it.sourceURL || '—'}\n`;
    if (it.searchKeyword) chunk += `Ключ: ${it.searchKeyword}\n`;
    if (it.description || it.snippet) chunk += `Описание: ${excerptText(it.description || it.snippet, 1200)}\n`;
    if (useMarkdown && (it.markdown || it.content)) {
      chunk += `\nТекст:\n${excerptText(it.markdown || it.content, perItemMdLimit)}\n`;
    }
    const remaining = maxTotal - totalChars;
    if (remaining <= 0) return;
    if (chunk.length > remaining) chunk = excerptText(chunk, remaining);
    if (chunk.trim()) {
      blocks.push(chunk);
      totalChars += chunk.length;
    }
  });

  return { text: blocks.join('\n---\n'), used: blocks.length, characters: totalChars };
}

function splitIntoBatches(items) {
  if (!items.length) return [];
  const batchCount = Math.min(MAX_BATCHES, items.length);
  const size = Math.ceil(items.length / batchCount);
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function analysisBrief() {
  const payload = getLastPayload();
  return payload?.meta?.researchBrief || document.getElementById('researchBrief').value.trim() || 'Анализ собранных материалов из интернета';
}

function analysisFocus() {
  return document.getElementById('aiFocus').value.trim();
}

function buildSourceRegister(items) {
  if (!items.length) return '';
  const rows = items.map((item, index) => {
    const id = sourceId(item, index);
    const title = String(item.title || 'Без названия').replace(/\n/g, ' ').trim();
    const url = item.url || item.sourceURL || '';
    return `- [${id}] ${title}${url ? ` - ${url}` : ''}`;
  });
  return `\n\n## Реестр источников\n${rows.join('\n')}`;
}

export function buildAiPrompt() {
  const items = getLastPayload()?.items || [];
  const brief = analysisBrief();
  const focus = analysisFocus();
  const useMd = document.getElementById('aiUseMarkdown').checked;
  const ctx = buildContextForItems(items, useMd, COPY_CONTEXT_CHARS);
  const keywords = [...new Set(items.map((i) => i.searchKeyword).filter(Boolean))];

  return {
    system: 'Ты аналитик открытых источников. Синтезируй материалы в доказательный отчёт. Существенные фактические утверждения сопровождай ссылками на идентификаторы источников вида [S001].',
    user: `Техническое задание анализа:\n${brief}\n\n${focus ? `Дополнительный фокус анализа:\n${focus}\n\n` : ''}Статистика сбора:\n- Всего источников: ${items.length}\n- Передано в этот промпт: ${ctx.used}\n- Объём контекста: ${ctx.characters} символов\n${keywords.length ? `- Ключевые запросы: ${keywords.slice(0, 20).join('; ')}${keywords.length > 20 ? '…' : ''}\n` : ''}\nМатериалы:\n${ctx.text}\n\nИнструкция:\n1. Следуй техническому заданию и фокусу.\n2. После каждого существенного факта указывай один или несколько source ID: [S001], [S002].\n3. Не придумывай source ID и не ссылайся на источник, которого нет в материалах.\n4. Отделяй факты от выводов и рекомендаций.\n5. Если данных действительно нет, пиши «нет данных».\n6. Ответ на русском, в корректном markdown.`
  };
}

export async function callOpenAiAnalysis(prompt, maxCompletionTokens = 4500) {
  const payload = {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    max_completion_tokens: maxCompletionTokens
  };

  const runtime = await getApiRuntime();
  if (runtime.managed) {
    const accessCode = getApiKey();
    if (!accessCode) throw new Error('Введите код доступа HR Помощник');
    const res = await fetch(`${runtime.base}/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessCode}` },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || extractApiError(json, res.status));
    return json.content || json.text || '';
  }

  saveOpenAiKey();
  const openaiKey = getOpenAiKey() || undefined;
  const directPayload = { openaiKey, model: 'gpt-5.6-sol', messages: payload.messages, max_completion_tokens: maxCompletionTokens };

  if (USE_LOCAL_PROXY) {
    const headers = { 'Content-Type': 'application/json' };
    if (openaiKey) headers.Authorization = `Bearer ${openaiKey}`;
    const res = await fetch(`${API_BASE}/api/ai/analyze`, { method: 'POST', headers, body: JSON.stringify(directPayload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || extractApiError(json, res.status));
    return json.content || json.text || '';
  }

  const apiKey = getOpenAiKey();
  if (!apiKey) throw new Error('Для direct-режима укажите OpenAI API key или включите managed service');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-5.6-sol', messages: payload.messages, reasoning_effort: 'none', max_completion_tokens: maxCompletionTokens })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || extractApiError(json, res.status));
  return json.choices?.[0]?.message?.content || '';
}

async function analyzeAllSources() {
  const items = getLastPayload()?.items || [];
  const useMd = document.getElementById('aiUseMarkdown').checked;
  const brief = analysisBrief();
  const focus = analysisFocus();
  const batches = splitIntoBatches(items);

  if (batches.length === 1) {
    const ctx = buildContextForItems(items, useMd, 115_000);
    const report = await callOpenAiAnalysis({
      system: 'Ты аналитик открытых источников. Подготовь доказательный отчёт. Каждый существенный факт снабжай source ID вида [S001].',
      user: `Задание:\n${brief}\n\n${focus ? `Фокус:\n${focus}\n\n` : ''}Материалы:\n${ctx.text}\n\nСформируй итоговый отчёт. Не выдумывай факты. Для фактических утверждений указывай только существующие [Sxxx]. Отделяй факты от выводов и рекомендаций.`
    }, 5000);
    return report + buildSourceRegister(items);
  }

  const partials = [];
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    setProgress('aiProgress', `AI-анализ пакета ${index + 1} из ${batches.length} (${batch.length} источников)…`);
    const ctx = buildContextForItems(batch, useMd, BATCH_CONTEXT_CHARS);
    const partial = await callOpenAiAnalysis({
      system: 'Ты аналитик открытых источников. Это промежуточный этап большого исследования. Сохраняй source ID рядом с каждым фактом.',
      user: `Общее задание:\n${brief}\n\n${focus ? `Фокус:\n${focus}\n\n` : ''}Это пакет ${index + 1} из ${batches.length}.\n\n${ctx.text}\n\nСделай компактную промежуточную сводку. Каждый существенный факт снабжай существующим [Sxxx]. Выдели противоречия и пробелы. Не пиши финальный отчёт.`
    }, 2200);
    partials.push(`## Пакет ${index + 1}\n${partial}`);
  }

  setProgress('aiProgress', `Финальный синтез ${items.length} источников…`);
  const report = await callOpenAiAnalysis({
    system: 'Ты ведущий аналитик. Синтезируй промежуточные результаты в доказательный отчёт и сохраняй source ID.',
    user: `Техническое задание:\n${brief}\n\n${focus ? `Дополнительный фокус:\n${focus}\n\n` : ''}Проанализировано источников: ${items.length}.\n\nПромежуточные результаты:\n${partials.join('\n\n---\n\n')}\n\nСформируй итоговый отчёт на русском в markdown. Убери дубли. Существенные факты должны иметь ссылки на [Sxxx]. Не придумывай новые ID. Раздели факты, паттерны, противоречия, пробелы, выводы и следующие шаги.`
  }, 5500);
  return report + buildSourceRegister(items);
}

export async function doAiAnalyze() {
  const lastPayload = getLastPayload();
  if (!lastPayload?.items?.length) {
    alert('Сначала выполните поиск, исследование или парсинг URL и соберите материалы');
    return;
  }
  const btn = document.getElementById('btnAiAnalyze');
  btn.disabled = true;
  hideError();

  runLoader('ai', async () => {
    try {
      setProgress('aiProgress', `Подготовка ${lastPayload.items.length} источников…`);
      const report = await analyzeAllSources();
      if (!report.trim()) throw new Error('ИИ вернул пустой ответ');
      clearReportVariants();
      renderAiReport(report);
      document.getElementById('tabAiBtn').click();
      showToast(`AI-анализ готов: обработано ${lastPayload.items.length} источников`);
    } catch (e) {
      showError(e.message || String(e));
      showToast('Ошибка AI-анализа - можно использовать «Скопировать промпт для ChatGPT»');
    } finally {
      hideLoader('ai');
      hideProgress('aiProgress');
      btn.disabled = false;
    }
  });
}

export async function copyAiPrompt() {
  if (!getLastPayload()?.items?.length) {
    showToast('Нет собранных материалов для анализа');
    return;
  }
  const prompt = buildAiPrompt();
  const full = `${prompt.system}\n\n---\n\n${prompt.user}`;
  try {
    await navigator.clipboard.writeText(full);
    showToast('Промпт скопирован - вставьте в ChatGPT');
  } catch {
    showToast('Не удалось скопировать');
  }
}
