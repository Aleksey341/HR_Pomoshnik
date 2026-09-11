import {
  FIRECRAWL_API,
  applyCors,
  enforceRateLimit,
  handlePreflight,
  proxyJson,
  requireEnv,
  requireManagedAccess,
  sanitizeFirecrawlBody,
  sendProxyResponse,
} from "../_lib/managed.js";
import { enforceMonthlyQuota, recordUsage } from "../_lib/usage.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "firecrawl-search", 30)) return;
  const apiKey = requireEnv("FIRECRAWL_API_KEY", res);
  if (!apiKey) return;
  const body = sanitizeFirecrawlBody("search", req.body);
  if (!body.query) return res.status(400).json({ error: "Пустой поисковый запрос" });

  const delta = {
    search_requests: 1,
    firecrawl_units: body.scrapeOptions ? body.limit : 1,
  };
  if (!(await enforceMonthlyQuota(req, res, delta))) return;

  const result = await proxyJson({ url: `${FIRECRAWL_API}/search`, apiKey, body });
  if (result.status >= 200 && result.status < 300) {
    await recordUsage(req.hrPomoshnikUser, delta, { kind: "firecrawl-search", status: result.status });
  }
  return sendProxyResponse(res, result);
}
