import { applyCors, handlePreflight, requireEnv, requireManagedAccess } from "../_lib/managed.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireManagedAccess(req, res)) return;

  const openaiKey = requireEnv("OPENAI_API_KEY", res);
  if (!openaiKey) return;

  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  const messages = Array.isArray(incoming.messages) ? incoming.messages : [];
  if (!messages.length) return res.status(400).json({ error: "Нет messages для анализа" });

  const requestedMax = Number(incoming.max_completion_tokens || 2200);
  const maxCompletionTokens = Number.isFinite(requestedMax)
    ? Math.max(128, Math.min(Math.trunc(requestedMax), 3000))
    : 2200;

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
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
    return res.status(200).json({ success: true, content });
  } catch (_error) {
    return res.status(502).json({ error: "Не удалось связаться с OpenAI" });
  }
}
