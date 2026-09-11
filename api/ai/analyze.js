import {
  applyCors,
  enforceRateLimit,
  handlePreflight,
  requireEnv,
  requireManagedAccess,
} from "../_lib/managed.js";
import { enforceMonthlyQuota, recordUsage } from "../_lib/usage.js";

const MAX_AI_INPUT_CHARS = 140_000;
const MAX_AI_MESSAGES = 16;

function normalizeMessages(incoming) {
  const messages = Array.isArray(incoming) ? incoming.slice(0, MAX_AI_MESSAGES) : [];
  return messages
    .map((message) => ({
      role: ["system", "user", "assistant"].includes(message?.role) ? message.role : "user",
      content: String(message?.content || ""),
    }))
    .filter((message) => message.content.trim());
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireManagedAccess(req, res)) return;
  if (!enforceRateLimit(req, res, "openai-analyze", 12)) return;

  const openaiKey = requireEnv("OPENAI_API_KEY", res);
  if (!openaiKey) return;

  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  const messages = normalizeMessages(incoming.messages);
  if (!messages.length) return res.status(400).json({ error: "Нет messages для анализа" });

  const totalChars = messages.reduce((sum, item) => sum + item.content.length, 0);
  if (totalChars > MAX_AI_INPUT_CHARS) {
    return res.status(413).json({
      error: `Слишком большой AI-контекст: ${totalChars} символов. Максимум ${MAX_AI_INPUT_CHARS}.`,
    });
  }

  const requestedMax = Number(incoming.max_completion_tokens || 4500);
  const maxCompletionTokens = Number.isFinite(requestedMax)
    ? Math.max(128, Math.min(Math.trunc(requestedMax), 6000))
    : 4500;

  const quotaDelta = { ai_calls: 1, ai_input_chars: totalChars };
  if (!(await enforceMonthlyQuota(req, res, quotaDelta))) return;

  const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
  const payload = {
    model,
    messages,
    reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "none",
    max_completion_tokens: maxCompletionTokens,
  };

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || `OpenAI HTTP ${upstream.status}`;
      return res.status(upstream.status).json({ error: message });
    }

    const content = data?.choices?.[0]?.message?.content || "";
    const usage = data?.usage || {};
    await recordUsage(req.hrPomoshnikUser, {
      ...quotaDelta,
      ai_prompt_tokens: Number(usage.prompt_tokens || 0),
      ai_output_tokens: Number(usage.completion_tokens || 0),
      ai_total_tokens: Number(usage.total_tokens || 0),
    }, { kind: "openai-analyze", status: upstream.status, model });

    return res.status(200).json({
      success: true,
      content,
      usage: {
        prompt_tokens: Number(usage.prompt_tokens || 0),
        completion_tokens: Number(usage.completion_tokens || 0),
        total_tokens: Number(usage.total_tokens || 0),
      },
    });
  } catch (_error) {
    return res.status(502).json({ error: "Не удалось связаться с OpenAI" });
  }
}
