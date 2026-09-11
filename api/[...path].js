import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "./_lib/managed.js";
import { listAll, storageErrorMessage, storageUserKey } from "./_lib/blob-store.js";
import { estimatedCost, getUsageSummary, quotaForUser } from "./_lib/usage.js";
import { deleteResearch, getResearch, listResearch, saveResearch } from "./_lib/research-store.js";
import { deleteMonitor, getMonitor, listAllMonitors, listMonitors, monitorSummary, saveMonitor } from "./_lib/monitor-store.js";
import { runMonitor } from "./_lib/monitor-runner.js";

function routePath(req) {
  const value = req.query?.path;
  return (Array.isArray(value) ? value : [value]).filter(Boolean).join("/");
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

function remaining(limits, usage) {
  const out = {};
  for (const [key, limit] of Object.entries(limits || {})) {
    const used = Number(usage?.[key] || 0);
    out[key] = Math.max(0, Number(limit) - used);
  }
  return out;
}

async function usageMe(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "usage-me", 60)) return;

  const user = req.hrPomoshnikUser;
  const summary = await getUsageSummary(user);
  const usage = { ...(summary.usage || {}) };
  if (summary.centralized) {
    const key = storageUserKey(user);
    try {
      const [research, monitors] = await Promise.all([
        listAll(`research/${key}/`),
        listAll(`monitors/${key}/`),
      ]);
      usage.saved_researches = research.length;
      usage.monitors = monitors.length;
    } catch (_error) {
      // Secondary counts do not block the ledger.
    }
  }
  const { plan, limits } = quotaForUser(user);
  return res.status(200).json({
    ok: true,
    user,
    plan,
    month: summary.month,
    centralized: summary.centralized,
    usage,
    limits,
    remaining: remaining(limits, usage),
    estimated_cost_usd: estimatedCost({ ...summary, usage }),
  });
}

async function researchList(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "research-list", 30)) return;
  try {
    return res.status(200).json({ ok: true, items: await listResearch(req.hrPomoshnikUser) });
  } catch (error) {
    return res.status(503).json({ error: "Серверная история недоступна", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function researchGet(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "research-get", 60)) return;
  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Не указан id исследования" });
  try {
    const item = await getResearch(req.hrPomoshnikUser, id);
    if (!item) return res.status(404).json({ error: "Исследование не найдено" });
    return res.status(200).json({ ok: true, item });
  } catch (error) {
    return res.status(503).json({ error: "Серверная история недоступна", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function researchSave(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "research-save", 20)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!Array.isArray(body?.payload?.items) || !body.payload.items.length) {
    return res.status(400).json({ error: "Нет источников для сохранения" });
  }
  try {
    const item = await saveResearch(req.hrPomoshnikUser, body);
    return res.status(200).json({
      ok: true,
      item: {
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceCount: item.payload?.items?.length || 0,
        hasAiReport: Boolean(item.aiReport),
        qualityScore: Number(item.quality?.score || 0) || null,
      },
    });
  } catch (error) {
    if (error?.code === "RESEARCH_QUOTA") return res.status(429).json({ error: error.message, code: error.code });
    return res.status(503).json({ error: "Не удалось сохранить исследование на сервере", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function researchDelete(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "research-delete", 20)) return;
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Не указан id исследования" });
  try {
    await deleteResearch(req.hrPomoshnikUser, id);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(503).json({ error: "Не удалось удалить исследование", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function monitorList(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "monitor-list", 30)) return;
  try {
    const items = await listMonitors(req.hrPomoshnikUser);
    return res.status(200).json({ ok: true, items: items.map(monitorSummary) });
  } catch (error) {
    return res.status(503).json({ error: "Серверный мониторинг недоступен", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function monitorSave(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "monitor-save", 20)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const item = await saveMonitor(req.hrPomoshnikUser, body);
    return res.status(200).json({ ok: true, item: monitorSummary(item) });
  } catch (error) {
    if (["MONITOR_QUOTA", "MONITOR_QUERIES"].includes(error?.code)) {
      return res.status(error.code === "MONITOR_QUOTA" ? 429 : 400).json({ error: error.message, code: error.code });
    }
    return res.status(503).json({ error: "Не удалось сохранить мониторинг", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function monitorDelete(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "monitor-delete", 20)) return;
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Не указан id мониторинга" });
  try {
    await deleteMonitor(req.hrPomoshnikUser, id);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(503).json({ error: "Не удалось удалить мониторинг", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}

async function monitorRun(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "monitor-run", 4, 10 * 60_000)) return;
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Не указан id мониторинга" });
  try {
    const monitor = await getMonitor(req.hrPomoshnikUser, id);
    if (!monitor) return res.status(404).json({ error: "Мониторинг не найден" });
    const result = await runMonitor(req.hrPomoshnikUser, monitor, "manual");
    return res.status(200).json({ ok: true, run: result.run, monitor: monitorSummary(result.monitor) });
  } catch (error) {
    if (error?.code === "MONITOR_USAGE_QUOTA") {
      return res.status(429).json({ error: error.message, code: error.code, exceeded: error.details || [] });
    }
    return res.status(503).json({ error: "Не удалось выполнить мониторинг", detail: storageErrorMessage(error) });
  }
}

async function cronMonitor(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return res.status(503).json({ error: "CRON_SECRET is not configured" });
  if (String(req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized cron request" });

  try {
    const now = Date.now();
    const all = await listAllMonitors();
    const due = all
      .filter((monitor) => monitor.active && monitor.owner && new Date(monitor.nextRunAt || 0).getTime() <= now)
      .sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
      .slice(0, 3);
    const results = [];
    for (const monitor of due) {
      try {
        const result = await runMonitor(monitor.owner, monitor, "cron");
        results.push({ id: monitor.id, ok: true, counts: result.run.counts });
      } catch (error) {
        results.push({ id: monitor.id, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }
    return res.status(200).json({ ok: true, due: due.length, results });
  } catch (error) {
    return res.status(503).json({ error: "Monitor scheduler unavailable", detail: String(error?.message || error).slice(0, 300) });
  }
}

const ROUTES = {
  "usage/me": usageMe,
  "research/list": researchList,
  "research/get": researchGet,
  "research/save": researchSave,
  "research/delete": researchDelete,
  "monitor/list": monitorList,
  "monitor/save": monitorSave,
  "monitor/delete": monitorDelete,
  "monitor/run": monitorRun,
  "cron/monitor": cronMonitor,
};

export default async function handler(req, res) {
  const path = routePath(req);
  if (path !== "cron/monitor") {
    if (handlePreflight(req, res)) return;
    applyCors(req, res);
  }
  const route = ROUTES[path];
  if (!route) return res.status(404).json({ error: "Unknown API route" });
  return route(req, res);
}
