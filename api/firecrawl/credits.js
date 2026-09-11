import {
  FIRECRAWL_API,
  applyCors,
  enforceRateLimit,
  handlePreflight,
  requireEnv,
  requireManagedAccess,
} from "../_lib/managed.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "firecrawl-credits", 20)) return;

  const apiKey = requireEnv("FIRECRAWL_API_KEY", res);
  if (!apiKey) return;

  try {
    const upstream = await fetch(`${FIRECRAWL_API}/team/credit-usage`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok || json?.success === false) {
      return res.status(upstream.status || 502).json({
        error: json?.error || json?.message || "Не удалось получить баланс Firecrawl",
      });
    }
    const data = json?.data || {};
    return res.status(200).json({
      ok: true,
      remainingCredits: Number(data.remainingCredits || 0),
      planCredits: Number(data.planCredits || 0),
      billingPeriodStart: data.billingPeriodStart || null,
      billingPeriodEnd: data.billingPeriodEnd || null,
    });
  } catch (_error) {
    return res.status(502).json({ error: "Не удалось получить баланс Firecrawl" });
  }
}
