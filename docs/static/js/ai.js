import { API_BASE, USE_LOCAL_PROXY } from './config.js';
import { extractApiError } from './api.js';
import { getLastPayload, setLastAiReport } from './state.js';
import { getOpenAiKey, saveOpenAiKey } from './storage.js';
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

  const userPrompt = `Техническое задание исследования:
${brief}

${focus ? `Дополнительный фокус анализа:\n${focus}\n\n` : ''}Статистика сбора:
- Всего источников: ${ctx.total}
- Передано в анализ: ${ctx.used}
${keywords.length ? `- Ключевые запросы: ${keywords.slice(0, 15).join('; ')}${keywords.length > 15 ? '…' : ''}\n` : ''}
Материалы (заголовок, URL, фрагмент текста):
${ctx.text}

Инструкция:
1. Прочитай техническое задание — именно оно задаёт тему, цели и нужную структуру отчёта (HR, рынок, продукт, право и т.д.).
2. Если в задании уже перечислены разделы, таблицы, KPI или вопросы — используй их как оглавление отчёта.
3. Если структура не задана — предложи универсальную:
   - краткая сводка;
   - ключевые находки с URL;
   - паттерны и противоречия;
   - пробелы в данных;
   - рекомендации и следующие шаги.
4. Опирайся только на переданные материалы. Не выдумывай факты.
5. Если данных нет — пиши «нет данных». Отделяй факты от планов и заявлений.
6. Ответ — на русском, в markdown.`;

  return {
    system:
      'Ты аналитик открытых источников. Синтезируй материалы в отчёт строго по целям технического задания пользователя, без привязки к конкретной отрасли.',
    user: userPrompt
  };
}

async function callOpenAiAnalysis(prompt) {
  saveOpenAiKey();
  const openaiKey = getOpenAiKey() || undefined;
  const payload = {
    openaiKey,
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]
  };

  if (USE_LOCAL_PROXY) {
    const headers = { 'Content-Type': 'application/json' };
    if (openaiKey) headers.Authorization = `Bearer ${openaiKey}`;
    const res = await fetch(`${API_BASE}/api/ai/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || extractApiError(json, res.status));
    return json.content || json.text || '';
  }

  const apiKey = getOpenAiKey();
  if (!apiKey) {
    throw new Error(
      'Укажите ключ OpenAI (sk-…) или запустите python server.py с OPENAI_API_KEY'
    );
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      temperature: 0.3
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || extractApiError(json, res.status));
  return json.choices?.[0]?.message?.content || '';
}

export async function doAiAnalyze() {
  const lastPayload = getLastPayload();
  if (!lastPayload?.items?.length || lastPayload.meta?.mode !== 'research') {
    alert('Сначала выполните исследование и соберите ссылки');
    return;
  }

  const btn = document.getElementById('btnAiAnalyze');
  btn.disabled = true;
  hideError();

  runLoader('ai', async () => {
    try {
      setProgress('aiProgress', 'Формирование промпта…');
      const prompt = buildAiPrompt();
      setProgress('aiProgress', 'Отправка в GPT-4o-mini…');
      const report = await callOpenAiAnalysis(prompt);
      if (!report.trim()) throw new Error('ИИ вернул пустой ответ');
      renderAiReport(report);
      document.getElementById('tabAiBtn').click();
      showToast('AI-анализ готов');
    } catch (e) {
      showError(e.message || String(e));
      showToast('Ошибка AI-анализа — попробуйте «Скопировать промпт для ChatGPT»');
    } finally {
      hideLoader('ai');
      hideProgress('aiProgress');
      btn.disabled = false;
    }
  });
}

export async function copyAiPrompt() {
  if (!getLastPayload()?.items?.length) {
    showToast('Нет данных исследования');
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
