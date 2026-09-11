import crypto from "node:crypto";
import { FIRECRAWL_API } from "./managed.js";
import { writeJson, storageUserKey } from "./blob-store.js";
import { checkMonthlyQuota, recordUsage } from "./usage.js";
import { scheduleNext, writeMonitor } from "./monitor-store.js";

function normalizeItems(data) {
  if (Array.isArray(data)) return data;
  const out = [];
  for (const key of ["web", "news"]) {
    if (Array.isArray(data?.[key])) out.push(...data[key]);
  }
  return out;
}

function itemUrl(item) {
  return String(item?.url || item?.sourceURL || "").trim();
}

function itemHash(item) {
  const value = [item?.title, item?.description, item?.snippet, String(item?.markdown || item?.content || "").slice(0, 8000)].join("\n");
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 20);
}

function snapshot(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const url = itemUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url: url.slice(0, 4096),
      title: String(item?.title || "").slice(0, 1000),
      description: String(item?.description || item?.snippet || "").slice(0, 2500),
      hash: itemHash(item),
    });
    if (out.length >= 400) break;
  }
  return out;
}

function compareSnapshots(previous, current) {
  const oldMap = new Map((previous || []).map((item) => [item.url, item]));
  const newMap = new Map((current || []).map((item) => [item.url, item]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [url, item] of newMap) {
    if (!oldMap.has(url)) added.push(item);
    else if (oldMap.get(url)?.hash !== item.hash) changed.push({ before: oldMap.get(url), after: item });
  }
  for (const [url, item] of oldMap) if (!newMap.has(url)) removed.push(item);
  return { added, removed, changed };
}

function buildDateTbs(dateFromValue) {
  if (!dateFromValue) return undefined;
  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const yyyy = today.getUTCFullYear();
  const [y, m, d] = String(dateFromValue).split("-");
  if (!y || !m || !d) return undefined;
  return `cdr:1,cd_min:${m}/${d}/${y},cd_max:${mm}/${dd}/${yyyy}`;
}

async function searchOne(query, monitor, apiKey) {
  const body = {
    query: String(query).slice(0, 500),
    limit: Math.max(1, Math.min(Number(monitor.settings?.limit || 10), 20)),
    sources: ["web"],
  };
  if (monitor.settings?.scrape) body.scrapeOptions = { formats: ["markdown"] };
  if (monitor.domains?.length && !monitor.settings?.broad) body.includeDomains = monitor.domains.slice(0, 20);
  const tbs = buildDateTbs(monitor.settings?.dateFrom);
  if (tbs) body.tbs = tbs;

  const res = await fetch(`${FIRECRAWL_API}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Firecrawl HTTP ${res.status}`);
  return normalizeItems(data?.data);
}

async function collectSearches(monitor, apiKey) {
  const queries = (monitor.queries || []).slice(0, 20);
  const bucket = [];
  const seen = new Set();
  const errors = [];
  const concurrency = 3;
  for (let i = 0; i < queries.length; i += concurrency) {
    const group = queries.slice(i, i + concurrency);
    const settled = await Promise.allSettled(group.map((query) => searchOne(query, monitor, apiKey)));
    settled.forEach((result, offset) => {
      if (result.status === "rejected") {
        errors.push({ query: group[offset], error: String(result.reason?.message || result.reason).slice(0, 500) });
        return;
      }
      for (const item of result.value) {
        const url = itemUrl(item);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        bucket.push(item);
      }
    });
  }
  return { items: bucket, errors, queryCount: queries.length };
}

function diffContext(diff) {
  const row = (item) => `- ${item.title || "Без названия"}\n  ${item.url}`;
  const changed = diff.changed.slice(0, 40).map((item) => `- ${item.after.title || "Без названия"}\n  ${item.after.url}`).join("\n");
  return `Новые источники (${diff.added.length}):\n${diff.added.slice(0, 60).map(row).join("\n") || "нет"}\n\nИзменившиеся источники (${diff.changed.length}):\n${changed || "нет"}\n\nИсчезнувшие из текущей выборки (${diff.removed.length}):\n${diff.removed.slice(0, 40).map(row).join("\n") || "нет"}`.slice(0, 100_000);
}

async function summarizeDiff(user, monitor, diff) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return "AI-сводка изменений недоступна: OPENAI_API_KEY не настроен.";
  if (!diff.added.length && !diff.changed.length && !diff.removed.length) return "Новых или изменившихся источников по сравнению с предыдущим запуском не найдено.";

  const context = diffContext(diff);
  const chars = context.length + String(monitor.brief || "").length;
  const quota = await checkMonthlyQuota(user, { ai_calls: 1, ai_input_chars: chars });
  if (quota.exceeded.length) return "Изменения найдены, но AI-сводка не сформирована из-за месячного лимита AI.";

  const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "none",
      max_completion_tokens: 2200,
      messages: [
        { role: "system", content: "Ты HR-аналитик. Сравни изменения в повторном интернет-исследовании. Не делай вывод о прекращении практики только потому, что ссылка исчезла из новой выдачи." },
        { role: "user", content: `Исходное ТЗ:\n${monitor.brief || "не указано"}\n\n${context}\n\nСформируй краткий change report: что действительно новое, что изменилось, что требует проверки, возможное влияние на предыдущие выводы и 3-5 действий аналитика. Не выдумывай содержание страниц, которого нет в переданных данных.` },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return `AI-сводка не сформирована: ${data?.error?.message || `OpenAI HTTP ${res.status}`}`;
  const usage = data?.usage || {};
  await recordUsage(user, {
    ai_calls: 1,
    ai_input_chars: chars,
    ai_prompt_tokens: Number(usage.prompt_tokens || 0),
    ai_output_tokens: Number(usage.completion_tokens || 0),
    ai_total_tokens: Number(usage.total_tokens || 0),
  }, { kind: "monitor-diff", status: res.status, model });
  return data?.choices?.[0]?.message?.content || "";
}

export async function runMonitor(user, monitor, trigger = "manual") {
  const firecrawlKey = String(process.env.FIRECRAWL_API_KEY || "").trim();
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY не настроен");
  const queryCount = Math.min((monitor.queries || []).length, 20);
  const limit = Math.max(1, Math.min(Number(monitor.settings?.limit || 10), 20));
  const estimatedFirecrawl = monitor.settings?.scrape ? queryCount * limit : queryCount;
  const quotaDelta = { search_requests: queryCount, firecrawl_units: estimatedFirecrawl };
  const quota = await checkMonthlyQuota(user, quotaDelta);
  if (quota.exceeded.length) {
    const error = new Error("Месячный лимит не позволяет запустить мониторинг");
    error.code = "MONITOR_USAGE_QUOTA";
    error.details = quota.exceeded;
    throw error;
  }

  const startedAt = new Date();
  const collection = await collectSearches(monitor, firecrawlKey);
  await recordUsage(user, quotaDelta, { kind: "monitor-search", status: 200 });
  const currentSnapshot = snapshot(collection.items);
  const diff = compareSnapshots(monitor.snapshot || [], currentSnapshot);
  const summary = await summarizeDiff(user, monitor, diff);
  const runId = `${startedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  const counts = {
    sources: currentSnapshot.length,
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    queryErrors: collection.errors.length,
  };
  const run = {
    version: 1,
    id: runId,
    monitorId: monitor.id,
    title: monitor.title,
    trigger,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    counts,
    summary,
    added: diff.added.slice(0, 100),
    changed: diff.changed.slice(0, 100),
    removed: diff.removed.slice(0, 100),
    errors: collection.errors.slice(0, 50),
  };
  await writeJson(`monitor-runs/${storageUserKey(user)}/${monitor.id}/${runId}.json`, run);

  const updated = {
    ...monitor,
    updatedAt: new Date().toISOString(),
    lastRunAt: run.completedAt,
    nextRunAt: scheduleNext(monitor, new Date(run.completedAt)),
    lastCounts: counts,
    lastSummary: String(summary || "").slice(0, 20_000),
    lastRunId: runId,
    snapshot: currentSnapshot,
  };
  await writeMonitor(user, updated);
  return { run, monitor: updated };
}
