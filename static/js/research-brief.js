import { MAX_SEARCH_QUERY } from './config.js';
import { normalizeDomain } from './domains.js';

export function parseKeywordInput(value) {
  const out = [];
  for (const line of String(value || '').split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^[-*•\d.)]+\s*/, '');
    if (/[,;]/.test(cleaned)) {
      cleaned.split(/[,;]+/).forEach((part) => {
        const p = part
          .trim()
          .replace(/^[-*•\d.)]+\s*/, '')
          .replace(/^[«"']|[»"']$/g, '');
        if (p.length >= 2) out.push(p);
      });
    } else {
      const p = cleaned.replace(/^[«"']|[»"']$/g, '');
      if (p.length >= 2) out.push(p);
    }
  }
  return [...new Set(out)];
}

export function extractKeywordsFromBrief(text) {
  const found = [];
  const re = /[«"']([^»"']{2,120})[»"']/g;
  let m;
  while ((m = re.exec(text))) found.push(m[1].trim());

  const section = text.match(
    /(?:ключевые\s+слова|поисковые\s+слова|теги|tags)\s*[:—]?\s*([\s\S]*?)(?:\n\s*\n|\n(?:период|приоритет|используй|домен|сайт)|$)/i
  );
  if (section) parseKeywordInput(section[1]).forEach((k) => found.push(k));

  for (const line of text.split('\n')) {
    const bullet = line.match(/^[\s*\-•]+\s*(.+)$/);
    if (bullet) {
      const item = bullet[1].trim().replace(/^[`'«"]|[`'»"]$/g, '');
      if (
        item.length >= 2 &&
        item.length <= 120 &&
        !/\b[a-z0-9.-]+\.(?:ru|com|org|info)\b/i.test(item)
      ) {
        parseKeywordInput(item).forEach((k) => found.push(k));
      }
    }
  }
  return [...new Set(found)];
}

export function extractCityFromBrief(text) {
  const patterns = [
    /(?:город[еу]?\s+|г\.\s*|в\s+)([а-яё\-]+(?:\s+[а-яё\-]+)?)/i,
    /(?:город[еу]?\s+|г\.\s*|в\s+)([A-Za-z\-]+)/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

export function generateSearchQueriesFromBrief(text) {
  const brief = String(text || '').trim();
  if (!brief) return [];

  const queries = [];
  const city = extractCityFromBrief(brief);
  const cityPart = city ? ` ${city}` : '';

  if (/аренд|квартир|снять|жил(?:ой|ого|ом)|недвижим/i.test(brief)) {
    const rooms =
      brief.match(/(?:не\s+)?(?:менее|от)\s*(\d+)\s*[-–]?\s*комнат/i) ||
      brief.match(/(\d+)\s*[-–]?\s*комнат/i);
    const price = brief.match(/(?:не\s+)?(?:более|до|max)\s*([\d\s]{4,})\s*руб/i);
    const floor = brief.match(/(?:не\s+)?выше\s*(\d+)\s*этаж/i);

    const base = `аренда квартира${cityPart}`.trim();
    queries.push(base);
    if (rooms) queries.push(`аренда ${rooms[1]} комнатная квартира${cityPart}`.trim());
    if (/новый|новострой|новостройк/i.test(brief)) {
      queries.push(`аренда квартира новостройка${cityPart}`.trim());
    }
    if (price) {
      queries.push(`снять квартиру${cityPart} до ${price[1].replace(/\s/g, '')}`.trim());
    }
    if (floor) queries.push(`аренда квартира${cityPart} ${floor[1]} этаж`.trim());
    queries.push(`снять квартиру${cityPart}`.trim());
  } else if (/ваканс|работ|трудоустр|hr|персонал|сотрудник/i.test(brief)) {
    queries.push(`HR практики${cityPart}`.trim());
    if (/адаптац/i.test(brief)) queries.push(`адаптация сотрудников${cityPart}`.trim());
    if (/текучест/i.test(brief)) queries.push(`текучесть персонала${cityPart}`.trim());
  } else if (/ветеран|сво|участник/i.test(brief)) {
    queries.push(`трудоустройство ветеранов${cityPart}`.trim());
    queries.push(`адаптация участников СВО${cityPart}`.trim());
  }

  const stripped = brief
    .replace(/^(?:изучи|собери|найди|проанализируй|исследуй)\s+(?:вопрос\s+)?(?:с\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length >= 20 && stripped.length <= MAX_SEARCH_QUERY) {
    queries.push(stripped);
  } else if (stripped.length > MAX_SEARCH_QUERY) {
    brief
      .split(/[,;.\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15 && s.length <= MAX_SEARCH_QUERY)
      .slice(0, 6)
      .forEach((s) => queries.push(s.replace(/^(?:изучи|собери|найди)\s+/i, '')));
  }

  return [
    ...new Set(
      queries
        .map((q) => q.replace(/\s+/g, ' ').trim())
        .filter((q) => {
          const words = q.split(/\s+/).filter(Boolean);
          return q.length >= 12 && words.length >= 2 && q.length <= MAX_SEARCH_QUERY;
        })
    )
  ];
}

export function buildKeywordsFromBrief(text) {
  const quoted = extractKeywordsFromBrief(text);
  const generated = generateSearchQueriesFromBrief(text);
  const merged = [...quoted];
  for (const q of generated) {
    if (!merged.some((k) => k.toLowerCase() === q.toLowerCase())) merged.push(q);
  }
  return merged.filter((q) => q.split(/\s+/).length >= 2 || q.length >= 15);
}

export function isRealEstateBrief(text) {
  return /аренд|квартир|недвижим|снять\s+квар|жил(?:ой|ого)/i.test(text);
}

export function urlMatchesBriefTopic(item, brief) {
  if (!brief || !isRealEstateBrief(brief)) return true;
  const blob =
    `${item.url || ''} ${item.title || ''} ${item.description || ''} ${item.snippet || ''}`.toLowerCase();
  if (
    /\/rabota|\/vakansii|\/resume|\/job|\/employer|ваканс|работа и ваканс|сборщик заказов|склад wildberries/i.test(
      blob
    )
  ) {
    return false;
  }
  return /квартир|аренд|nedvizhimost|\/kvartiry|\/sdam|\/snimu|realty|недвижим|снять|комнат|жил/i.test(
    blob
  );
}

export function extractDomainsFromBrief(text) {
  const found = new Set();
  const reList = [
    /`([a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)`/gi,
    /\b([a-z0-9][a-z0-9.-]*\.(?:ru|com|info|org|gov\.ru))\b/gi
  ];
  for (const re of reList) {
    let m;
    const rx = new RegExp(re.source, re.flags);
    while ((m = rx.exec(text))) {
      const d = normalizeDomain(m[1]);
      if (d && !/\s/.test(d)) found.add(d);
    }
  }
  if (/ржд|rzd/i.test(text)) found.add('rzd.ru');
  if (/ростех|rostec/i.test(text)) found.add('rostec.ru');
  if (/россет/i.test(text)) found.add('rosseti.ru');
  return [...found];
}

export function buildResearchJobs(keywords, domains, broad) {
  const jobs = [];
  for (const kw of keywords) {
    if (domains.length) {
      jobs.push({
        query: kw,
        includeDomains: domains,
        label: `${kw} [${domains.slice(0, 3).join(', ')}${domains.length > 3 ? '…' : ''}]`,
        domainOnly: true
      });
    }
    if (broad || !domains.length) {
      jobs.push({
        query: kw,
        includeDomains: [],
        label: domains.length ? `${kw} (весь web)` : kw,
        domainOnly: false
      });
    }
  }
  return jobs;
}

export function itemUrlKey(it) {
  return String(it.url || it.sourceURL || '')
    .toLowerCase()
    .replace(/\/+$/, '');
}

export function mergeSearchItems(bucket, items, keyword) {
  const seen = new Set(bucket.map(itemUrlKey));
  for (const it of items) {
    const key = itemUrlKey(it);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    bucket.push({ ...it, searchKeyword: keyword });
  }
  return bucket;
}

export function buildDateTbs(dateFromValue) {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = today.getFullYear();
  let cdMin = '01/01/2023';
  if (dateFromValue) {
    const [y, m, d] = dateFromValue.split('-');
    if (y && m && d) cdMin = `${m}/${d}/${y}`;
  }
  return `cdr:1,cd_min:${cdMin},cd_max:${mm}/${dd}/${yyyy}`;
}
