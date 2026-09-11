import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { deleteMonitor } from "../_lib/monitor-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
