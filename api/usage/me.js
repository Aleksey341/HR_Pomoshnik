import { applyCors, handlePreflight, requireManagedAccess } from "../_lib/managed.js";
import { listAll, storageUserKey } from "../_lib/blob-store.js";
import { estimatedCost, getUsageSummary, quotaForUser } from "../_lib/usage.js";

function remaining(limits, usage) {
  const out = {};
  for (const [key, limit] of Object.entries(limits || {})) {
    const used = Number(usage?.[key] || 0);
    out[key] = Math.max(0, Number(limit) - used);
  }
  return out;
}

async function addResourceCounts(user, summary) {
  const usage = { ...(summary.usage || {}) };
  if (!summary.centralized) return usage;
  const key = storageUserKey(user);
  try {
    const [research, monitors] = await Promise.all([
      listAll(`research/${key}/`),
      listAll(`monitors/${key}/`),
    ]);
    usage.saved_researches = research.length;
    usage.monitors = monitors.length;
  } catch (_error) {
    // Usage ledger remains usable even when a secondary resource count fails.
  }
  return usage;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;

  const user = req.hrPomoshnikUser;
  const summary = await getUsageSummary(user);
  const usage = await addResourceCounts(user, summary);
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
