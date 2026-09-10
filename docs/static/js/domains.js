export function normalizeDomain(d) {
  return String(d)
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0];
}

export function parseDomainsInput(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(normalizeDomain)
    .filter(Boolean);
}

export function normalizeHost(host) {
  return String(host || '')
    .toLowerCase()
    .replace(/^www\./, '');
}

export function urlMatchesDomains(url, domains) {
  if (!url || !domains.length) return true;
  try {
    const host = normalizeHost(
      new URL(String(url).startsWith('http') ? url : `https://${url}`).hostname
    );
    return domains.some((d) => {
      const dom = normalizeHost(normalizeDomain(d));
      return host === dom || host.endsWith(`.${dom}`);
    });
  } catch {
    return false;
  }
}

export function parsePathPatterns(text) {
  return String(text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
