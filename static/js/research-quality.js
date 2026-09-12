const OFFICIAL_DOMAINS = [
  'government.ru', 'rosstat.gov.ru', 'mintrud.gov.ru', 'trudvsem.ru', 'publication.pravo.gov.ru',
  'oecd.org', 'ilo.org', 'who.int', 'worldbank.org'
];
const ACADEMIC_DOMAINS = [
  'hse.ru', 'ranepa.ru', 'cyberleninka.ru', 'elibrary.ru', 'nber.org', 'ssrn.com', 'sciencedirect.com',
  'springer.com', 'nature.com', 'tandfonline.com', 'researchgate.net'
];
const LABOUR_DOMAINS = ['hh.ru', 'career.habr.com', 'superjob.ru', 'rabota.ru'];
const PROFESSIONAL_DOMAINS = [
  'gallup.com', 'gartner.com', 'mckinsey.com', 'bcg.com', 'deloitte.com', 'pwc.com', 'kpmg.com', 'ey.com'
];
const NEWS_DOMAINS = [
  'rbc.ru', 'kommersant.ru', 'vedomosti.ru', 'tass.ru', 'interfax.ru', 'ria.ru', 'forbes.ru'
];
const SOCIAL_DOMAINS = ['vk.com', 't.me', 'telegram.me', 'reddit.com', 'youtube.com', 'dzen.ru'];

function domainOf(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function domainMatches(domain, values) {
  return values.some((item) => domain === item || domain.endsWith(`.${item}`));
}

export function classifySourceHeuristic(item = {}) {
  const domain = domainOf(item.url || item.sourceURL);
  const path = String(item.url || item.sourceURL || '').toLowerCase();
  const title = String(item.title || '').toLowerCase();

  if (domainMatches(domain, OFFICIAL_DOMAINS) || /\.gov\.|\.gov$/.test(domain)) {
    return { type: 'official', label: 'Официальный источник', reliability: 96, primary: 100 };
  }
  if (domainMatches(domain, ACADEMIC_DOMAINS) || /\.edu$|\.ac\./.test(domain)) {
    return { type: 'research', label: 'Исследование / наука', reliability: 90, primary: 78 };
  }
  if (domainMatches(domain, LABOUR_DOMAINS)) {
    return { type: 'labour_market', label: 'Рынок труда', reliability: 84, primary: 65 };
  }
  if (domainMatches(domain, PROFESSIONAL_DOMAINS)) {
    return { type: 'professional_research', label: 'Профессиональное исследование', reliability: 86, primary: 58 };
  }
  if (domainMatches(domain, NEWS_DOMAINS)) {
    return { type: 'media', label: 'Деловые СМИ', reliability: 74, primary: 28 };
  }
  if (domainMatches(domain, SOCIAL_DOMAINS)) {
    return { type: 'social', label: 'Соцсеть / пользовательский источник', reliability: 40, primary: 18 };
  }
  if (/press|news|career|vacanc|company|about|investor|sustainab|esg|hr/i.test(path + ' ' + title) && domain) {
    return { type: 'corporate', label: 'Корпоративный источник', reliability: 80, primary: 88 };
  }
  return { type: 'other', label: 'Прочий источник', reliability: 62, primary: 38 };
}

function sourceId(item, index) {
  return String(item?.sourceId || `S${String(index + 1).padStart(3, '0')}`);
}

function normalizeStatus(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function normalizeIds(values, validIds) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => validIds.has(item)))];
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function sanitizeResearchAudit(raw, payload = {}) {
  const items = payload?.items || [];
  const validIds = new Set(items.map(sourceId));
  const sourceById = new Map(items.map((item, index) => [sourceId(item, index), item]));

  const coverage = (Array.isArray(raw?.coverage) ? raw.coverage : []).slice(0, 16).map((row, index) => ({
    id: String(row?.id || `Q${String(index + 1).padStart(2, '0')}`),
    question: String(row?.question || '').trim().slice(0, 1200),
    status: normalizeStatus(row?.status, ['covered', 'partial', 'missing'], 'partial'),
    sourceIds: normalizeIds(row?.source_ids || row?.sourceIds, validIds),
    note: String(row?.note || row?.notes || '').trim().slice(0, 1600),
  })).filter((row) => row.question);

  const claims = (Array.isArray(raw?.claims) ? raw.claims : []).slice(0, 30).map((row) => ({
    claim: String(row?.claim || '').trim().slice(0, 1800),
    status: normalizeStatus(row?.status, ['confirmed', 'partial', 'unsupported', 'conflict'], 'partial'),
    numeric: Boolean(row?.numeric),
    sourceIds: normalizeIds(row?.source_ids || row?.sourceIds, validIds),
    note: String(row?.note || row?.notes || '').trim().slice(0, 1800),
  })).filter((row) => row.claim);

  const contradictions = (Array.isArray(raw?.contradictions) ? raw.contradictions : []).slice(0, 12).map((row) => ({
    topic: String(row?.topic || '').trim().slice(0, 1000),
    sourceIds: normalizeIds(row?.source_ids || row?.sourceIds, validIds),
    note: String(row?.note || row?.notes || '').trim().slice(0, 1800),
  })).filter((row) => row.topic || row.note);

  const missingQueries = [...new Set((Array.isArray(raw?.missing_queries) ? raw.missing_queries : [])
    .map((item) => String(item || '').trim())
    .filter((item) => item.length >= 4 && item.length <= 500))].slice(0, 8);

  const aiAssessments = new Map();
  for (const row of (Array.isArray(raw?.source_assessment) ? raw.source_assessment : []).slice(0, 80)) {
    const id = String(row?.source_id || row?.sourceId || '').trim().toUpperCase();
    if (!validIds.has(id)) continue;
    const item = sourceById.get(id) || {};
    const fallback = classifySourceHeuristic(item);
    aiAssessments.set(id, {
      sourceId: id,
      type: String(row?.type || fallback.type).slice(0, 80),
      label: String(row?.label || row?.type_label || fallback.label).slice(0, 160),
      reliability: clamp(row?.reliability ?? fallback.reliability),
      primary: clamp(row?.primary ?? row?.primary_score ?? fallback.primary),
      note: String(row?.note || '').trim().slice(0, 900),
    });
  }

  const sourceAssessment = items.map((item, index) => {
    const id = sourceId(item, index);
    if (aiAssessments.has(id)) return aiAssessments.get(id);
    const fallback = classifySourceHeuristic(item);
    return { sourceId: id, ...fallback, note: '' };
  });

  return { coverage, claims, contradictions, missingQueries, sourceAssessment };
}

