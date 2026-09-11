function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(raw) {
  let text = esc(raw);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/(?<!href=")\b(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/\[(S\d{3,})\]/g, '<span class="source-ref">[$1]</span>');
  return text;
}

function isTableSeparator(line) {
  const cells = String(line || '').trim().replace(/^\||\|$/g, '').split('|');
  return cells.length > 1 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function tableRow(line, tag) {
  const cells = String(line || '').trim().replace(/^\||\|$/g, '').split('|');
  return `<tr>${cells.map((cell) => `<${tag}>${inline(cell.trim())}</${tag}>`).join('')}</tr>`;
}

export function renderMarkdownSafe(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (i + 1 < lines.length && trimmed.includes('|') && isTableSeparator(lines[i + 1])) {
      const rows = [`<thead>${tableRow(trimmed, 'th')}</thead>`];
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim()) {
        body.push(tableRow(lines[i], 'td'));
        i += 1;
      }
      rows.push(`<tbody>${body.join('')}</tbody>`);
      out.push(`<div class="md-table-wrap"><table class="md-table">${rows.join('')}</table></div>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const parts = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        parts.push(inline(lines[i].trim().replace(/^>\s?/, '')));
        i += 1;
      }
      out.push(`<blockquote>${parts.join('<br>')}</blockquote>`);
      continue;
    }

    const paragraph = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^(#{1,4})\s+/.test(next) || /^[-*+]\s+/.test(next) || /^\d+[.)]\s+/.test(next) || /^>\s?/.test(next)) break;
      if (i + 1 < lines.length && next.includes('|') && isTableSeparator(lines[i + 1])) break;
      paragraph.push(next);
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  return out.join('\n');
}
