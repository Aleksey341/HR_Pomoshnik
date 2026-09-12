import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceHeuristic,
  computeResearchQuality,
  sanitizeResearchAudit,
  sourceTypeSummary,
} from '../static/js/research-quality.js';

const payload = {
  items: [
    { sourceId: 'S001', title: 'Росстат', url: 'https://rosstat.gov.ru/report', publishedDate: '2026-06-01', markdown: 'x'.repeat(500) },
    { sourceId: 'S002', title: 'Исследование ВШЭ', url: 'https://www.hse.ru/news/research', publishedDate: '2025-10-01', markdown: 'x'.repeat(500) },
    { sourceId: 'S003', title: 'Обсуждение', url: 'https://reddit.com/r/hr/1', publishedDate: '2022-01-01', markdown: 'x'.repeat(500) },
  ],
};

test('classifies strong and weak source types', () => {
  const official = classifySourceHeuristic(payload.items[0]);
  const academic = classifySourceHeuristic(payload.items[1]);
  const social = classifySourceHeuristic(payload.items[2]);
  assert.equal(official.type, 'official');
  assert.ok(official.reliability >= 90);
  assert.equal(academic.type, 'research');
  assert.ok(academic.reliability > social.reliability);
});

test('sanitizes audit and removes invented source ids', () => {
  const audit = sanitizeResearchAudit({
    coverage: [{ question: 'Есть ли эффект?', status: 'covered', source_ids: ['S001', 'S999'] }],
    claims: [{ claim: 'Эффект составил 10%', status: 'confirmed', numeric: true, source_ids: ['S001', 'S999'] }],
    missing_queries: ['эффект программы удержания 2026'],
  }, payload);
  assert.deepEqual(audit.coverage[0].sourceIds, ['S001']);
  assert.deepEqual(audit.claims[0].sourceIds, ['S001']);
  assert.equal(audit.missingQueries.length, 1);
  assert.equal(audit.sourceAssessment.length, 3);
});

test('research quality rewards coverage reliability and verification', () => {
  const audit = sanitizeResearchAudit({
    coverage: [
      { question: 'Q1', status: 'covered', source_ids: ['S001', 'S002'] },
      { question: 'Q2', status: 'covered', source_ids: ['S002'] },
    ],
    claims: [
      { claim: 'Подтверждённый показатель', status: 'confirmed', numeric: true, source_ids: ['S001'] },
      { claim: 'Подтверждённая практика', status: 'confirmed', numeric: false, source_ids: ['S002'] },
    ],
    source_assessment: [
      { source_id: 'S001', type: 'official', label: 'Официальный источник', reliability: 98, primary: 100 },
      { source_id: 'S002', type: 'research', label: 'Исследование', reliability: 92, primary: 80 },
    ],
  }, payload);
  const quality = computeResearchQuality({
    payload,
    evidence: { score: 90 },
    audit,
    now: new Date('2026-09-12T00:00:00Z'),
  });
  assert.ok(quality.score >= 85);
  assert.equal(quality.metrics.coverage, 100);
  assert.equal(quality.metrics.verification, 100);
  assert.equal(quality.kind, 'research-quality-v1');
  assert.ok(sourceTypeSummary(quality).length >= 2);
});

test('research quality penalizes missing coverage and unsupported claims', () => {
  const audit = sanitizeResearchAudit({
    coverage: [
      { question: 'Q1', status: 'missing', source_ids: [] },
      { question: 'Q2', status: 'partial', source_ids: ['S003'] },
    ],
    claims: [
      { claim: 'Неподтверждённая цифра', status: 'unsupported', numeric: true, source_ids: [] },
      { claim: 'Спорный тезис', status: 'conflict', numeric: false, source_ids: ['S003'] },
    ],
    missing_queries: ['доказательства Q1'],
  }, payload);
  const quality = computeResearchQuality({
    payload,
    evidence: { score: 45 },
    audit,
    now: new Date('2026-09-12T00:00:00Z'),
  });
  assert.ok(quality.score < 60);
  assert.ok(quality.warnings.some((item) => item.includes('Непокрытых')));
  assert.deepEqual(quality.missingQueries, ['доказательства Q1']);
});
