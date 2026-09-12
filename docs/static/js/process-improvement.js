import { callOpenAiAnalysis, renderAiReport } from './ai.js';
import { firecrawlRequest } from './api.js';
import { MAX_SEARCH_QUERY } from './config.js';
import { runResearchQualityAudit } from './research-quality-suite.js';
import { normalizeItems, renderResults } from './results.js';
import { setLastPayload } from './state.js';
import { getApiKey } from './storage.js';
import { retryDelayMs, shouldRetryRateLimit, waitSeconds } from './retry-policy.js';
import { refreshUsageQuietly } from './usage.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SEARCH_LIMIT = 5;
const MAX_SEARCH_QUERIES = 12;
const SOURCE_CONTEXT_LIMIT = 112_000;

let installed = false;
let running = false;

function el(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function excerpt(value, limit) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const marker = '\n[…сокращено…]\n';
  const available = Math.max(0, limit - marker.length);
  const head = Math.floor(available * 0.7);
  return text.slice(0, head) + marker + text.slice(-(available - head));
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('ИИ не вернул план анализа процесса в ожидаемом формате');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(value || '').trim().toLowerCase();
  }
}

function fallbackQueries(processName, geography) {
  const name = processName || 'HR process';
  const world = [
    `${name} HR process best practices`,
    `${name} HR workflow automation benchmark`,
    `${name} HR process redesign case study`,
    `${name} RPA AI process improvement HR`,
  ];
  const ru = [
    `${name} лучшие практики HR процесс`,
    `${name} автоматизация HR кейс`,
    `${name} оптимизация процесса HR`,
    `${name} роботизация RPA HR`,
  ];
  if (geography === 'world') return world;
  if (geography === 'russia') return ru;
  return [...ru, ...world];
}

function buildProcessBrief(input) {
  return [
    `Аудит и улучшение HR-процесса: ${input.processName}.`,
    `Текущий процесс AS-IS: ${input.asIs}`,
    input.problems ? `Известные проблемы: ${input.problems}` : '',
    input.goals ? `Цели улучшения: ${input.goals}` : '',
    input.scale ? `Масштаб процесса: ${input.scale}` : '',
    `География практик: ${input.geographyLabel}.`,
    'Нужно исследовать практики, проверить доказательства и предложить целевой TO-BE процесс с выбором подходящих инструментов улучшения.',
  ].filter(Boolean).join('\n');
}

async function makeProcessPlan(input) {
  const raw = await callOpenAiAnalysis({
    system: 'Ты ведущий аналитик HR-процессов и Process Excellence. Верни только JSON. Анализируй процесс до автоматизации: сначала устраняй лишние шаги и потери, затем выбирай технологию.',
    user: `Проанализируй текущий HR-процесс и подготовь план исследования лучших практик.\n\nНазвание процесса:\n${input.processName}\n\nAS-IS от пользователя:\n${input.asIs}\n\nИзвестные проблемы:\n${input.problems || 'Не указаны'}\n\nЦели:\n${input.goals || 'Не указаны'}\n\nМасштаб:\n${input.scale || 'Не указан'}\n\nГеография практик:\n${input.geographyLabel}\n\nВерни JSON строго такой структуры:\n{\n  "process_summary":"краткое понимание процесса",\n  "asis_steps":[{"step":1,"name":"шаг","role":"роль","system":"система/канал","input":"вход","output":"выход","problem":"проблема или пусто"}],\n  "sipoc":{"suppliers":[],"inputs":[],"process":[],"outputs":[],"customers":[]},\n  "muda":[{"type":"waiting|overprocessing|defects|motion|transport|inventory|overproduction|unused_talent","where":"где","why":"почему это потеря"}],\n  "risks":[{"risk":"риск","impact":"high|medium|low"}],\n  "research_questions":["6-12 конкретных вопросов, которые надо проверить во внешних источниках"],\n  "search_queries":["8-12 поисковых запросов"],\n  "tool_hypotheses":[{"problem":"проблема","candidate":"process_redesign|workflow|integration_api|rpa|ai_agent|process_mining|digital_twin|bpmn|lean_muda|five_whys|sipoc|raci|vsm|pareto","reason":"зачем"}],\n  "maturity_initial":{"standardization":0,"automation":0,"integration":0,"sla_control":0,"measurement":0,"ai_usage":0}\n}\n\nТребования к search_queries:\n- если география включает мир, минимум 4 запроса должны быть на английском;\n- искать не общие советы, а кейсы, benchmarks, measurable outcomes, process design, automation, RPA, AI, workflow, integration;\n- включить поиск практик крупных компаний и профессиональных/исследовательских источников;\n- не придумывать факты о текущем процессе, которых пользователь не сообщил.`
  }, 3200);
  const plan = extractJson(raw);
  plan.search_queries = Array.isArray(plan.search_queries) ? plan.search_queries.map((x) => String(x || '').trim()).filter(Boolean).slice(0, MAX_SEARCH_QUERIES) : [];
  plan.research_questions = Array.isArray(plan.research_questions) ? plan.research_questions.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12) : [];
  return plan;
}

