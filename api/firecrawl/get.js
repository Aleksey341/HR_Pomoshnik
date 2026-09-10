import { FIRECRAWL_API, applyCors, handlePreflight, proxyJson, requireEnv, requireManagedAccess, sendProxyResponse } from "../_lib/managed.js";

function resolveTarget(req) {
  const nextUrl = String(req.query?.next || "").trim();
  const path = String(req.query?.path || "").trim();
  if (nextUrl) {
    if (!nextUrl.startsWith(FIRECRAWL_API)) return "";
    return nextUrl;
  }
  if (!path || !path.startsWith("/")) return "";
  return `${FIRECRAWL_API}${path}`;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireManagedAccess(req, res)) return;
  const apiKey = requireEnv("FIRECRAWL_API_KEY", res);
  if (!apiKey) return;
  const url = resolveTarget(req);
  if (!url) return res.status(400).json({ error: "Некорректный URL Firecrawl" });
  const result = await proxyJson({ url, method: "GET", apiKey });
  return sendProxyResponse(res, result);
}
