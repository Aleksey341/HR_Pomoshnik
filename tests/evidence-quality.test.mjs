import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEvidenceScore } from '../static/js/quality.js';

const payload = {
  items: [
    { sourceId: 'S001', url: 'https://example-a.ru/a', markdown: 'A'.repeat(500) },
    { sourceId: 'S002', url: 'https://example-b.ru/b', markdown: 'B'.repeat(500) },
    { sourceId: 'S003', url: 'https://example-c.ru/c', markdown: 'C'.repeat(500) },
    { sourceId: 'S004', url: 'https://example-d.ru/d', markdown: 'D'.repeat(500) },
  ],
};

test('well cited multi-source report scores higher than uncited report', () => {
  const strong = `
## Факты
Компании используют формализованные программы адаптации с контрольными точками первого месяца, что подтверждается несколькими независимыми источниками. [S001] [S002]
Наставничество связано с более структурированным входом новичка в должность и регулярной обратной связью руководителя. [S003] [S004]

## Рекомендации
Использовать эти практики как гипотезы для пилота и проверить эффект на собственной выборке.
`;
  const weak = `
## Факты
Компании используют формализованные программы адаптации с контрольными точками первого месяца, что подтверждается несколькими независимыми источниками.
Наставничество связано с более структурированным входом новичка в должность и регулярной обратной связью руководителя.
`;

  const strongScore = calculateEvidenceScore(payload, strong);
  const weakScore = calculateEvidenceScore(payload, weak);
  assert.ok(strongScore.score > weakScore.score, `${strongScore.score} should be greater than ${weakScore.score}`);
  assert.equal(strongScore.invalidRefs.length, 0);
  assert.equal(strongScore.uncitedClaims, 0);
});

test('invalid Source ID is detected', () => {
  const quality = calculateEvidenceScore(payload, `
## Факты
Практика подтверждена опубликованными материалами работодателей и требует проверки применимости к конкретной организации. [S001] [S999]
`);
  assert.deepEqual(quality.invalidRefs, ['S999']);
  assert.ok(quality.metrics.validity < 100);
});
