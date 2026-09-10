import { API_BASE, USE_LOCAL_PROXY, getApiRuntime } from './config.js';
import { extractApiError } from './api.js';
import { getLastPayload, setLastAiReport } from './state.js';
import { getApiKey, getOpenAiKey, saveOpenAiKey } from './storage.js';
import { esc, hideError, hideLoader, hideProgress, runLoader, setProgress, showError, showToast } from './ui.js';
import { updateResultsViewForTab } from './results.js';

function simpleMdToHtml(md) {
  return esc(md)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

function renderAiReport(text) {
  setLastAiReport(text);
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('resultsArea').style.display = 'block';
  document.getElementById('resultsTitle').textContent = 'AI-анализ и рекомендации';
  document.getElementById('aiResultsArea').innerHTML = simpleMdToHtml(text);
  updateResultsViewForTab('ai');
}

function buildResearchContextForAi(useMarkdown) {
  const items = getLastPayload()?.items || [];
  const maxItems = 30;
  const mdLimit = 900;
  let total = 0;
  const maxTotal = 14000;
  const blocks = [];

  for (const it of items.slice(0, maxItems)) {
    let chunk = `### ${it.title || 'Без названия'}\nURL: ${it.url || it.sourceURL || '—'}\n`;
    if (it.searchKeyword) chunk += `Ключ: ${it.searchKeyword}\n`;
    if (it.description || it.snippet) {
      chunk += `Описание: ${it.description || it.snippet}\n`;
    }
    if (useMarkdown && (it.markdown || it.content)) {
      chunk += `\nТекст:\n${String(it.markdown || it.content).slice(0, mdLimit)}\n`;
    }
    if (total + chunk.length > maxTotal) break;
    blocks.push(chunk);
    total += chunk.length;
  }

  return {
    text: blocks.join('\n---\n'),
    used: blocks.length,
    total: items.length
  };
}

export function buildAiPrompt() {
  const lastPayload = getLastPayload();
  const brief =
    lastPayload?.meta?.researchBrief ||
    document.getElementById('researchBrief').value.trim() ||
    'Анализ собранных материалов из интернета';
  const focus = document.getElementById('aiFocus').value.trim();
  const useMd = document.getElementById('aiUseMarkdown').checked;
  const ctx = buildResearchContextForAi(useMd);
  const keywords = [
    ...new Set((lastPayload?.items || []).map((i) => i.searchKeyword).filter(Boolean))
  ];

  const userPrompt = `Техническое задание анализа:\n${brief}\n\n${focus ? `Дополнительный фокус анализа:\n${focus}\n\n` : ''}Статистика сбора:\n- Всего источников: ${ctx.total}\n- Передано в анализ: ${ctx.used}\n${keywords.length ? `- Ключевые запросы: ${keywords.slice(0, 15).join('; ')}${keywords.length > 15 ? '…' : ''}\n` : ''}\nМатериалы (заголовок, URL, фрагмент текста):\n${ctx.text}\n\nИнструкция:\n1. Прочитай техническое задание и дополнительный фокус — они задают тему, цели и нужную структуру отчёта.\n2. Если в задании уже перечислены разделы, таблицы, KPI или вопросы — используй их как оглавление отчёта.\n3. Если структура не задана — предложи универсальную:\n   - краткая сводка;\n   - ключевые находки с URL;\n   - паттерны и противоречия;\n   - пробелы в данных;\n   - рекомендации и следующие шаги.\n4. Опирайся только на переданные материалы. Не выдумывай факты.\n5. Если данных нет — пиши «нет данных». Отделяй факты от планов и заявлений.\n6. Ответ — на русском, в markdown.`;

  return {
    system:
      'Ты аналитик открытых источников. Синтезируй переданные материалы в отчёт строго по целям пользователя, без привязки к конкретной отрасли.',
    user: userPrompt
  };
}

async function callOpenAiAnalysis(prompt) {
  const payload = {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    max_completion_tokens: 2200
  };

  const runtime = await getApiRuntime();
  if (runtime.managed) {
    const accessCode = getApiKey();
    if (!accessCode) throw new Error('Введите код доступа HR Помощник');
    const res = await fetch(`${runtime.base}/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessCode}`
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || extractApiError(json, res.status));
    return json.content || json.text || '';
  }

  saveOpenAiKey();
  const openaiKey = getOpenAiKey() || undefined;
  const directPayload = {
    openaiKey,
    model: 'gpt-5.6-sol',
    messages: payload.messages
  };

  if (USE_LOCAL_PROXY) {
    const headers = { 'Content-Type': 'application/json' };
    if (openaiKey) headers.Authorization = `Bearer ${openaiKey}`;
    const res = await fetch(`${API_BASE}/api/ai/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(directPayload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || extractApiError(json, res.status));
    return json.content || json.text || '';
  }

  const apiKey = getOpenAiKey();
  if (!apiKey) {
    throw new Error('Для direct-режима укажите OpenAI API key или включите managed service');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.6-sol',
      messages: payload.messages,
      reasoning_effort: 'none',
      max_completion_tokens: 2200
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || extractApiError(json, res.status));
  return json.choices?.[0]?.message?.content || '';
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
      setProgress('aiProgress', 'Формирование промпта…');
      const prompt = buildAiPrompt();
      setProgress('aiProgress', 'Отправка в ИИ…');
      const report = await callOpenAiAnalysis(prompt);
      if (!report.trim()) throw new Error('ИИ вернул пустой ответ');
      renderAiReport(report);
      document.getElementById('tabAiBtn').click();
      showToast('AI-анализ готов');
    } catch (e) {
      showError(e.message || String(e));
      showToast('Ошибка AI-анализа — можно использовать «Скопировать промпт для ChatGPT»');
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
    showToast('Промпт скопирован — вставьте в ChatGPT');
  } catch {
    showToast('Не удалось скопировать');
  }
}
