import crypto from "node:crypto";

export const FIRECRAWL_API = "https://api.firecrawl.dev/v2";

const RATE_BUCKETS = globalThis.__HR_POMOSHNIK_RATE_BUCKETS__ || new Map();
globalThis.__HR_POMOSHNIK_RATE_BUCKETS__ = RATE_BUCKETS;

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHexEqual(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function configuredLegacyHashes() {
  return (process.env.MANAGED_ACCESS_CODE_HASHES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function configuredUsers() {
  const raw = String(process.env.MANAGED_ACCESS_USERS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([user, hash]) => ({ user, hash }));
    return entries
      .map((item) => ({
        user: String(item?.user || "").trim(),
        hash: String(item?.hash || "").trim().toLowerCase(),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => item.user && item.enabled && /^[a-f0-9]{64}$/i.test(item.hash));
  } catch (_error) {
    return [];
  }
}

export function resolveAccessUser(code) {
  if (!code) return null;
  const digest = sha256(code);

  for (const item of configuredUsers()) {
    if (safeHexEqual(digest, item.hash)) return item.user;
  }

  for (const hash of configuredLegacyHashes()) {
    if (safeHexEqual(digest, hash)) return "legacy";
  }

  return null;
}

export function isAllowedAccessCode(code) {
  return Boolean(resolveAccessUser(code));
}

export function applyCors(req, res) {
  const defaults = [
    "https://aleksey341.github.io",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
  ];
  const configured = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : defaults;
  const origin = String(req.headers.origin || "");
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

export function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function requireManagedAccess(req, res) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const code = match ? match[1].trim() : "";
  const user = resolveAccessUser(code);
  if (!user) {
    res.status(401).json({ error: "Неверный или отключённый код доступа HR Помощник" });
    return false;
  }
  req.hrPomoshnikUser = user;
  return true;
}

export function enforceRateLimit(req, res, bucket, limit, windowMs = 60_000) {
  const user = String(req.hrPomoshnikUser || "anonymous");
  const key = `${bucket}:${user}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const previous = RATE_BUCKETS.get(key) || [];
  const recent = previous.filter((ts) => ts > cutoff);
  if (recent.length >= limit) {
    const retryMs = Math.max(1000, windowMs - (now - recent[0]));
    res.setHeader("Retry-After", String(Math.ceil(retryMs / 1000)));
    res.status(429).json({ error: "Слишком много запросов. Повторите позже." });
    RATE_BUCKETS.set(key, recent);
    return false;
  }
  recent.push(now);
  RATE_BUCKETS.set(key, recent);
  return true;
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}

function cleanStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => String(item || "").trim().slice(0, maxLength))
    .filter(Boolean);
}

export function sanitizeFirecrawlBody(kind, incoming) {
  const body = incoming && typeof incoming === "object" ? incoming : {};

  if (kind === "search") {
    const out = {
      query: String(body.query || "").trim().slice(0, 500),
      limit: clampInt(body.limit, 5, 1, 50),
    };
    const includeDomains = cleanStringList(body.includeDomains, 20, 255);
    if (includeDomains.length) out.includeDomains = includeDomains;
    if (body.tbs) out.tbs = String(body.tbs).slice(0, 200);
    if (Array.isArray(body.sources)) out.sources = body.sources.slice(0, 3);
    if (body.scrapeOptions) out.scrapeOptions = { formats: ["markdown"] };
    return out;
  }

  if (kind === "scrape") {
    return {
      url: String(body.url || "").trim().slice(0, 4096),
      formats: cleanStringList(body.formats, 3, 32).filter((x) => ["markdown", "links", "html"].includes(x)),
    };
  }

  if (kind === "crawl") {
    const out = {
      url: String(body.url || "").trim().slice(0, 4096),
      limit: clampInt(body.limit, 50, 1, 100),
      maxDiscoveryDepth: clampInt(body.maxDiscoveryDepth, 3, 1, 6),
      crawlEntireDomain: Boolean(body.crawlEntireDomain),
    };
    const includePaths = cleanStringList(body.includePaths, 50, 500);
    const excludePaths = cleanStringList(body.excludePaths, 50, 500);
    if (includePaths.length) out.includePaths = includePaths;
    if (excludePaths.length) out.excludePaths = excludePaths;
    if (body.scrapeOptions) out.scrapeOptions = { formats: ["markdown"] };
    return out;
  }

  return {};
}

export function requireEnv(name, res) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    res.status(503).json({ error: `Managed service is missing ${name}` });
    return "";
  }
  return value;
}

export async function proxyJson({ url, method = "POST", apiKey, body }) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const options = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  try {
    const upstream = await fetch(url, options);
    const text = await upstream.text();
    return {
      status: upstream.status,
      text,
      contentType: upstream.headers.get("content-type") || "application/json",
    };
  } catch (_error) {
    return {
      status: 502,
      text: JSON.stringify({ error: "Managed service could not reach upstream API" }),
      contentType: "application/json",
    };
  }
}

export function sendProxyResponse(res, result) {
  res.status(result.status);
  res.setHeader("Content-Type", result.contentType || "application/json; charset=utf-8");
  return res.send(result.text);
}
