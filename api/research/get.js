import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { getResearch } from "../_lib/research-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
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
