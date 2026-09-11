import { listAllMonitors } from "../_lib/monitor-store.js";
import { runMonitor } from "../_lib/monitor-runner.js";

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET is not configured" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized cron request" });

  const now = Date.now();
  try {
    const all = await listAllMonitors();
    const due = all
      .filter((monitor) => monitor.active && monitor.owner && new Date(monitor.nextRunAt || 0).getTime() <= now)
      .sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
      .slice(0, 3);

    const results = [];
    for (const monitor of due) {
      try {
        const result = await runMonitor(monitor.owner, monitor, "cron");
        results.push({ id: monitor.id, ok: true, counts: result.run.counts });
      } catch (error) {
        results.push({ id: monitor.id, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }
    return res.status(200).json({ ok: true, due: due.length, results });
  } catch (error) {
    return res.status(503).json({ error: "Monitor scheduler unavailable", detail: String(error?.message || error).slice(0, 300) });
  }
}
