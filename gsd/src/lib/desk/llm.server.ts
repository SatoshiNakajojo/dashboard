import { GROK_STRATEGY_BOT_ID } from "./bot";

const MODEL = "grok-4.5";

export class LlmUnavailableError extends Error {
  constructor(message = "AI is not available in this environment") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export async function completeJson(system: string, user: string): Promise<{
  text: string;
  latency_ms: number;
  model_id: string;
}> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new LlmUnavailableError();

  const started = Date.now();
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      user: `grok-bot:${GROK_STRATEGY_BOT_ID}`,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`xAI API error ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
    usage?: { cost_in_usd_ticks?: number; cost?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  try {
    const { recordSpend, ticksToUsd } = await import("./spend.server");
    const ticks = json.usage?.cost_in_usd_ticks;
    const usd = ticks != null ? ticksToUsd(ticks) : Number(json.usage?.cost) || 0;
    recordSpend(usd, json.model ?? MODEL);
  } catch {
    /* spend log best-effort */
  }
  return { text, latency_ms: Date.now() - started, model_id: json.model ?? MODEL };
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("réponse non JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function bool(v: unknown): boolean {
  return Boolean(v);
}
