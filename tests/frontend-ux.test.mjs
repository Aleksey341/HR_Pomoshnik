import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const template = fs.readFileSync('templates/index.html', 'utf8');
const friendlyUi = fs.readFileSync('static/js/friendly-ui.js', 'utf8');
const processUi = fs.readFileSync('static/js/process-improvement.js', 'utf8');

function sectionBetween(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `Missing start marker: ${start}`);
  assert.ok(to > from, `Missing end marker: ${end}`);
  return text.slice(from, to);
}

test('managed user shell is present in source HTML before JavaScript enhancement', () => {
  assert.match(template, /<title>HR Помощник<\/title>/);
  assert.match(template, /id="friendlyHome"/);
  assert.match(template, /id="friendlyWorkspaceHead"/);
  assert.match(template, /id="friendlyProcessImprovement"/);
  assert.match(template, /id="friendlyAiFromMaterials"/);
  assert.match(template, /class="friendly-shell-pending"/);
});

test('home exposes only three primary user goals', () => {
  const home = sectionBetween(template, '<section class="friendly-home"', '<section class="friendly-workspace-head"');
  const grid = sectionBetween(home, '<div class="friendly-task-grid">', '</div>\n\n    <button type="button" class="friendly-history-card"');
  const cards = grid.match(/friendly-task-card/g) || [];
  assert.equal(cards.length, 3);
  assert.match(grid, />Провести исследование</);
  assert.match(grid, />Улучшить HR-процесс</);
  assert.match(grid, />Найти информацию</);
  assert.doesNotMatch(grid, />Получить выводы и рекомендации</);
});

test('AI analysis remains available as a secondary tool', () => {
  assert.match(template, /id="friendlyAiFromMaterials"/);
  assert.match(friendlyUi, /friendlyAiFromMaterials/);
  assert.match(friendlyUi, /openWorkspace\('ai'\)/);
});

test('process improvement is a three-step accessible wizard', () => {
  assert.match(processUi, /WIZARD_STEPS = 3/);
  assert.match(processUi, /data-process-step=\\"1\\"/);
  assert.match(processUi, /data-process-step=\\"2\\"/);
  assert.match(processUi, /data-process-step=\\"3\\"/);
  assert.match(processUi, /aria-modal=\\"true\\"/);
  assert.match(processUi, /aria-describedby=\\"processImprovementDescription\\"/);
  assert.match(processUi, /event\.key === 'Escape'/);
  assert.match(processUi, /event\.key !== 'Tab'/);
  assert.match(processUi, /lastDialogTrigger/);
});

test('technical legacy copy is not part of the first visible shell', () => {
  const firstShell = template.slice(0, template.indexOf('<nav class="tabs"'));
  assert.doesNotMatch(firstShell, /Firecrawl|Парсинг URL|Обход каталога|fc-xxxxxxxx|sk-xxxxxxxx/i);
  assert.match(firstShell, /HR Помощник/);
});
