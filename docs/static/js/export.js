import { PRACTICE_COLUMNS } from './templates-data.js';
import { extractPlateNumbers } from './plates.js';
import { getLastAiReport, getLastPayload } from './state.js';
import { flashButton, showToast } from './ui.js';

function cellText(value, max = 32000) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) + '… [обрезано для Excel]' : text;
}

function itemSourceId(item, index) {
  return item.sourceId || `S${String(index + 1).padStart(3, '0')}`;
}

export function buildMarkdownExport() {
  const lastPayload = getLastPayload();
  if (!lastPayload?.items?.length) return '';
  return lastPayload.items
    .map(
      (it, i) =>
        `# [${itemSourceId(it, i)}] ${it.title || it.url || 'Без названия'}\n${it.url || it.sourceURL || ''}\n\n${it.markdown || it.content || it.description || '_нет текста_'}`
    )
    .join('\n\n---\n\n');
}

export function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyJson() {
  const lastPayload = getLastPayload();
  if (!lastPayload?.items?.length) {
    showToast('Нет данных — сначала выполните поиск или обход');
    return;
  }
  const btn = document.getElementById('btnCopyJson');
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastPayload, null, 2));
    flashButton(btn);
    showToast('JSON скопирован в буфер обмена');
  } catch {
    showToast('Не удалось скопировать — разрешите доступ к буферу');
  }
}

export function downloadMarkdown() {
  const lastPayload = getLastPayload();
  const lastAiReport = getLastAiReport();
  if (document.getElementById('tabAiBtn').classList.contains('active') && lastAiReport) {
    downloadTextFile(lastAiReport, `AI_анализ_${new Date().toISOString().slice(0, 10)}.md`);
    flashButton(document.getElementById('btnCopyMd'));
    showToast('Отчёт AI-анализа скачан');
    return;
  }
  if (!lastPayload?.items?.length) {
    showToast('Нет данных — сначала выполните поиск или обход');
    return;
  }
  const md = buildMarkdownExport();
  const hasText = lastPayload.items.some((i) => String(i.markdown || i.content || '').trim().length > 0);
  if (!hasText) {
    showToast('Markdown пуст — включите «Markdown каждой страницы» при обходе');
    return;
  }
  const safeName = (lastPayload.title || 'firecrawl').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  downloadTextFile(md, `${safeName}_${new Date().toISOString().slice(0, 10)}.md`);
  flashButton(document.getElementById('btnCopyMd'));
  showToast(`Файл .md скачан (${lastPayload.items.length} стр.)`);
}

export function exportToExcel() {
  const lastPayload = getLastPayload();
  if (!lastPayload?.items?.length) {
    alert('Нет данных для экспорта. Сначала выполните поиск или парсинг.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    alert('Библиотека Excel не загрузилась. Проверьте интернет и обновите страницу.');
    return;
  }

  const exportedAt = new Date().toLocaleString('ru-RU');
  const isCrawl = lastPayload.meta?.mode === 'crawl';

  const rows = isCrawl
    ? [
        ['Source ID', '№', 'Госномер', 'Заголовок', 'URL', 'Описание', 'Текст (markdown)', 'Дата выгрузки'],
        ...lastPayload.items.map((it, i) => [
          itemSourceId(it, i),
          i + 1,
          cellText((it.plates || extractPlateNumbers(`${it.title}\n${it.markdown}`)).join(', '), 100),
          cellText(it.title || 'Без названия', 500),
          cellText(it.url || it.sourceURL || '', 2000),
          cellText(it.description || it.snippet || '', 2000),
          cellText(it.markdown || it.content || '', 32000),
          exportedAt
        ])
      ]
    : [
        ['Source ID', '№', 'Ключевой запрос', 'Заголовок', 'URL', 'Описание', 'Текст (markdown)', 'Дата выгрузки'],
        ...lastPayload.items.map((it, i) => [
          itemSourceId(it, i),
          i + 1,
          cellText(it.searchKeyword || '', 200),
          cellText(it.title || 'Без названия', 500),
          cellText(it.url || it.sourceURL || '', 2000),
          cellText(it.description || it.snippet || '', 2000),
          cellText(it.markdown || it.content || '', 32000),
          exportedAt
        ])
      ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = isCrawl
    ? [{ wch: 11 }, { wch: 5 }, { wch: 14 }, { wch: 42 }, { wch: 48 }, { wch: 50 }, { wch: 90 }, { wch: 18 }]
    : [{ wch: 11 }, { wch: 5 }, { wch: 28 }, { wch: 42 }, { wch: 48 }, { wch: 50 }, { wch: 90 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isCrawl ? 'Страницы' : 'Ссылки');

  if (isCrawl && lastPayload.meta?.plateRows?.length) {
    const plateSheet = [
      ['№', 'Госномер', 'URL', 'Заголовок страницы'],
      ...lastPayload.meta.plateRows.map((row, i) => [i + 1, row.plate, row.url, row.title || ''])
    ];
    const wsPlates = XLSX.utils.aoa_to_sheet(plateSheet);
    wsPlates['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 52 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(wb, wsPlates, 'Номера');
  }

  if (!isCrawl) {
    const templateHeader = ['№', ...PRACTICE_COLUMNS];
    const templateRows = [templateHeader];
    lastPayload.items.forEach((it, i) => {
      const row = new Array(templateHeader.length).fill('');
      row[0] = i + 1;
      row[4] = it.title || '';
      row[6] = it.url || it.sourceURL || '';
      templateRows.push(row);
    });
    const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
    wsTemplate['!cols'] = [{ wch: 4 }, ...PRACTICE_COLUMNS.map(() => ({ wch: 22 }))];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Практики_36_колонок');
  }

  const sourceRegister = [
    ['Source ID', 'Заголовок', 'URL'],
    ...lastPayload.items.map((it, i) => [itemSourceId(it, i), it.title || '', it.url || it.sourceURL || ''])
  ];
  const wsSources = XLSX.utils.aoa_to_sheet(sourceRegister);
  wsSources['!cols'] = [{ wch: 11 }, { wch: 50 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsSources, 'Источники');

  const infoRows = [
    ['Параметр', 'Значение'],
    ['Источник запроса', lastPayload.title || ''],
    ['Количество записей', lastPayload.items.length],
    ['С markdown', lastPayload.items.filter((i) => i.markdown || i.content).length],
    ['Номеров (уник.)', lastPayload.meta?.platesCount ?? ''],
    ['Запросов API', lastPayload.meta?.queriesRun ?? ''],
    ['Лимит страниц', lastPayload.meta?.limit ?? ''],
    ['Время ответа, мс', lastPayload.meta?.ms ?? ''],
    ['Дата выгрузки', exportedAt],
    ['Примечание', isCrawl ? 'Обход каталога по ссылкам' : 'Source ID используется для связи выводов AI с первоисточниками']
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
  wsInfo['!cols'] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Сводка');

  const safeName = (lastPayload.title || 'firecrawl').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const fileName = `${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  flashButton(document.getElementById('btnExportExcel'));
  showToast(`Excel сохранён: ${fileName}`);
}
