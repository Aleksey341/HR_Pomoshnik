import crypto from "node:crypto";
import { deleteBlob, readJson, storageUserKey, writeJson } from "./blob-store.js";
import { quotaForUser } from "./usage.js";

const MAX_SOURCES = 500;
const MAX_MARKDOWN = 12_000;
const MAX_REPORT = 220_000;
const MAX_VARIANT = 120_000;

function safeId(value) {
  const raw = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(raw)) return raw;
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function text(value, limit) {
  return String(value || "").slice(0, limit);
}

function cleanItem(item, index) {
  const sourceId = String(item?.sourceId || `S${String(index + 1).padStart(3, "0")}`).slice(0, 24);
  return {
    sourceId,
    title: text(item?.title, 1000),
    url: text(item?.url, 4096),
    sourceURL: text(item?.sourceURL, 4096),
    description: text(item?.description, 4000),
    snippet: text(item?.snippet, 4000),
    searchKeyword: text(item?.searchKeyword, 1000),
    markdown: text(item?.markdown || item?.content, MAX_MARKDOWN),
    publishedDate: text(item?.publishedDate || item?.published_at || item?.date, 100),
  };
}

function cleanMeta(meta) {
  const source = meta && typeof meta === "object" ? meta : {};
  return {
    mode: text(source.mode, 40),
    researchBrief: text(source.researchBrief, 40_000),
    keywordsUsed: Number(source.keywordsUsed || 0) || undefined,
    queriesRun: Number(source.queriesRun || 0) || undefined,
    ms: Number(source.ms || 0) || undefined,
    limit: Number(source.limit || 0) || undefined,
    domains: Array.isArray(source.domains) ? source.domains.slice(0, 50).map((x) => text(x, 255)) : undefined,
    researchQueries: Array.isArray(source.researchQueries) ? source.researchQueries.slice(0, 100).map((x) => text(x, 500)) : undefined,
    dateFrom: text(source.dateFrom, 40),
    broad: Boolean(source.broad),
    processName: text(source.processName, 500),
    processAsIs: text(source.processAsIs, 40_000),
    processProblems: text(source.processProblems, 20_000),
    processGoals: text(source.processGoals, 20_000),
    processScale: text(source.processScale, 2000),
    processGeography: text(source.processGeography, 40),
    processGeographyLabel: text(source.processGeographyLabel, 200),
    processResearchQuestions: Array.isArray(source.processResearchQuestions)
      ? source.processResearchQuestions.slice(0, 20).map((x) => text(x, 1000))
      : undefined,
    processPlanSummary: text(source.processPlanSummary, 6000),
    gapQueriesRun: Number(source.gapQueriesRun || 0) || undefined,
    gapSourcesAdded: Number(source.gapSourcesAdded || 0) || undefined,
  };
}

function cleanVariants(variants) {
  const out = {};
  if (!variants || typeof variants !== "object") return out;
  for (const key of ["executive", "full", "presentation"]) {
    if (variants[key]) out[key] = text(variants[key], MAX_VARIANT);
  }
  return out;
}

function cleanResearch(entry, user, existing = null) {
  const now = new Date().toISOString();
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const items = Array.isArray(payload.items) ? payload.items.slice(0, MAX_SOURCES).map(cleanItem) : [];
  const id = safeId(entry?.id || existing?.id);
  return {
    version: 2,
    id,
    ownerKey: storageUserKey(user),
    title: text(entry?.title || payload.title || "Исследование", 300),
    brief: text(entry?.brief || payload?.meta?.researchBrief, 40_000),
    createdAt: existing?.createdAt || text(entry?.createdAt, 80) || now,
    updatedAt: now,
    payload: {
      title: text(payload.title || entry?.title || "Исследование", 300),
      meta: cleanMeta(payload.meta),
      items,
    },
    aiReport: text(entry?.aiReport, MAX_REPORT),
    reportVariants: cleanVariants(entry?.reportVariants),
    quality: entry?.quality && typeof entry.quality === "object" ? entry.quality : null,
    monitorId: text(entry?.monitorId, 80) || null,
  };
}

function indexPath(user) {
  return `research-index/${storageUserKey(user)}.json`;
}

function itemPath(user, id) {
  return `research/${storageUserKey(user)}/${id}.json`;
}

async function readIndex(user) {
  const value = await readJson(indexPath(user), { version: 1, items: [] });
  return {
    version: 1,
    items: Array.isArray(value?.items) ? value.items : [],
  };
}

async function writeIndex(user, items) {
  await writeJson(indexPath(user), { version: 1, updatedAt: new Date().toISOString(), items: items.slice(0, 1000) });
}

function summary(entry) {
  return {
    id: entry.id,
    title: entry.title,
    brief: text(entry.brief, 1200),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    sourceCount: entry.payload?.items?.length || 0,
    hasAiReport: Boolean(entry.aiReport),
    qualityScore: Number(entry.quality?.score || 0) || null,
    monitorId: entry.monitorId || null,
  };
}

export async function listResearch(user) {
  const index = await readIndex(user);
  return index.items.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function getResearch(user, id) {
  const safe = safeId(id);
  if (safe !== String(id || "")) return null;
  return readJson(itemPath(user, safe), null);
}

export async function saveResearch(user, entry) {
  const requestedId = String(entry?.id || "").trim();
  const existing = requestedId ? await getResearch(user, requestedId) : null;
  const index = await readIndex(user);
  if (!existing) {
    const limit = quotaForUser(user).limits.saved_researches;
    if (Number.isFinite(limit) && index.items.length >= limit) {
      const error = new Error(`Достигнут лимит сохранённых исследований: ${limit}`);
      error.code = "RESEARCH_QUOTA";
      throw error;
    }
  }

  const clean = cleanResearch(entry, user, existing);
  await writeJson(itemPath(user, clean.id), clean);
  const next = index.items.filter((item) => item.id !== clean.id);
  next.unshift(summary(clean));
  await writeIndex(user, next);
  return clean;
}

export async function deleteResearch(user, id) {
  const safe = safeId(id);
  if (safe !== String(id || "")) return false;
  const index = await readIndex(user);
  await deleteBlob(itemPath(user, safe));
  await writeIndex(user, index.items.filter((item) => item.id !== safe));
  return true;
}
