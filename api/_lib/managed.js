import crypto from "node:crypto";

export const FIRECRAWL_API = "https://api.firecrawl.dev/v2";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHexEqual(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function configuredHashes() {
  return (process.env.MANAGED_ACCESS_CODE_HASHES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedAccessCode(code) {
  const hashes = configuredHashes();
  if (!code || hashes.length === 0) return false;
  const digest = sha256(code);
  return hashes.some((allowed) => safeHexEqual(digest, allowed));
}

export function applyCors(req, res) {
  const defaults = [
    "https://aleksey341.github.io",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
  ];
  const configured = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : defaults;
  const origin = String(req.headers.origin || "");
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

export function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function requireManagedAccess(req, res) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const code = match ? match[1].trim() : "";
  if (!isAllowedAccessCode(code)) {
    res.status(401).json({ error: "Неверный или отключённый код доступа HR Помощник" });
    return false;
  }
  return true;
}

export function requireEnv(name, res) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    res.status(503).json({ error: `Managed service is missing ${name}` });
    return "";
  }
  return value;
}

export async function proxyJson({ url, method = "POST", apiKey, body }) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const options = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  try {
    const upstream = await fetch(url, options);
    const text = await upstream.text();
    return { status: upstream.status, text, contentType: upstream.headers.get("content-type") || "application/json" };
  } catch (_error) {
    return {
      status: 502,
      text: JSON.stringify({ error: "Managed service could not reach upstream API" }),
      contentType: "application/json",
    };
  }
}

export function sendProxyResponse(res, result) {
  res.status(result.status);
  res.setHeader("Content-Type", result.contentType || "application/json; charset=utf-8");
  return res.send(result.text);
}
