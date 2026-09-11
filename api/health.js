import { applyCors, handlePreflight } from "./_lib/managed.js";
import { probePrivateStore } from "./_lib/blob-store.js";

function configuredUserCount() {
  const raw = String(process.env.MANAGED_ACCESS_USERS_JSON || "").trim();
  if (!raw) return 0;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) => item?.enabled !== false && item?.user && item?.hash
      ).length;
    }
    if (parsed && typeof parsed === "object") {
      return Object.keys(parsed).length;
    }
  } catch (_error) {
    return 0;
  }

  return 0;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  const namedUsers = configuredUserCount();
  const legacyConfigured = Boolean(process.env.MANAGED_ACCESS_CODE_HASHES);
  const serverStorageReady = await probePrivateStore();

  return res.status(200).json({
    ok: true,
    service: "HR Pomoshnik managed gateway",
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    firecrawl_configured: Boolean(process.env.FIRECRAWL_API_KEY),
    openai_model_configured: Boolean(process.env.OPENAI_MODEL),
    access_codes_configured: namedUsers > 0 || legacyConfigured,
    named_users_configured: namedUsers,
    server_storage_ready: serverStorageReady,
    usage_ledger_mode: serverStorageReady ? "centralized" : "runtime-fallback",
    cron_configured: Boolean(process.env.CRON_SECRET),
    recurring_monitoring_ready: serverStorageReady && Boolean(process.env.CRON_SECRET),
    admin_login_configured: Boolean(process.env.ADMIN_ACCESS_CODE_HASH),
    admin_automation_configured: Boolean(process.env.VERCEL_API_TOKEN),
    vercel_environment: process.env.VERCEL_ENV || null,
  });
}
