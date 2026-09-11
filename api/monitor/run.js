import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { getMonitor, monitorSummary } from "../_lib/monitor-store.js";
import { runMonitor } from "../_lib/monitor-runner.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
