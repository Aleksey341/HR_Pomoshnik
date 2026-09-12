import { callOpenAiAnalysis, buildAiPrompt, renderAiReport } from './ai.js';
import { firecrawlRequest } from './api.js';
import { MAX_SEARCH_QUERY } from './config.js';
import { calculateEvidenceScore } from './quality.js';
import { buildDateTbs } from './research-brief.js';
import { computeResearchQuality, sanitizeResearchAudit, sourceTypeSummary } from './research-quality.js';
import { normalizeItems, renderResults } from './results.js';
import { getLastAiReport, getLastPayload, getLastQuality, setLastPayload, setLastQuality } from './state.js';
import { classifyApiFailure, retryDelayMs, shouldRetryRateLimit, waitSeconds } from './retry-policy.js';
import { hideProgress, setProgress, showToast } from './ui.js';

const AUTO_GAP_QUERIES = 4;
const MANUAL_GAP_QUERIES = 6;
const GAP_RESULTS_PER_QUERY = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let installed = false;
let auditRequested = false;
let running = false;
let lastProcessedReport = '';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sourceId(item, index) {
  return String(item?.sourceId || `S${String(index + 1).padStart(3, '0')}`);
}

function stripSourceRegister(report) {
  return String(report || '').split(/\n##\s+Реестр источников\b/i)[0].trim();
}

function buildSourceRegister(items) {
  if (!items?.length) return '';
  const rows = items.map((item, index) => {
    const id = sourceId(item, index);
    const title = String(item.title || 'Без названия').replace(/\n/g, ' ').trim();
    const url = item.url || item.sourceURL || '';
    return `- [${id}] ${title}${url ? ` - ${url}` : ''}`;
  });
  return `\n\n## Реестр источников\n${rows.join('\n')}`;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('ИИ не вернул JSON проверки исследования');
  return JSON.parse(candidate.slice(start, end + 1));
}

function excerpt(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '\n[…сокращено…]\n';
  const available = Math.max(0, limit - marker.length);
  const head = Math.floor(available * 0.7);
  return text.slice(0, head) + marker + text.slice(-(available - head));
}

function compactSourceContext(items, report) {
  const cited = new Set([...String(report || '').matchAll(/\[(S\d{3,})\]/g)].map((match) => match[1]));
  const prioritized = [];
  const rest = [];
  items.forEach((item, index) => {
    const row = { item, index, id: sourceId(item, index) };
    (cited.has(row.id) ? prioritized : rest).push(row);
  });
  const chosen = [...prioritized, ...rest].slice(0, 32);
  return chosen.map(({ item, id }) => {
    const body = item.markdown || item.content || item.description || item.snippet || '';
    return `### [${id}]\nЗаголовок: ${item.title || 'Без названия'}\nURL: ${item.url || item.sourceURL || '—'}\nДата: ${item.publishedDate || item.published_at || item.date || 'не указана'}\nТекст/описание:\n${excerpt(body, 1800)}`;
  }).join('\n\n---\n\n');
}

async function auditReport(report, payload) {
  const items = payload?.items || [];
  const brief = payload?.meta?.researchBrief || document.getElementById('researchBrief')?.value?.trim() || '';
  const sourceContext = compactSourceContext(items, report);
  const processMode = payload?.meta?.mode === 'process-improvement';
  const raw = await callOpenAiAnalysis({
    system: 'Ты независимый аудитор доказательных исследований. Проверяй отчёт только по переданным источникам. Верни только JSON без markdown.',
    user: `Проверь точность и полноту ${processMode ? 'исследования и аудита HR-процесса' : 'HR-исследования'}.\n\nИсходная задача:\n${brief || 'Не указана'}\n\nОтчёт:\n${stripSourceRegister(report)}\n\nИсточники для проверки:\n${sourceContext}\n\nВерни JSON строго этой структуры:\n{\n  "coverage": [{"id":"Q01","question":"исследовательский вопрос","status":"covered|partial|missing","source_ids":["S001"],"note":"пояснение"}],\n  "claims": [{"claim":"существенный тезис или цифра","status":"confirmed|partial|unsupported|conflict","numeric":true,"source_ids":["S001"],"note":"что подтверждает или не подтверждает"}],\n  "contradictions": [{"topic":"тема расхождения","source_ids":["S001","S002"],"note":"в чём расходятся данные"}],\n  "missing_queries": ["поисковый запрос для закрытия конкретного пробела"],\n  "source_assessment": [{"source_id":"S001","type":"official|corporate|research|labour_market|professional_research|media|social|other","label":"понятный тип источника","reliability":0,"primary":0,"note":"краткая оценка"}]\n}\n\nПравила:\n1. Выдели 6-12 исследовательских вопросов из задачи и проверь покрытие каждого.\n2. Проверь все существенные числовые утверждения и до 25 наиболее важных фактических тезисов.\n3. Ставь confirmed только когда источник прямо подтверждает утверждение.\n4. Не считай интерпретацию доказанным фактом.\n5. Если источники противоречат друг другу, фиксируй conflict и contradiction.\n6. Для partial/missing сформируй конкретные поисковые запросы, максимум 6.\n7. Оцени надёжность и первичность источников от 0 до 100.\n8. Не придумывай Source ID.\n${processMode ? '9. Описание AS-IS, сообщённое пользователем, не требует внешнего Source ID. Проверяй источниками только внешние практики, benchmarks и фактические утверждения о других компаниях.' : ''}`
  }, 3600);
  return sanitizeResearchAudit(extractJson(raw), payload);
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

async function gapSearchRequest(body, label, index, total) {
  let attempt = 0;
  while (true) {
    try {
      return await firecrawlRequest('search', body);
    } catch (error) {
      if (!shouldRetryRateLimit(error, attempt, 4)) throw error;
      const delay = retryDelayMs(error, attempt);
      attempt += 1;
      setProgress('aiProgress', `Лимит поиска. Ждём ${waitSeconds(delay)} сек. перед повтором ${index + 1} из ${total}: «${label.slice(0, 60)}»…`);
      await sleep(delay);
    }
  }
}

async function findMissingEvidence(queries, maxQueries = AUTO_GAP_QUERIES) {
  const payload = getLastPayload();
  if (!payload?.items?.length || !queries?.length) return { added: 0, failures: 0 };
  const selected = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, maxQueries);
  if (!selected.length) return { added: 0, failures: 0 };

  const items = [...payload.items];
  const seen = new Set(items.map((item) => normalizeUrl(item.url || item.sourceURL)).filter(Boolean));
  let added = 0;
  let failures = 0;
  const dateFrom = payload.meta?.dateFrom || '';
  const processMode = payload.meta?.mode === 'process-improvement';

  for (let index = 0; index < selected.length; index++) {
    const query = selected[index];
    setProgress('aiProgress', `Ищем недостающие доказательства ${index + 1} из ${selected.length}: «${query.slice(0, 65)}»…`);
    try {
      const body = {
        query: query.slice(0, MAX_SEARCH_QUERY),
        limit: GAP_RESULTS_PER_QUERY,
        scrape: true,
        lang: processMode ? undefined : 'ru',
        sources: ['web'],
        tbs: dateFrom ? buildDateTbs(dateFrom) : undefined,
      };
      const json = await gapSearchRequest(body, query, index, selected.length);
      const found = normalizeItems(json.data);
      for (const raw of found) {
        const key = normalizeUrl(raw.url || raw.sourceURL);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const id = `S${String(items.length + 1).padStart(3, '0')}`;
        items.push({ ...raw, sourceId: id, searchKeyword: query });
        added += 1;
      }
    } catch (error) {
      failures += 1;
      console.warn('Gap search failed:', query, classifyApiFailure(error), error);
    }
    if (index < selected.length - 1) await sleep(350);
  }

  if (added) {
    const meta = {
      ...(payload.meta || {}),
      researchQueries: [...new Set([...(payload.meta?.researchQueries || []), ...selected])],
      gapQueriesRun: Number(payload.meta?.gapQueriesRun || 0) + selected.length,
      gapSourcesAdded: Number(payload.meta?.gapSourcesAdded || 0) + added,
    };
    setLastPayload({ ...payload, items, meta });
    renderResults(payload.title || 'Исследование', items, meta);
    document.getElementById('tabAiBtn')?.click();
  }
  return { added, failures };
}

async function resynthesizeAfterGap() {
  const payload = getLastPayload();
  const prompt = buildAiPrompt();
  const processMode = payload?.meta?.mode === 'process-improvement';
  const processInstruction = processMode
    ? `\n\nЭто аудит HR-процесса «${payload.meta?.processName || ''}». Сохрани структуру Process Excellence отчёта: AS-IS, SIPOC, Muda, риски/5 Why, внешние практики, Gap Analysis, что убрать/упростить, матрица инструментов, TO-BE, RACI, KPI, зрелость, Quick Wins, дорожная карта и эффект. При выборе технологий соблюдай порядок: убрать → упростить → объединить → стандартизировать → интегрировать → автоматизировать → RPA → AI. Не предлагай AI или робота без обоснования.`
    : '';
  const report = await callOpenAiAnalysis({
    system: processMode
      ? 'Ты ведущий консультант по HR Process Excellence и доказательным исследованиям. Пересобери аудит процесса после дополнительного поиска, сохрани Source ID.'
      : 'Ты ведущий аналитик доказательного HR-исследования. Пересобери отчёт после дополнительного поиска, не теряя Source ID и не придумывая факты.',
    user: `${prompt.user}${processInstruction}\n\nДополнительные требования:\n- используй новые источники только когда они действительно подтверждают вывод;\n- для каждой важной цифры обязательно укажи Source ID;\n- явно разделяй подтверждённые факты, интерпретации и рекомендации;\n- противоречия не скрывай;\n- добавь раздел «Что не удалось подтвердить», если пробелы остались.`
  }, 5400);
  return stripSourceRegister(report) + buildSourceRegister(getLastPayload()?.items || []);
}

async function correctReportWithAudit(report, audit) {
  const compactAudit = JSON.stringify({
    coverage: audit.coverage,
    claims: audit.claims,
    contradictions: audit.contradictions,
  });
  const processMode = getLastPayload()?.meta?.mode === 'process-improvement';
  const corrected = await callOpenAiAnalysis({
    system: 'Ты редактор-фактчекер. Исправь аналитический отчёт строго по результатам независимой проверки. Не добавляй новых фактов.',
    user: `Отчёт:\n${stripSourceRegister(report)}\n\nРезультаты проверки:\n${compactAudit}\n\nИсправь отчёт на русском в markdown.\nПравила:\n1. Удали неподтверждённые утверждения или прямо пометь их как неподтверждённые.\n2. Частично подтверждённые тезисы сформулируй осторожнее.\n3. Числа сохраняй только если проверка подтверждает их источником.\n4. Не меняй существующие Source ID на выдуманные.\n5. Противоречащие данные покажи как расхождение, а не выбирай одну цифру без основания.\n6. Отделяй факты от интерпретаций и рекомендаций.\n7. В конце добавь «Что не удалось подтвердить» и «Противоречия», если такие пункты есть.\n8. Не добавляй реестр источников - он будет добавлен автоматически.\n${processMode ? '9. Сохрани структуру аудита HR-процесса, матрицу инструментов и TO-BE. Не удаляй рекомендации только потому, что они являются рекомендациями, но не выдавай их за подтверждённые внешние факты.' : ''}`
  }, 5200);
  return stripSourceRegister(corrected) + buildSourceRegister(getLastPayload()?.items || []);
}

function statusLabel(status) {
  return ({ covered: 'Покрыт', partial: 'Частично', missing: 'Нет данных' })[status] || status;
}

function statusClass(status) {
  return `rq-status rq-${status}`;
}

function researchQualityHtml(quality) {
  const metrics = [
    ['Покрытие вопросов', quality.metrics.coverage],
    ['Надёжность источников', quality.metrics.reliability],
    ['Проверка фактов и цифр', quality.metrics.verification],
    ['Актуальность', quality.metrics.recency],
    ['Первичные источники', quality.metrics.primary],
    ['Доказательность отчёта', quality.metrics.evidence],
  ];
  const typeSummary = sourceTypeSummary(quality).slice(0, 8);
  const weakSources = (quality.sourceAssessment || []).filter((row) => row.reliability < 60).slice(0, 8);
  const problematicClaims = (quality.claims || []).filter((row) => row.status !== 'confirmed').slice(0, 12);
  return `
    <section class="research-quality-card" id="researchQualityCard">
      <div class="research-quality-head">
        <div class="research-quality-score">${quality.score}</div>
        <div><strong>Research Quality / 100</strong><div class="hint">Полнота и точность исследования: ${esc(quality.level)}</div></div>
      </div>
      <div class="research-quality-metrics">
        ${metrics.map(([label, value]) => `<div class="research-quality-metric"><span>${esc(label)}</span><strong>${value}%</strong><div class="usage-bar"><span style="width:${value}%"></span></div></div>`).join('')}
      </div>
      <details class="rq-section" open>
        <summary>Покрытие исследовательских вопросов (${quality.coverage.length})</summary>
        <div class="rq-table-wrap"><table class="rq-table"><thead><tr><th>Вопрос</th><th>Статус</th><th>Источники</th><th>Комментарий</th></tr></thead><tbody>
          ${quality.coverage.map((row) => `<tr><td>${esc(row.question)}</td><td><span class="${statusClass(row.status)}">${statusLabel(row.status)}</span></td><td>${esc((row.sourceIds || []).join(', ') || '—')}</td><td>${esc(row.note || '')}</td></tr>`).join('') || '<tr><td colspan="4">Матрица покрытия не сформирована.</td></tr>'}
        </tbody></table></div>
      </details>
      <details class="rq-section">
        <summary>Качество и типы источников</summary>
        <div class="rq-source-types">${typeSummary.map(([label, count]) => `<span>${esc(label)}: <strong>${count}</strong></span>`).join('')}</div>
        <div class="rq-table-wrap"><table class="rq-table"><thead><tr><th>ID</th><th>Тип</th><th>Надёжность</th><th>Первичность</th></tr></thead><tbody>
          ${(quality.sourceAssessment || []).slice(0, 40).map((row) => `<tr><td>${esc(row.sourceId)}</td><td>${esc(row.label || row.type)}</td><td>${row.reliability}%</td><td>${row.primary}%</td></tr>`).join('')}
        </tbody></table></div>
        ${weakSources.length ? `<p class="rq-warning">Слабые источники: ${weakSources.map((row) => `${esc(row.sourceId)} (${row.reliability}%)`).join(', ')}</p>` : ''}
      </details>
      <details class="rq-section">
        <summary>Проверка фактов и цифр</summary>
        ${problematicClaims.length ? `<ul class="rq-issues">${problematicClaims.map((row) => `<li><strong>${esc(row.status)}</strong>: ${esc(row.claim)}${row.note ? ` - ${esc(row.note)}` : ''}</li>`).join('')}</ul>` : '<p class="rq-ok">Существенных неподтверждённых тезисов в проверенной выборке не найдено.</p>'}
        ${quality.contradictions?.length ? `<div class="rq-warning"><strong>Противоречия:</strong><ul>${quality.contradictions.map((row) => `<li>${esc(row.topic || row.note)} ${esc((row.sourceIds || []).join(', '))}</li>`).join('')}</ul></div>` : ''}
      </details>
      ${quality.warnings?.length ? `<div class="rq-warning"><strong>Что ещё требует внимания:</strong><ul>${quality.warnings.map((row) => `<li>${esc(row)}</li>`).join('')}</ul></div>` : ''}
      ${quality.missingQueries?.length ? `<button type="button" class="btn-run rq-gap-button" id="btnFindMissingEvidence">Найти недостающие доказательства</button><p class="hint">Сервис выполнит дополнительный поиск только по непокрытым вопросам и повторно проверит отчёт.</p>` : '<div class="rq-ok">Критических пробелов для дополнительного поиска не обнаружено.</div>'}
    </section>`;
}

function renderResearchQuality(quality) {
  const area = document.getElementById('aiResultsArea');
  if (!area || !quality?.kind?.startsWith('research-quality')) return;
  area.querySelector('#researchQualityCard')?.remove();
  const evidence = area.querySelector('.evidence-score-card');
  if (evidence) evidence.insertAdjacentHTML('beforebegin', researchQualityHtml(quality));
  else area.querySelector('.ai-report-body')?.insertAdjacentHTML('beforebegin', researchQualityHtml(quality));
  document.getElementById('btnFindMissingEvidence')?.addEventListener('click', () => enhanceFromMissingQueries(false));
}

async function finalizeQuality(report, audit) {
  const payload = getLastPayload();
  const evidence = calculateEvidenceScore(payload, report);
  const quality = computeResearchQuality({ payload, evidence, audit });
  setLastQuality(quality);
  const processMode = payload?.meta?.mode === 'process-improvement';
  running = true;
  try {
    renderAiReport(report, {
      preserveQuality: true,
      resultsTitle: processMode ? 'Проверенный аудит HR-процесса' : 'Проверенный AI-отчёт',
      kicker: processMode ? 'HR ПОМОЩНИК · VERIFIED PROCESS EXCELLENCE' : 'HR ПОМОЩНИК · VERIFIED RESEARCH',
      title: processMode ? `Проверенный аудит и TO-BE: ${payload.meta?.processName || 'HR-процесс'}` : 'Итоговый отчёт после проверки точности и полноты',
    });
    renderResearchQuality(quality);
  } finally {
    running = false;
  }
  lastProcessedReport = report;
  return quality;
}

async function runAuditPipeline(initialReport, allowAutoGap = true) {
  if (running || !initialReport) return null;
  const payload = getLastPayload();
  if (!payload?.items?.length || !['research', 'process-improvement'].includes(payload.meta?.mode)) return null;
  running = true;
  try {
    setProgress('aiProgress', 'Проверяем полноту исследования, факты и числовые утверждения…');
    let report = initialReport;
    let audit = await auditReport(report, getLastPayload());

    if (allowAutoGap && audit.missingQueries.length) {
      setProgress('aiProgress', `Нашли пробелы. Выполняем дополнительный поиск по ${Math.min(AUTO_GAP_QUERIES, audit.missingQueries.length)} вопросам…`);
      const gap = await findMissingEvidence(audit.missingQueries, AUTO_GAP_QUERIES);
      if (gap.added) {
        showToast(`Дополнительный поиск добавил ${gap.added} источников. Пересобираем отчёт.`);
        setProgress('aiProgress', `Пересобираем отчёт с учётом ${gap.added} новых источников…`);
        report = await resynthesizeAfterGap();
        setProgress('aiProgress', 'Повторно проверяем факты, цифры и покрытие после дополнительного поиска…');
        audit = await auditReport(report, getLastPayload());
      } else if (gap.failures) {
        showToast('Дополнительный поиск частично не выполнен. Пробелы останутся отмечены в отчёте.');
      }
    }

    setProgress('aiProgress', 'Финальный фактчек: исправляем неподтверждённые и спорные формулировки…');
    report = await correctReportWithAudit(report, audit);
    const quality = await finalizeQuality(report, audit);
    showToast(`Research Quality: ${quality.score}/100. Проверка точности и полноты завершена.`);
    return quality;
  } catch (error) {
    console.warn('Research quality audit failed:', error);
    showToast(`Отчёт готов, но дополнительная проверка не завершена: ${error.message || error}`);
    return null;
  } finally {
    running = false;
    hideProgress('aiProgress');
  }
}

export async function runResearchQualityAudit(report, allowAutoGap = true) {
  return runAuditPipeline(report, allowAutoGap);
}

async function enhanceFromMissingQueries(auto = false) {
  if (running) return;
  const quality = getLastQuality();
  const queries = quality?.kind?.startsWith('research-quality') ? quality.missingQueries : [];
  if (!queries?.length) {
    showToast('Непокрытых вопросов для дополнительного поиска нет');
    return;
  }
  running = true;
  try {
    const maxQueries = auto ? AUTO_GAP_QUERIES : MANUAL_GAP_QUERIES;
    setProgress('aiProgress', `Дорабатываем исследование: дополнительный поиск по ${Math.min(maxQueries, queries.length)} пробелам…`);
    const gap = await findMissingEvidence(queries, maxQueries);
    if (!gap.added) {
      showToast('Новых доказательств по выбранным пробелам не найдено');
      return;
    }
    const report = await resynthesizeAfterGap();
    const audit = await auditReport(report, getLastPayload());
    const corrected = await correctReportWithAudit(report, audit);
    await finalizeQuality(corrected, audit);
    showToast(`Добавлено ${gap.added} источников. Исследование повторно проверено.`);
  } catch (error) {
    showToast(`Не удалось доработать исследование: ${error.message || error}`);
  } finally {
    running = false;
    hideProgress('aiProgress');
  }
}

async function waitForFreshReport(previous) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const current = getLastAiReport();
    const button = document.getElementById('btnAiAnalyze');
    if (current && current !== previous && !button?.disabled) return current;
    await sleep(450);
  }
  return '';
}

function installSavedQualityRenderer() {
  const area = document.getElementById('aiResultsArea');
  if (!area) return;
  const observer = new MutationObserver(() => {
    if (running) return;
    const quality = getLastQuality();
    if (quality?.kind?.startsWith('research-quality') && !area.querySelector('#researchQualityCard')) {
      renderResearchQuality(quality);
    }
  });
  observer.observe(area, { childList: true, subtree: true });
}

export function installResearchQualitySuite() {
  if (installed) return;
  installed = true;
  installSavedQualityRenderer();
  const button = document.getElementById('btnAiAnalyze');
  if (!button) return;
  button.addEventListener('click', async () => {
    if (running) return;
    auditRequested = true;
    const previous = getLastAiReport();
    const fresh = await waitForFreshReport(previous);
    if (!auditRequested || !fresh || fresh === lastProcessedReport) return;
    auditRequested = false;
    await runAuditPipeline(fresh, true);
  });
}