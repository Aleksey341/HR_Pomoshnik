import { applyCors, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { estimatedCost, getUsageSummary, quotaForUser } from "../_lib/usage.js";

function remaining(limits, usage) {
  const out = {};
  for (const [key, limit] of Object.entries(limits || {})) {
    const used = Number(usage?.[key] || 0);
    out[key] = Math.max(0, Number(limit) - used);
  }
  return out;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;

  const user = req.hrPomoshnikUser;
  const summary = await getUsageSummary(user);
  const { plan, limits } = quotaForUser(user);
  return res.status(200).json({
    ok: true,
    user,
    plan,
    month: summary.month,
    centralized: summary.centralized,
    usage: summary.usage,
    limits,
    remaining: remaining(limits, summary.usage),
    estimated_cost_usd: estimatedCost(summary),
  });
}
