import { applyCors, handlePreflight } from "./_lib/managed.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);
  return res.status(200).json({
    ok: true,
    service: "HR Pomoshnik managed gateway",
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    firecrawl_configured: Boolean(process.env.FIRECRAWL_API_KEY),
    access_codes_configured: Boolean(process.env.MANAGED_ACCESS_CODE_HASHES),
  });
}