function average(values, fallback = 0) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : fallback;
}

function recencyScore(item, now = new Date()) {
  const raw = item?.publishedDate || item?.published_at || item?.date || '';
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return 55;
  const ageYears = Math.max(0, (now.getTime() - date.getTime()) / 31_557_600_000);
  if (ageYears <= 1) return 100;
  if (ageYears <= 2) return 86;
  if (ageYears <= 3) return 72;
  if (ageYears <= 5) return 52;
  return 28;
}

function coverageScore(rows) {
  if (!rows.length) return 40;
  const map = { covered: 100, partial: 55, missing: 0 };
  return Math.round(average(rows.map((row) => map[row.status] ?? 0)));
}

function verificationScore(claims) {
  if (!claims.length) return 45;
  const map = { confirmed: 100, partial: 60, unsupported: 0, conflict: 35 };
  const weighted = claims.map((claim) => {
    const base = map[claim.status] ?? 0;
    return claim.numeric ? base * 1.15 : base;
  });
  const maxWeights = claims.map((claim) => claim.numeric ? 115 : 100);
  return Math.round(clamp(weighted.reduce((a, b) => a + b, 0) / Math.max(1, maxWeights.reduce((a, b) => a + b, 0)) * 100));
}

export function computeResearchQuality({ payload = {}, evidence = null, audit = null, now = new Date() } = {}) {
  const items = payload?.items || [];
  const safeAudit = audit || sanitizeResearchAudit({}, payload);
  const usedIds = new Set([
    ...safeAudit.coverage.flatMap((row) => row.sourceIds || []),
    ...safeAudit.claims.flatMap((row) => row.sourceIds || []),
  ]);
  const usedItems = usedIds.size ? items.filter((item, index) => usedIds.has(sourceId(item, index))) : items;
  const assessments = safeAudit.sourceAssessment || items.map((item, index) => ({ sourceId: sourceId(item, index), ...classifySourceHeuristic(item) }));
  const usedAssessments = usedIds.size ? assessments.filter((row) => usedIds.has(row.sourceId)) : assessments;

  const metrics = {
    coverage: coverageScore(safeAudit.coverage),
    reliability: Math.round(average(usedAssessments.map((row) => row.reliability), 55)),
    verification: verificationScore(safeAudit.claims),
    recency: Math.round(average(usedItems.map((item) => recencyScore(item, now)), 55)),
    primary: Math.round(average(usedAssessments.map((row) => row.primary), 45)),
    evidence: Math.round(clamp(evidence?.score ?? 50)),
  };

  const score = Math.round(
    metrics.coverage * 0.30 +
    metrics.reliability * 0.20 +
    metrics.verification * 0.20 +
    metrics.recency * 0.10 +
    metrics.primary * 0.10 +
    metrics.evidence * 0.10
  );
  const level = score >= 85 ? 'высокая' : score >= 70 ? 'хорошая' : score >= 50 ? 'средняя' : 'низкая';

  const warnings = [];
  const missing = safeAudit.coverage.filter((row) => row.status === 'missing').length;
  const partial = safeAudit.coverage.filter((row) => row.status === 'partial').length;
  const unsupported = safeAudit.claims.filter((row) => row.status === 'unsupported').length;
  const conflicts = safeAudit.claims.filter((row) => row.status === 'conflict').length + safeAudit.contradictions.length;
  if (missing) warnings.push(`Непокрытых исследовательских вопросов: ${missing}`);
  if (partial) warnings.push(`Частично покрытых вопросов: ${partial}`);
  if (unsupported) warnings.push(`Неподтверждённых существенных тезисов: ${unsupported}`);
  if (conflicts) warnings.push(`Противоречий, требующих внимания: ${conflicts}`);
  if (metrics.reliability < 70) warnings.push('Средняя надёжность использованных источников ниже целевого уровня');
  if (metrics.primary < 55) warnings.push('Недостаточно первичных источников');
  if (metrics.recency < 65) warnings.push('Часть доказательств устарела или не имеет даты');

  return {
    kind: 'research-quality-v1',
    score: clamp(score),
    level,
    metrics,
    coverage: safeAudit.coverage,
    claims: safeAudit.claims,
    contradictions: safeAudit.contradictions,
    missingQueries: safeAudit.missingQueries,
    sourceAssessment: assessments,
    evidence: evidence || null,
    sourceCount: items.length,
    warnings,
  };
}

export function sourceTypeSummary(quality) {
  const counts = new Map();
  for (const source of quality?.sourceAssessment || []) {
    const key = source.label || source.type || 'Прочий источник';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
