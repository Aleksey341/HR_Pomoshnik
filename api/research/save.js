import { applyCors, enforceRateLimit, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { saveResearch } from "../_lib/research-store.js";
import { storageErrorMessage } from "../_lib/blob-store.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
    if (error?.code === "RESEARCH_QUOTA") {
      return res.status(429).json({ error: error.message, code: error.code });
    }
    return res.status(503).json({ error: "Не удалось сохранить исследование на сервере", code: "SERVER_STORAGE_UNAVAILABLE", detail: storageErrorMessage(error) });
  }
}