async function searchOne(query, index, total) {
  let attempt = 0;
  while (true) {
    try {
      return await firecrawlRequest('search', {
        query: query.slice(0, MAX_SEARCH_QUERY),
        limit: SEARCH_LIMIT,
        scrape: true,
        sources: ['web'],
      });
    } catch (error) {
      if (!shouldRetryRateLimit(error, attempt, 4)) throw error;
      const delay = retryDelayMs(error, attempt);
      attempt += 1;
      setProcessStatus(`Поисковый сервис ограничил частоту. Ждём ${waitSeconds(delay)} сек., затем продолжим запрос ${index + 1} из ${total}.`);
      await sleep(delay);
    }
  }
}

async function collectPractices(plan, input) {
  const planned = Array.isArray(plan.search_queries) ? plan.search_queries : [];
  const queries = [...new Set([...planned, ...fallbackQueries(input.processName, input.geography)].map((x) => String(x || '').trim()).filter(Boolean))].slice(0, MAX_SEARCH_QUERIES);
  const items = [];
  const seen = new Set();
  let failures = 0;

  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    setProcessStatus(`Ищем практики и кейсы: запрос ${index + 1} из ${queries.length} - «${query.slice(0, 70)}»`);
    try {
      const json = await searchOne(query, index, queries.length);
      for (const raw of normalizeItems(json.data)) {
        const key = normalizeUrl(raw.url || raw.sourceURL);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({
          ...raw,
          sourceId: `S${String(items.length + 1).padStart(3, '0')}`,
          searchKeyword: query,
        });
      }
    } catch (error) {
      failures += 1;
      console.warn('Process practice search failed:', query, error);
    }
    if (index < queries.length - 1) await sleep(350);
  }

  return { items, queries, failures };
}

function buildSourceContext(items) {
  if (!items.length) return '';
  const perSource = Math.max(800, Math.min(3500, Math.floor(SOURCE_CONTEXT_LIMIT / items.length)));
  let used = 0;
  const blocks = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const id = item.sourceId || `S${String(index + 1).padStart(3, '0')}`;
    const text = item.markdown || item.content || item.description || item.snippet || '';
    let block = `### [${id}]\nЗаголовок: ${item.title || 'Без названия'}\nURL: ${item.url || item.sourceURL || '—'}\nПоисковый запрос: ${item.searchKeyword || '—'}\nМатериал:\n${excerpt(text, perSource)}`;
    const remaining = SOURCE_CONTEXT_LIMIT - used;
    if (remaining <= 0) break;
    if (block.length > remaining) block = excerpt(block, remaining);
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n\n---\n\n');
}

function buildSourceRegister(items) {
  return `\n\n## Реестр источников\n${items.map((item, index) => {
    const id = item.sourceId || `S${String(index + 1).padStart(3, '0')}`;
    const title = String(item.title || 'Без названия').replace(/\n/g, ' ').trim();
    const url = item.url || item.sourceURL || '';
    return `- [${id}] ${title}${url ? ` - ${url}` : ''}`;
  }).join('\n')}`;
}

