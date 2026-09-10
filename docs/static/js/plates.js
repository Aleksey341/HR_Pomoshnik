import { PLATE_PATTERN_SOURCE } from './plate-pattern.js';

/** Russian / Latin lookalike plate numbers (pattern from app/plates.py). */

export function extractPlateNumbers(text) {
  const found = new Set();
  const src = String(text || '');
  let m;
  const rx = new RegExp(PLATE_PATTERN_SOURCE, 'gi');
  while ((m = rx.exec(src))) {
    found.add(m[0].toUpperCase().replace(/\s+/g, ''));
  }
  return [...found];
}

export function collectPlatesFromItems(items) {
  const rows = [];
  const seen = new Set();
  for (const it of items) {
    const plates = extractPlateNumbers(
      `${it.title || ''}\n${it.markdown || ''}\n${it.description || ''}`
    );
    for (const plate of plates) {
      const key = `${plate}|${it.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ plate, url: it.url, title: it.title });
    }
  }
  return rows;
}
