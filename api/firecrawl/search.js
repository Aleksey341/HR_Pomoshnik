import { FIRECRAWL_API, applyCors, handlePreflight, proxyJson, requireEnv, requireManagedAccess, sendProxyResponse } from "../_lib/managed.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  const apiKey = requireEnv("FIRECRAWL_API_KEY", res);
  if (!apiKey) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const result = await proxyJson({ url: `${FIRECRAWL_API}/search`, apiKey, body });
  return sendProxyResponse(res, result);
}
