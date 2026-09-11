import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { listMonitors, monitorSummary } from "../_lib/monitor-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "monitor-list", 30)) return;
  try {
    const items = await listMonitors(req.hrPomoshnikUser);
    return res.status(200).json({ ok: true, items: items.map(monitorSummary) });
  } catch (error) {
    return res.status(503).json({ error: "Серверный мониторинг недоступен", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}
