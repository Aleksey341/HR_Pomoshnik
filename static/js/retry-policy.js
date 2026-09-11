const RATE_LIMIT_RE = /rate\s*limit|too many requests|слишком много запросов|429/i;
const CREDIT_RE = /credit|credits|balance|insufficient|payment required|кредит|кредиты|баланс/i;

export function classifyApiFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '');
  if (status === 429 || RATE_LIMIT_RE.test(message)) return 'rate_limit';
  if (status === 402 || CREDIT_RE.test(message)) return 'credits';
  return 'other';
}

export function shouldRetryRateLimit(error, attempt, maxRetries = 4) {
  return classifyApiFailure(error) === 'rate_limit' && Number(attempt || 0) < maxRetries;
}

export function retryDelayMs(error, attempt = 0) {
  const retryAfterSeconds = Number(error?.retryAfterSeconds);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(1_000, Math.min(75_000, Math.ceil(retryAfterSeconds * 1_000) + 250));
  }

  // Firecrawl Free commonly allows only a small burst of search requests per minute.
  // A one-minute fallback avoids immediately failing the rest of a long research run.
  const fallback = Number(attempt || 0) === 0 ? 60_000 : 30_000;
  return fallback + 250;
}

export function waitSeconds(delayMs) {
  return Math.max(1, Math.ceil(Number(delayMs || 0) / 1_000));
}
