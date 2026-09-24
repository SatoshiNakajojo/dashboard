import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logDecision } from "./decisions.server";
import { noulP, scoreLevel, topChoice, type JevQuestion } from "./jev";
import { askJev, jevAllowed } from "./jev.server";
import type { RegimeSnap } from "./regime.server";
import type { GateDecision, RawSignal } from "./signal-gate.server";

/**
 * J2 — l'avis de Jev sur chaque signal que J1 laisse passer. Vote d'ombre :
 * inscrit, jamais appliqué, tant qu'il n'a pas été mesuré contre ce que les
 * trades ont réellement donné.
 *
 * Grok jouait ici un comité de six agents et d'un PM, en prose. Jev répond à
 * trois questions dont toutes les réponses sont définies d'avance.
 */
export const COMMITTEE_CFG = { enforce: false, shadow: true };

const TAILLES = ["0,5×", "0,75×", "1×", "1,25×", "1,5×"];
const MULT = [0.5, 0.75, 1, 1.25, 1.5];

const QUESTIONS: Record<string, JevQuestion> = {
  prendre: {
    type: "noul",
    instructions:
      "A trading desk's rules just produced this new signal. Given the market regime, the signal's family and side, and the indicators, is this signal worth taking now?",
  },
  famille: {
    type: "choice",
    instructions: "Which playbook does this signal belong to?",
    criteria: {
      S1_TREND: "Trend following: a breakout in the direction of the trend",
      S2_REVERSION: "Reversal or mean reversion: a trend flip, an overextension fading",
      MM: "Market making or grid trading",
      OTHER: null,
    },
  },
  taille: {
    type: "score",
    instructions: "Relative to the desk's normal position size, how large should this position be?",
    criteria: TAILLES,
  },
};

const QUESTION_J2 = "prendre ce signal ?";

function logRow(row: Record<string, unknown>) {
  try {
    const dir = process.env.GSD_DATA_DIR || "/tmp/gsd";
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "committee.jsonl"), JSON.stringify(row) + "\n");
  } catch {
    /* */
  }
}

function localFallback(raw: RawSignal, gate: GateDecision, extras: Record<string, unknown>) {
  const rsi = Number(extras.rsi);
  let score = 0.5;
  if (Number.isFinite(rsi)) {
    if (raw.side === "LONG") score = rsi < 70 ? 0.6 : 0.35;
    else score = rsi > 30 ? 0.6 : 0.35;
  }
  if (gate.family === "S1_TREND") score += 0.05;
  const recommend_allow = score >= 0.5;
  return {
    source: "local",
    agents: {},
    pm: {
      score,
      recommend_allow,
      playbook: gate.family,
      sizing_mult: 1,
      note: "repli local — Jev indisponible",
    },
    enforce_block: false,
    shadow: true,
  };
}

export type CommitteeRec = {
  source: string;
  agents: unknown;
  pm: {
    score: number;
    recommend_allow: boolean;
    playbook: string;
    sizing_mult: number;
    note: string;
  };
  enforce_block: boolean;
  shadow: boolean;
};

export async function review(
  snap: RegimeSnap | null,
  raw: RawSignal,
  gate: GateDecision,
  extras: Record<string, unknown> = {},
): Promise<CommitteeRec> {
  const base = {
    t: Date.now(),
    asset: raw.asset,
    interval: raw.interval,
    side: raw.side,
    family: gate.family,
    regime: snap?.regime,
    bias: snap?.bias,
    extras,
  };
  const coin = raw.asset.replace(/USDT$/i, "");
  if (!gate.allow) {
    const rec = { ...localFallback(raw, gate, extras), source: "skip_j1" };
    logRow({ ...base, ...rec, skipped: "j1_block" });
    return rec;
  }
  const local = (why: string) => {
    const rec = localFallback(raw, gate, extras);
    logRow({ ...base, ...rec, jev: why });
    logDecision({
      stage: "J2",
      decider: "local",
      asset: coin,
      tf: raw.interval,
      question: QUESTION_J2,
      answer: rec.pm.recommend_allow ? "prendre" : "passer",
      p: rec.pm.score,
      applied: false,
      detail: `repli local (RSI) — ${why}`,
    });
    return rec;
  };
  const allowed = await jevAllowed();
  if (!allowed.ok) return local(allowed.why);
  try {
    const r = await askJev(
      {
        regime: { regime: snap?.regime ?? "UNKNOWN", bias: snap?.bias ?? "FLAT", day_pnl_pct: snap?.day_pnl_pct ?? null },
        signal: { asset: coin, timeframe: raw.interval, side: raw.side, source: raw.name },
        gate: { family: gate.family, reasons: gate.reasons },
        indicators: extras,
      },
      QUESTIONS,
    );
    const p = noulP(r.answers.prendre) ?? 0;
    const fam = topChoice(r.answers.famille);
    const size = scoreLevel(r.answers.taille, TAILLES);
    const rec: CommitteeRec = {
      source: r.model,
      agents: {},
      pm: {
        score: p,
        recommend_allow: p >= 0.5,
        playbook: fam?.choice ?? gate.family,
        sizing_mult: size ? MULT[size.index] : 1,
        note: `Jev · p ${p.toFixed(2)} · ${fam?.choice ?? "?"} · ${size?.level ?? "1×"}`,
      },
      enforce_block: false,
      shadow: true,
    };
    logRow({ ...base, ...rec, latency_ms: r.latencyMs, usd: r.usd });
    logDecision({
      stage: "J2",
      decider: "jev",
      asset: coin,
      tf: raw.interval,
      question: QUESTION_J2,
      answer: rec.pm.recommend_allow ? "prendre" : "passer",
      p,
      applied: false,
      ms: r.latencyMs,
      usd: r.usd,
      detail: `${fam?.choice ?? "?"} (p ${fam ? fam.p.toFixed(2) : "?"}) · taille ${size?.level ?? "?"} · ombre`,
    });
    try {
      const talk = await import("./talk.server");
      talk.recordTalk({
        t: Date.now(),
        asset: raw.asset,
        interval: raw.interval,
        stage: "ORDRE",
        bot: `J2 Jev p ${p.toFixed(2)} → ${rec.pm.recommend_allow ? "prendre" : "passer"} (ombre, non appliqué)`,
      });
    } catch {
      /* */
    }
    return rec;
  } catch (e) {
    return local(`Jev en échec : ${e instanceof Error ? e.message : String(e)}`);
  }
}
