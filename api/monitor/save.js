import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { monitorSummary, saveMonitor } from "../_lib/monitor-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
