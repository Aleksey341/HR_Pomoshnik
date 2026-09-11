function sourceIdSet(items) {
  return new Set((items || []).map((item, index) => String(item?.sourceId || `S${String(index + 1).padStart(3, '0')}`)));
}

function domainOf(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function reportCore(report) {
  const text = String(report || '');
  return text.split(/\n##\s+Реестр источников\b/i)[0];
}

function claimLines(report) {
  const lines = reportCore(report).split(/\n+/);
  const claims = [];
  let section = '';
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^#{1,4}\s+(.+)/);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (!line || /^[-*_]{3,}$/.test(line)) continue;
    const cleaned = line.replace(/^[-*+>]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (cleaned.length < 55) continue;
    if (/^(источник|source|url|ссылка)\s*:/i.test(cleaned)) continue;
    const recommendationSection = /рекомендац|следующ|действ|решени|что делать|предложен/i.test(section);
    claims.push({ text: cleaned, recommendationSection });
  }
  return claims;
}

export function calculateEvidenceScore(payload, report) {
  const items = payload?.items || [];
  const validIds = sourceIdSet(items);
  const refs = [...String(report || '').matchAll(/\[(S\d{3,})\]/g)].map((match) => match[1]);
  const usedValid = new Set(refs.filter((id) => validIds.has(id)));
  const invalidRefs = [...new Set(refs.filter((id) => !validIds.has(id)))];
  const claims = claimLines(report);
  const factualClaims = claims.filter((claim) => !claim.recommendationSection);
  const citedClaims = factualClaims.filter((claim) => /\[S\d{3,}\]/.test(claim.text));
  const uncitedClaims = factualClaims.length - citedClaims.length;
  const singleSourceClaims = citedClaims.filter((claim) => new Set([...claim.text.matchAll(/\[(S\d{3,})\]/g)].map((m) => m[1])).size === 1).length;

  const domains = new Set(items.map((item) => domainOf(item.url || item.sourceURL)).filter(Boolean));
  const withText = items.filter((item) => String(item.markdown || item.content || '').trim().length >= 250).length;

  const citationRatio = factualClaims.length ? citedClaims.length / factualClaims.length : (refs.length ? 1 : 0);
  const targetEvidenceSources = Math.min(Math.max(4, Math.ceil(items.length * 0.2)), 20, Math.max(items.length, 1));
  const coverageRatio = targetEvidenceSources ? Math.min(1, usedValid.size / targetEvidenceSources) : 0;
  const diversityTarget = Math.min(8, Math.max(items.length, 1));
  const diversityRatio = diversityTarget ? Math.min(1, domains.size / diversityTarget) : 0;
  const textRatio = items.length ? withText / items.length : 0;
  const validityRatio = refs.length ? Math.max(0, 1 - invalidRefs.length / Math.max(refs.length, 1)) : 0;
  const corroborationRatio = citedClaims.length ? Math.max(0, 1 - singleSourceClaims / citedClaims.length) : 0;

  const score = Math.round(
    citationRatio * 35 +
    coverageRatio * 20 +
    diversityRatio * 15 +
    textRatio * 15 +
    validityRatio * 10 +
    corroborationRatio * 5
  );

  const level = score >= 85 ? 'высокая' : score >= 70 ? 'хорошая' : score >= 50 ? 'средняя' : 'низкая';
  const warnings = [];
  if (uncitedClaims > 0) warnings.push(`Фактических тезисов без Source ID: ${uncitedClaims}`);
  if (invalidRefs.length) warnings.push(`Неизвестные Source ID: ${invalidRefs.join(', ')}`);
  if (singleSourceClaims > 0) warnings.push(`Тезисов только с одним источником: ${singleSourceClaims}`);
  if (textRatio < 0.5 && items.length) warnings.push('У большинства источников нет полного текста');
  if (domains.size < Math.min(3, items.length)) warnings.push('Низкое разнообразие доменов');

  return {
    score: Math.max(0, Math.min(100, score)),
    level,
    sourceCount: items.length,
    evidenceSources: usedValid.size,
    domainCount: domains.size,
    fullTextSources: withText,
    factualClaims: factualClaims.length,
    citedClaims: citedClaims.length,
    uncitedClaims,
    singleSourceClaims,
    invalidRefs,
    metrics: {
      citation: Math.round(citationRatio * 100),
      coverage: Math.round(coverageRatio * 100),
      diversity: Math.round(diversityRatio * 100),
      fullText: Math.round(textRatio * 100),
      validity: Math.round(validityRatio * 100),
      corroboration: Math.round(corroborationRatio * 100),
    },
    warnings,
  };
}

export function qualitySummaryText(quality) {
  if (!quality) return '';
  const parts = [
    `Evidence Score ${quality.score}/100 (${quality.level})`,
    `источников в доказательствах ${quality.evidenceSources}/${quality.sourceCount}`,
    `цитированных фактических тезисов ${quality.citedClaims}/${quality.factualClaims}`,
    `доменов ${quality.domainCount}`,
  ];
  if (quality.warnings?.length) parts.push(`замечания: ${quality.warnings.join('; ')}`);
  return parts.join(' · ');
}
