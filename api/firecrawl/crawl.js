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

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "firecrawl-crawl", 6, 10 * 60_000)) return;
  const apiKey = requireEnv("FIRECRAWL_API_KEY", res);
  if (!apiKey) return;
  const body = sanitizeFirecrawlBody("crawl", req.body);
  if (!/^https?:\/\//i.test(body.url)) return res.status(400).json({ error: "Некорректный URL" });
  const result = await proxyJson({ url: `${FIRECRAWL_API}/crawl`, apiKey, body });
  return sendProxyResponse(res, result);
}
