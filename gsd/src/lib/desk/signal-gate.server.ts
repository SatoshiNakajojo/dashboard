import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logDecision } from "./decisions.server";
import type { RegimeSnap } from "./regime.server";
import type { Side } from "./types";

export const SIGNAL_GATE_CFG = { shadow: false as boolean };

export type SignalFamily = "S1_TREND" | "S2_REVERSION" | "MM" | "OTHER";

const ALIASES: Record<Exclude<SignalFamily, "OTHER">, string[]> = {
  S1_TREND: [
    "donchian",
    "confluence",
    "cassure",
    "breakout",
    "continuation",
    "donchian 20",
    "s1",
  ],
  S2_REVERSION: ["supertrend", "retournement", "reversal", "rsi", "mean-reversion", "s2"],
  MM: ["mm", "market making", "grid", "maker"],
};

export type RawSignal = {
  name: string;
  side: Side;
  asset: string;
  interval: string;
};

export type GateDecision = {
  allow: boolean;
  family: SignalFamily;
  reasons: string[];
  shadow: boolean;
};

function familyOf(name: string): SignalFamily {
  const n = name.toLowerCase();
  for (const fam of ["S1_TREND", "S2_REVERSION", "MM"] as const) {
    if (ALIASES[fam].some((a) => n.includes(a))) return fam;
  }
  return "OTHER";
}

function logLine(row: Record<string, unknown>) {
  try {
    const dir = process.env.GSD_DATA_DIR || "/tmp/gsd";
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "signal_gate.jsonl"), JSON.stringify(row) + "\n");
  } catch {
    /* */
  }
}

export function decide(snap: RegimeSnap | null, raw: RawSignal): GateDecision {
  const family = familyOf(raw.name || "");
  const reasons: string[] = [];
  const regime = snap?.regime ?? "UNKNOWN";
  const bias = snap?.bias ?? "FLAT";

  if (!snap || !snap.can_open_new_trade) reasons.push("J0_HALT");
  if (regime === "SHOCK" || regime === "UNKNOWN") reasons.push("REGIME_" + regime);
  if (family === "OTHER") reasons.push("FAMILY_OTHER");

  if (regime === "TREND") {
    if (family !== "S1_TREND") reasons.push("TREND_NEEDS_S1");
    if (bias === "BULL" && raw.side === "SHORT") reasons.push("NO_SHORT_IN_BULL");
    if (bias === "BEAR" && raw.side === "LONG") reasons.push("NO_LONG_IN_BEAR");
    if (bias === "FLAT") reasons.push("TREND_BIAS_FLAT");
  } else if (regime === "RANGE") {
    if (family === "S1_TREND") reasons.push("RANGE_BLOCKS_S1");
    if (family !== "S2_REVERSION" && family !== "MM") reasons.push("RANGE_NEEDS_S2_OR_MM");
  } else {
    reasons.push("REGIME_BLOCKS_ALL");
  }

  const allowLogic = reasons.length === 0;
  const allow = SIGNAL_GATE_CFG.shadow ? true : allowLogic;
  const row = {
    t: Date.now(),
    family,
    regime,
    bias,
    side: raw.side,
    asset: raw.asset,
    interval: raw.interval,
    name: raw.name,
    allow: allowLogic,
    applied: allow,
    shadow: SIGNAL_GATE_CFG.shadow,
    reasons,
  };
  logLine(row);
  logDecision({
    stage: "J1",
    decider: "règle",
    asset: raw.asset.replace(/USDT$/i, ""),
    tf: raw.interval,
    question: "la famille du signal convient-elle au régime ?",
    answer: allowLogic ? "passe" : "bloque",
    applied: !SIGNAL_GATE_CFG.shadow,
    detail: `${family} ${raw.side} · ${regime}/${bias}${reasons.length ? ` · ${reasons.join("+")}` : ""}`,
  });
  try {
    void import("./talk.server").then((t) =>
      t.recordTalk({
        t: Date.now(),
        asset: raw.asset,
        interval: raw.interval,
        stage: allowLogic ? "ORDRE" : "PAS_DE_SETUP",
        bot: `J1 ${family} ${allowLogic ? "PASS" : "BLOCK"} · ${regime}/${bias} · ${reasons.join("+") || "ok"}`,
      }),
    );
  } catch {
    /* */
  }
  return { allow, family, reasons, shadow: SIGNAL_GATE_CFG.shadow };
}
