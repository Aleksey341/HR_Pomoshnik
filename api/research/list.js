import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { listResearch } from "../_lib/research-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "research-list", 30)) return;
  try {
    const items = await listResearch(req.hrPomoshnikUser);
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    return res.status(503).json({ error: "Серверная история недоступна", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}
