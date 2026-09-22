import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { completeJson, parseJsonObject } from "./llm.server";
import type { RegimeSnap } from "./regime.server";
import type { GateDecision, RawSignal } from "./signal-gate.server";

export const COMMITTEE_CFG = { enforce: false, shadow: true, maxPerHour: 60 };

const COMMITTEE_SYSTEM = `Tu es un comité de 6 agents + un PM. 1 JSON, rien d'autre.
Tu NE PLACES PAS d'ordres. Vote d'ombre.

Agents : momentum, mean_reversion, btc_beta, flow, devil, risk.
Chacun : {"vote":"allow"|"block","note":"≤12 mots"}.
PM : score 0-1, recommend_allow bool, playbook S1_TREND|S2_REVERSION|MM|OTHER, sizing_mult 0.5-1.5, note.

{"agents":{"momentum":{"vote":"allow","note":""},"mean_reversion":{"vote":"block","note":""},"btc_beta":{"vote":"allow","note":""},"flow":{"vote":"allow","note":""},"devil":{"vote":"block","note":""},"risk":{"vote":"allow","note":""}},"pm":{"score":0.55,"recommend_allow":true,"playbook":"S1_TREND","sizing_mult":1,"note":""}}`;

const stamps: number[] = [];

function quotaOk() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 3600_000) stamps.shift();
  return stamps.length < COMMITTEE_CFG.maxPerHour;
}

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
      note: "fallback local — Grok skip",
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
  if (!gate.allow) {
    const rec = { ...localFallback(raw, gate, extras), source: "skip_j1" };
    logRow({ ...base, ...rec, skipped: "j1_block" });
    return rec;
  }
  if (!quotaOk() || !process.env.XAI_API_KEY) {
    const rec = localFallback(raw, gate, extras);
    logRow({ ...base, ...rec });
    return rec;
  }
  try {
    const { text, model_id } = await completeJson(
      COMMITTEE_SYSTEM,
      JSON.stringify({
        snap: { regime: snap?.regime, bias: snap?.bias, day_pnl_pct: snap?.day_pnl_pct },
        signal: raw,
        gate,
        extras,
      }),
    );
    stamps.push(Date.now());
    const obj = parseJsonObject(text) as {
      agents?: unknown;
      pm?: { score?: number; recommend_allow?: boolean; playbook?: string; sizing_mult?: number; note?: string };
    };
    const rec: CommitteeRec = {
      source: model_id,
      agents: obj.agents ?? {},
      pm: {
        score: Number(obj.pm?.score) || 0,
        recommend_allow: Boolean(obj.pm?.recommend_allow),
        playbook: String(obj.pm?.playbook || gate.family),
        sizing_mult: Number(obj.pm?.sizing_mult) || 1,
        note: String(obj.pm?.note || ""),
      },
      enforce_block: false,
      shadow: true,
    };
    logRow({ ...base, ...rec });
    try {
      const talk = await import("./talk.server");
      talk.recordTalk({
        t: Date.now(),
        asset: raw.asset,
        interval: raw.interval,
        stage: "ORDRE",
        bot: `J2 ombre score ${rec.pm.score.toFixed(2)} rec=${rec.pm.recommend_allow} (non appliqué)`,
      });
    } catch {
      /* */
    }
    return rec;
  } catch {
    const rec = localFallback(raw, gate, extras);
    logRow({ ...base, ...rec });
    return rec;
  }
}
