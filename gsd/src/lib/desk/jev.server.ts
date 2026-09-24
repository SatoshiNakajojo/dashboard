import { JEV_TIMEOUT_MS, JEV_URL, jevBody, jevCostUsd, parseJevResponse, type JevAnswer, type JevQuestion } from "./jev";

export class JevUnavailableError extends Error {
  constructor(message = "TYPESAFE_AI_API_KEY absente") {
    super(message);
    this.name = "JevUnavailableError";
  }
}

export function jevReady() {
  return Boolean(process.env.TYPESAFE_AI_API_KEY);
}

const stamps: number[] = [];

/**
 * Les réglages « appels / heure » et « $ / jour » du cockpit, qui bornaient
 * Grok, bornent désormais Jev.
 */
export async function jevAllowed(): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!jevReady()) return { ok: false, why: "clé TYPESAFE_AI_API_KEY absente" };
  let perHour = 6;
  let usdDay = 1;
  try {
    const p = (await import("./pilot.server")).readPilot();
    if (Number.isFinite(Number(p.grokCallsPerHour))) perHour = Number(p.grokCallsPerHour);
    if (Number.isFinite(Number(p.grokUsdPerDay))) usdDay = Number(p.grokUsdPerDay);
  } catch {
    /* réglages par défaut */
  }
  if (perHour <= 0 || usdDay <= 0) return { ok: false, why: "Jev coupé dans les réglages" };
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 3_600_000) stamps.shift();
  if (stamps.length >= perHour) return { ok: false, why: `plafond de ${perHour} appels / h atteint` };
  try {
    const { spendTodayUtc } = await import("./spend.server");
    if (spendTodayUtc() >= usdDay) return { ok: false, why: `budget de ${usdDay} $ / jour atteint` };
  } catch {
    /* */
  }
  return { ok: true };
}

export type JevResult = {
  model: string;
  answers: Record<string, JevAnswer>;
  inputTokens: number;
  usd: number;
  latencyMs: number;
};

/**
 * Une requête, toutes les questions évaluées ensemble contre le même état.
 * Le coût facturé est inscrit dans `spend.json` avec le modèle réellement
 * servi, comme l'étaient les appels xAI.
 */
export async function askJev(state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const key = process.env.TYPESAFE_AI_API_KEY;
  if (!key) throw new JevUnavailableError();
  const started = Date.now();
  stamps.push(started);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JEV_TIMEOUT_MS);
  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(jevBody(state, questions)),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Jev ${res.status}${body ? ` : ${body.slice(0, 180)}` : ""}`);
    }
    const parsed = parseJevResponse(await res.json(), questions);
    const usd = jevCostUsd(parsed.inputTokens);
    try {
      const { recordSpend } = await import("./spend.server");
      recordSpend(usd, parsed.model);
    } catch {
      /* dépense : au mieux */
    }
    return { ...parsed, usd, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
