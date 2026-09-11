import crypto from "node:crypto";
import { listAll, storageUserKey, writeJson } from "./blob-store.js";

const FALLBACK = globalThis.__HRP_USAGE_FALLBACK__ || new Map();
globalThis.__HRP_USAGE_FALLBACK__ = FALLBACK;

const PLAN_LIMITS = {
  demo: {
    search_requests: 50,
    firecrawl_units: 1000,
    crawl_pages: 300,
    ai_calls: 40,
    ai_input_chars: 1_500_000,
    ai_output_tokens: 60_000,
    saved_researches: 10,
    monitors: 3,
  },
  standard: {
    search_requests: 500,
    firecrawl_units: 10_000,
    crawl_pages: 5_000,
    ai_calls: 400,
    ai_input_chars: 15_000_000,
    ai_output_tokens: 600_000,
    saved_researches: 100,
    monitors: 20,
  },
  owner: {
    search_requests: 10_000,
    firecrawl_units: 250_000,
    crawl_pages: 100_000,
    ai_calls: 10_000,
    ai_input_chars: 500_000_000,
    ai_output_tokens: 20_000_000,
    saved_researches: 1000,
    monitors: 200,
  },
};

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function configuredProfile(user) {
  const raw = String(process.env.MANAGED_ACCESS_USERS_JSON || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([name, value]) => (
          typeof value === "string" ? { user: name, hash: value } : { user: name, ...(value || {}) }
        ));
    return rows.find((item) => String(item?.user || "").trim() === user) || {};
  } catch (_error) {
    return {};
  }
}

export function quotaForUser(user) {
  const profile = configuredProfile(user);
  const plan = String(profile.plan || process.env.HRP_DEFAULT_PLAN || "standard").toLowerCase();
  const base = PLAN_LIMITS[plan] || PLAN_LIMITS.standard;
  const override = profile.quota && typeof profile.quota === "object" ? profile.quota : {};
  const limits = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) limits[key] = Math.trunc(number);
  }
  return { plan: PLAN_LIMITS[plan] ? plan : "standard", limits };
}

function normalizeDelta(delta) {
  const out = {};
  for (const [key, value] of Object.entries(delta || {})) {
    const safeKey = String(key).replace(/[^a-z0-9_]/gi, "").slice(0, 48);
    const number = Math.max(0, Math.trunc(Number(value) || 0));
    if (safeKey && number) out[safeKey] = number;
  }
  return out;
}

function eventPath(user, delta, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const nonce = crypto.randomBytes(5).toString("hex");
  const encoded = Object.entries(normalizeDelta(delta))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("__");
  return `usage/${storageUserKey(user)}/${monthKey(now)}/${stamp}_${nonce}_${encoded || "event=1"}.json`;
}

function parseEventPath(pathname) {
  const base = String(pathname || "").split("/").pop() || "";
  const payload = base.replace(/\.json$/i, "").split("_").slice(2).join("_");
  const out = {};
  for (const part of payload.split("__")) {
    const [key, raw] = part.split("=");
    const value = Number(raw);
    if (key && Number.isFinite(value)) out[key] = (out[key] || 0) + value;
  }
  return out;
}

function mergeUsage(target, delta) {
  for (const [key, value] of Object.entries(delta || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
  return target;
}

function fallbackKey(user, month = monthKey()) {
  return `${storageUserKey(user)}:${month}`;
}

function fallbackSummary(user, month = monthKey()) {
  return { ...(FALLBACK.get(fallbackKey(user, month)) || {}) };
}

function recordFallback(user, delta, month = monthKey()) {
  const key = fallbackKey(user, month);
  const next = fallbackSummary(user, month);
  mergeUsage(next, normalizeDelta(delta));
  FALLBACK.set(key, next);
  return next;
}

export async function getUsageSummary(user, month = monthKey()) {
  const prefix = `usage/${storageUserKey(user)}/${month}/`;
  try {
    const blobs = await listAll(prefix);
    const totals = {};
    for (const blob of blobs) mergeUsage(totals, parseEventPath(blob.pathname));
    return { month, usage: totals, centralized: true, events: blobs.length };
  } catch (_error) {
    const usage = fallbackSummary(user, month);
    return { month, usage, centralized: false, events: null };
  }
}

export async function recordUsage(user, delta, meta = {}) {
  const clean = normalizeDelta(delta);
  if (!Object.keys(clean).length) return { centralized: false };
  const path = eventPath(user, clean);
  try {
    await writeJson(path, {
      user_key: storageUserKey(user),
      created_at: new Date().toISOString(),
      delta: clean,
      meta: {
        kind: String(meta.kind || "").slice(0, 80),
        status: Number(meta.status || 0) || undefined,
        model: String(meta.model || "").slice(0, 80) || undefined,
      },
    });
    return { centralized: true, path };
  } catch (_error) {
    recordFallback(user, clean);
    return { centralized: false };
  }
}

export async function checkMonthlyQuota(user, requested = {}) {
  const { plan, limits } = quotaForUser(user);
  const summary = await getUsageSummary(user);
  const clean = normalizeDelta(requested);
  const exceeded = [];
  for (const [metric, amount] of Object.entries(clean)) {
    const limit = limits[metric];
    if (!Number.isFinite(limit)) continue;
    const used = Number(summary.usage[metric] || 0);
    if (used + amount > limit) exceeded.push({ metric, used, requested: amount, limit });
  }
  return { ...summary, plan, limits, requested: clean, exceeded };
}

export async function enforceMonthlyQuota(req, res, requested) {
  const user = String(req.hrPomoshnikUser || "anonymous");
  const result = await checkMonthlyQuota(user, requested);
  if (!result.exceeded.length) {
    req.hrUsageQuota = result;
    return true;
  }
  return res.status(429).json({
    error: "Исчерпан месячный лимит HR Помощника",
    plan: result.plan,
    month: result.month,
    exceeded: result.exceeded,
    usage: result.usage,
    limits: result.limits,
  }), false;
}

export function estimatedCost(summary) {
  const usage = summary?.usage || {};
  const inputRate = Number(process.env.HRP_OPENAI_INPUT_PER_MILLION_USD || 0);
  const outputRate = Number(process.env.HRP_OPENAI_OUTPUT_PER_MILLION_USD || 0);
  const firecrawlRate = Number(process.env.HRP_FIRECRAWL_UNIT_USD || 0);
  if (![inputRate, outputRate, firecrawlRate].some((value) => value > 0)) return null;
  const promptTokens = Number(usage.ai_prompt_tokens || Math.ceil(Number(usage.ai_input_chars || 0) / 4));
  const outputTokens = Number(usage.ai_output_tokens || 0);
  const firecrawlUnits = Number(usage.firecrawl_units || 0);
  return Number((promptTokens / 1_000_000 * inputRate + outputTokens / 1_000_000 * outputRate + firecrawlUnits * firecrawlRate).toFixed(4));
}