async function buildImprovementReport(plan, input, items) {
  const sourceContext = buildSourceContext(items);
  const processData = JSON.stringify({
    process_summary: plan.process_summary || '',
    asis_steps: plan.asis_steps || [],
    sipoc: plan.sipoc || {},
    muda: plan.muda || [],
    risks: plan.risks || [],
    research_questions: plan.research_questions || [],
    tool_hypotheses: plan.tool_hypotheses || [],
    maturity_initial: plan.maturity_initial || {},
  });

  const report = await callOpenAiAnalysis({
    system: 'Ты ведущий консультант по HR Process Excellence, Lean, BPM и цифровой трансформации. Проектируй улучшение процесса, а не просто список технологий. Факты о внешних практиках подтверждай только существующими Source ID.',
    user: `Подготовь итоговый аудит и проект улучшения HR-процесса.\n\nДАННЫЕ ПОЛЬЗОВАТЕЛЯ\nПроцесс: ${input.processName}\nAS-IS: ${input.asIs}\nПроблемы: ${input.problems || 'не указаны'}\nЦели: ${input.goals || 'не указаны'}\nМасштаб: ${input.scale || 'не указан'}\nГеография benchmark: ${input.geographyLabel}\n\nПРЕДВАРИТЕЛЬНЫЙ ПРОЦЕССНЫЙ АНАЛИЗ\n${processData}\n\nВНЕШНИЕ ИСТОЧНИКИ И ПРАКТИКИ\n${sourceContext}\n\nСформируй подробный отчёт на русском языке со следующими разделами:\n# Аудит и улучшение HR-процесса: ${input.processName}\n## 1. Резюме для руководителя\n## 2. Как процесс работает сейчас - AS-IS\nСделай таблицу: шаг, роль, действие, система/канал, вход, выход, проблема. Данные пользователя не выдавай за внешние факты.\n## 3. SIPOC\n## 4. Потери Muda и узкие места\nДля каждой потери укажи тип, место, последствие и приоритет.\n## 5. Риски и первопричины\nПрименяй 5 Why там, где это уместно, но явно отмечай гипотезы, если данных недостаточно.\n## 6. Что делают другие компании и лучшие практики\nКаждый внешний факт или кейс подтверждай [Sxxx]. Разделяй мировые и российские практики, если это возможно по источникам.\n## 7. Gap Analysis: AS-IS против практик\n## 8. Что убрать, упростить, объединить и стандартизировать\nСначала меняй сам процесс, затем автоматизируй.\n## 9. Матрица решений по инструментам\nТаблица: проблема/шаг | решение | инструмент | почему этот инструмент | сложность | ожидаемый эффект | приоритет.\nВыбирай только обоснованные инструменты из: изменение процесса, Lean/Muda, 5 Why, SIPOC, RACI, VSM, Pareto, BPMN, Workflow, интеграция/API, RPA/робот, AI/AI-agent, Process Mining, цифровой двойник/симуляция.\nОбязательно объясняй, почему робот/AI/цифровой двойник подходит или не подходит. Не предлагай AI там, где достаточно правила, интеграции или удаления шага.\n## 10. Целевой процесс TO-BE\nТаблица: шаг, роль, действие, система/автоматизация, контроль, результат.\n## 11. RACI для TO-BE\n## 12. KPI и контроль процесса\nВключи время цикла, SLA, количество ручных касаний, переделки/ошибки, стоимость операции и релевантные HR-KPI.\n## 13. Оценка зрелости процесса\nОцени 0-100: стандартизация, автоматизация, интеграция, контроль SLA, измеримость, использование AI. Отдельно укажи текущую и целевую зрелость.\n## 14. Quick Wins\nЧто можно сделать за 2-6 недель без большой ИТ-разработки.\n## 15. Дорожная карта внедрения\nЭтапы 0-30, 31-90, 91-180 дней.\n## 16. Ожидаемый эффект и как его проверить\nНе придумывай экономию. Если исходных цифр нет, дай формулу расчёта и список данных, которые надо замерить.\n## 17. Что не удалось подтвердить\n\nПравила:\n- внешние факты, benchmarks, цифры и утверждения о компаниях сопровождай [Sxxx];\n- не выдумывай Source ID;\n- отделяй ФАКТ, ИНТЕРПРЕТАЦИЮ и РЕКОМЕНДАЦИЮ;\n- если источники противоречат, покажи расхождение;\n- не роботизируй лишний шаг: порядок решения - убрать → упростить → объединить → стандартизировать → интегрировать → автоматизировать → RPA → AI;\n- отчёт должен быть пригоден для обсуждения с владельцем HR-процесса и ИТ-командой.`
  }, 6000);
  return String(report || '').split(/\n##\s+Реестр источников\b/i)[0].trim() + buildSourceRegister(items);
}

function inputValues() {
  const geography = el('processGeography')?.value || 'both';
  const labels = {
    both: 'Россия и мировой рынок',
    russia: 'Россия',
    world: 'мировой рынок',
  };
  return {
    processName: el('processName')?.value?.trim() || '',
    asIs: el('processAsIs')?.value?.trim() || '',
    problems: el('processProblems')?.value?.trim() || '',
    goals: el('processGoals')?.value?.trim() || '',
    scale: el('processScale')?.value?.trim() || '',
    geography,
    geographyLabel: labels[geography] || labels.both,
  };
}

function setProcessStatus(text, progress = null) {
  const status = el('processImprovementStatus');
  if (status) status.textContent = text || '';
  const bar = el('processImprovementBar');
  if (bar && Number.isFinite(progress)) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function closeDialog() {
  if (running) return;
  el('processImprovementOverlay')?.classList.remove('visible');
}

function openDialog() {
  if (!getApiKey()) {
    el('friendlyAccessState') && (el('friendlyAccessState').textContent = 'Сначала войдите по персональному коду HRP.');
    el('apiKey')?.focus();
    el('friendlyAccess')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  el('processImprovementOverlay')?.classList.add('visible');
}

function showResultWorkspace(processName) {
  el('processImprovementOverlay')?.classList.remove('visible');
  document.body.classList.add('workspace-open');
  const title = el('friendlyWorkspaceTitle');
  const subtitle = el('friendlyWorkspaceSubtitle');
  if (title) title.textContent = 'Аудит и улучшение HR-процесса';
  if (subtitle) subtitle.textContent = processName ? `Процесс: ${processName}. AS-IS, лучшие практики и целевой TO-BE.` : 'AS-IS, лучшие практики и целевой TO-BE.';
  el('tabAiBtn')?.click();
  el('friendlyWorkspaceHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runProcessImprovement() {
  if (running) return;
  const input = inputValues();
  if (!input.processName) {
    setProcessStatus('Укажите название HR-процесса.');
    el('processName')?.focus();
    return;
  }
  if (input.asIs.length < 80) {
    setProcessStatus('Опишите текущий процесс подробнее: роли, шаги, системы, согласования и проблемные места. Желательно не менее нескольких предложений.');
    el('processAsIs')?.focus();
    return;
  }

  running = true;
  const button = el('btnRunProcessImprovement');
  if (button) {
    button.disabled = true;
    button.textContent = 'Проводим аудит…';
  }

  try {
    setProcessStatus('1/4. Разбираем текущий процесс AS-IS, роли, потери и риски…', 12);
    const plan = await makeProcessPlan(input);

    setProcessStatus('2/4. Ищем российские и мировые практики, кейсы и инструменты улучшения…', 32);
    const collected = await collectPractices(plan, input);
    if (!collected.items.length) throw new Error('Не удалось собрать внешние источники для сравнения. Повторите исследование позже или измените описание процесса.');

    const brief = buildProcessBrief(input);
    const meta = {
      mode: 'process-improvement',
      researchBrief: brief,
      researchQueries: collected.queries,
      queriesRun: collected.queries.length - collected.failures,
      errors: collected.failures,
      processName: input.processName,
      processAsIs: input.asIs,
      processProblems: input.problems,
      processGoals: input.goals,
      processScale: input.scale,
      processGeography: input.geography,
      processGeographyLabel: input.geographyLabel,
      processResearchQuestions: plan.research_questions || [],
      processPlanSummary: plan.process_summary || '',
      scrape: true,
    };

    setLastPayload({ title: `Практики для улучшения процесса: ${input.processName}`, items: collected.items, meta });
    renderResults(`Практики для улучшения процесса: ${input.processName}`, collected.items, meta);

    setProcessStatus(`3/4. Найдено ${collected.items.length} источников. Проектируем TO-BE и выбираем инструменты…`, 63);
    const report = await buildImprovementReport(plan, input, collected.items);
    renderAiReport(report, {
      resultsTitle: 'Аудит и улучшение HR-процесса',
      kicker: 'HR ПОМОЩНИК · PROCESS EXCELLENCE',
      title: `Аудит и целевой TO-BE: ${input.processName}`,
    });

    showResultWorkspace(input.processName);
    setProcessStatus('4/4. Проверяем полноту, источники, факты и недостающие доказательства…', 82);
    await runResearchQualityAudit(report, true);
    setProcessStatus('Готово. Аудит процесса, benchmark практик, TO-BE и проверка качества сформированы.', 100);
    await refreshUsageQuietly();
  } catch (error) {
    console.error('Process improvement failed:', error);
    setProcessStatus(`Не удалось завершить аудит: ${error.message || error}`);
  } finally {
    running = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Исследовать и улучшить процесс';
    }
  }
}

function buildDialog() {
  const overlay = document.createElement('div');
  overlay.id = 'processImprovementOverlay';
  overlay.className = 'process-improvement-overlay';
  overlay.innerHTML = `
    <section class="process-improvement-dialog" role="dialog" aria-modal="true" aria-labelledby="processImprovementTitle">
      <div class="process-improvement-head">
        <div>
          <div class="friendly-kicker">HR PROCESS EXCELLENCE</div>
          <h2 id="processImprovementTitle">Аудит и улучшение HR-процесса</h2>
          <p>Опишите, как процесс работает сейчас. Помощник найдёт потери, исследует практики в России и мире, подберёт инструменты и спроектирует TO-BE.</p>
        </div>
        <button type="button" class="btn-sm" id="btnCloseProcessImprovement">Закрыть</button>
      </div>
      <div class="process-improvement-form">
        <label class="process-field"><span>1. Какой процесс улучшаем?</span><input id="processName" type="text" placeholder="Например: увольнение сотрудника, адаптация новичка, подбор персонала"></label>
        <label class="process-field"><span>2. Как он работает сейчас - AS-IS?</span><textarea id="processAsIs" rows="9" placeholder="Опишите шаги по порядку: кто инициирует процесс, кто участвует, какие документы и системы используются, где согласования, ожидания, ручной ввод и передача данных."></textarea></label>
        <div class="process-two-cols">
          <label class="process-field"><span>Что сейчас не устраивает?</span><textarea id="processProblems" rows="4" placeholder="Долгое согласование, двойной ввод, ошибки, Excel, письма, нет контроля SLA…"></textarea></label>
          <label class="process-field"><span>Какой результат нужен?</span><textarea id="processGoals" rows="4" placeholder="Сократить срок, убрать ручной ввод, повысить контроль, снизить ошибки…"></textarea></label>
        </div>
        <div class="process-two-cols">
          <label class="process-field"><span>Масштаб процесса</span><input id="processScale" type="text" placeholder="Например: 8 000 сотрудников, 250 увольнений в месяц"></label>
          <label class="process-field"><span>Где искать практики?</span><select id="processGeography"><option value="both">Россия и мир</option><option value="russia">Россия</option><option value="world">Мировой рынок</option></select></label>
        </div>
        <details class="process-methods">
          <summary>Какие методы и инструменты будет оценивать помощник</summary>
          <div class="process-method-grid">
            <span>Lean / Muda</span><span>5 Why</span><span>SIPOC</span><span>RACI</span><span>VSM</span><span>Pareto</span><span>BPMN</span><span>Workflow</span><span>Интеграция / API</span><span>RPA / робот</span><span>AI / AI-agent</span><span>Process Mining</span><span>Цифровой двойник / симуляция</span>
          </div>
          <p>Правило выбора: сначала убрать лишнее и упростить процесс, затем интегрировать и автоматизировать. Робот и AI рекомендуются только там, где они действительно нужны.</p>
        </details>
        <div class="process-progress"><span id="processImprovementBar"></span></div>
        <p class="process-status" id="processImprovementStatus">Готов к анализу.</p>
        <button type="button" class="btn-run process-run" id="btnRunProcessImprovement">Исследовать и улучшить процесс</button>
      </div>
    </section>`;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog();
  });
  document.body.append(overlay);
  el('btnCloseProcessImprovement')?.addEventListener('click', closeDialog);
  el('btnRunProcessImprovement')?.addEventListener('click', runProcessImprovement);
}

function installHomeCard() {
  const grid = document.querySelector('.friendly-task-grid');
  if (!grid || el('friendlyProcessImprovement')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'friendlyProcessImprovement';
  button.className = 'friendly-task-card friendly-process-card';
  button.innerHTML = `
    <span class="friendly-task-icon">↻</span>
    <span><strong>Улучшить HR-процесс</strong><small>Разобрать AS-IS, найти лучшие практики, выбрать инструменты и спроектировать TO-BE.</small></span>
    <span class="friendly-arrow">→</span>`;
  button.addEventListener('click', openDialog);
  grid.append(button);
}

export function installProcessImprovement() {
  if (installed) return;
  installed = true;
  buildDialog();
  installHomeCard();
}
