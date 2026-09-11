import crypto from "node:crypto";
import { deleteBlob, listAll, readJson, storageUserKey, writeJson } from "./blob-store.js";
import { quotaForUser } from "./usage.js";

const CADENCES = new Set(["daily", "weekly", "monthly"]);

function safeId(value) {
  const raw = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(raw)) return raw;
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function monitorPath(user, id) {
  return `monitors/${storageUserKey(user)}/${id}.json`;
}

function nextRun(cadence, from = new Date()) {
  const date = new Date(from);
  if (cadence === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (cadence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCHours(6, 0, 0, 0);
  return date.toISOString();
}

function cleanList(value, max, len) {
  return Array.isArray(value)
    ? value.slice(0, max).map((item) => String(item || "").trim().slice(0, len)).filter(Boolean)
    : [];
}

function cleanDefinition(user, incoming, existing = null) {
  const now = new Date().toISOString();
  const cadence = CADENCES.has(incoming?.cadence) ? incoming.cadence : "monthly";
  const id = safeId(incoming?.id || existing?.id);
  return {
    version: 1,
    id,
    owner: String(user),
    ownerKey: storageUserKey(user),
    title: String(incoming?.title || existing?.title || "HR мониторинг").slice(0, 300),
    brief: String(incoming?.brief || existing?.brief || "").slice(0, 40_000),
    queries: cleanList(incoming?.queries?.length ? incoming.queries : existing?.queries, 30, 500),
    domains: cleanList(incoming?.domains?.length ? incoming.domains : existing?.domains, 20, 255),
    cadence,
    active: incoming?.active !== false,
    settings: {
      limit: Math.max(1, Math.min(Number(incoming?.settings?.limit ?? existing?.settings?.limit ?? 10), 20)),
      scrape: Boolean(incoming?.settings?.scrape ?? existing?.settings?.scrape),
      broad: Boolean(incoming?.settings?.broad ?? existing?.settings?.broad),
      dateFrom: String(incoming?.settings?.dateFrom ?? existing?.settings?.dateFrom ?? "").slice(0, 20),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    nextRunAt: incoming?.nextRunAt || existing?.nextRunAt || nextRun(cadence, new Date()),
    lastRunAt: existing?.lastRunAt || null,
    lastCounts: existing?.lastCounts || null,
    lastSummary: existing?.lastSummary || "",
    lastRunId: existing?.lastRunId || null,
    snapshot: existing?.snapshot || [],
  };
}

export async function listMonitors(user) {
  const blobs = await listAll(`monitors/${storageUserKey(user)}/`);
  const rows = [];
  for (const blob of blobs) {
    const item = await readJson(blob.pathname, null);
    if (item) rows.push(item);
  }
  return rows.sort((a, b) => String(a.nextRunAt || "").localeCompare(String(b.nextRunAt || "")));
}

export async function listAllMonitors() {
  const blobs = await listAll("monitors/");
  const rows = [];
  for (const blob of blobs) {
    const item = await readJson(blob.pathname, null);
    if (item) rows.push(item);
  }
  return rows;
}

export async function getMonitor(user, id) {
  const raw = String(id || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(raw)) return null;
  return readJson(monitorPath(user, raw), null);
}

export async function saveMonitor(user, incoming) {
  const requestedId = String(incoming?.id || "").trim();
  const existing = requestedId ? await getMonitor(user, requestedId) : null;
  if (!existing) {
    const monitors = await listMonitors(user);
    const limit = quotaForUser(user).limits.monitors;
    if (Number.isFinite(limit) && monitors.length >= limit) {
      const error = new Error(`Достигнут лимит мониторингов: ${limit}`);
      error.code = "MONITOR_QUOTA";
      throw error;
    }
  }
  const clean = cleanDefinition(user, incoming || {}, existing);
  if (!clean.queries.length) {
    const error = new Error("Для мониторинга нужен хотя бы один поисковый запрос");
    error.code = "MONITOR_QUERIES";
    throw error;
  }
  await writeJson(monitorPath(user, clean.id), clean);
  return clean;
}

export async function writeMonitor(user, monitor) {
  await writeJson(monitorPath(user, monitor.id), monitor);
  return monitor;
}

export async function deleteMonitor(user, id) {
  const item = await getMonitor(user, id);
  if (!item) return false;
  await deleteBlob(monitorPath(user, item.id));
  return true;
}

export function scheduleNext(monitor, from = new Date()) {
  return nextRun(monitor.cadence, from);
}

export function monitorSummary(monitor) {
  return {
    id: monitor.id,
    title: monitor.title,
    cadence: monitor.cadence,
    active: monitor.active,
    nextRunAt: monitor.nextRunAt,
    lastRunAt: monitor.lastRunAt,
    lastCounts: monitor.lastCounts,
    lastSummary: monitor.lastSummary,
    lastRunId: monitor.lastRunId,
    queryCount: monitor.queries?.length || 0,
    domainCount: monitor.domains?.length || 0,
  };
}
