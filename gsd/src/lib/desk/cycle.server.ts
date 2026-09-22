import { GSD_NOTIONAL_USD, GROK_STRATEGY_BOT_ID, GROK_STRATEGY_BOT_LABEL } from "./bot";
import { buildMarketContext } from "./context";
import { completeJson, LlmUnavailableError, parseJsonObject, str } from "./llm.server";
import { fetchBars } from "./market";
import { STRATEGY_SYSTEM } from "./prompts";
import { readEngines } from "./strats";
import type { CycleResult, Mandate, RegimeRead, SetupProposal, Stage } from "./types";

const stamps: number[] = [];

function nid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function grokCap() {
  try {
    const p = await import("./pilot.server");
    const n = Number(p.readPilot().grokCallsPerHour);
    return Number.isFinite(n) ? Math.max(0, Math.min(48, Math.floor(n))) : 6;
  } catch {
    return 6;
  }
}

function quotaOk(max: number) {
  if (max <= 0) return false;
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60 * 60 * 1000) stamps.shift();
  return stamps.length < max;
}

async function ask(system: string, user: string) {
  const { text, latency_ms, model_id } = await completeJson(system, user);
  stamps.push(Date.now());
  const obj = parseJsonObject(text);
  return { obj, latency_ms, model_id, raw: text };
}

function flatMandate(reason: string): Mandate {
  return {
    mandate_id: `gsd_${nid().slice(0, 12)}`,
    issued_at_ms: Date.now(),
    ttl_ms: 20 * 60 * 1000,
    bias: "FLAT",
    conviction: 0,
    universe: [],
    max_notional_usd: 0,
    max_leverage: 1,
    size_factor: 0,
    journal_ref: reason,
  };
}

export async function executeCycle(data: {
  asset: string;
  interval: string;
}): Promise<CycleResult | { ok: false; error: string }> {
  try {
    const bars = await fetchBars(data.asset, data.interval);
    const context = buildMarketContext(bars);
    const engines = readEngines(bars);
    const rc = context.regime_code;
    const regime: RegimeRead = {
      agent: "gsd",
      abstained: false,
      abstain_reason: null,
      latency_ms: 0,
      model_id: "gsd",
      regime: rc.regime,
      confidence: rc.confidence,
      strategies_allowed: engines.snaps.map((s) => `${s.name}:${s.trend}`),
    };

    const empty: Omit<CycleResult, "mandate" | "stage" | "reason"> = {
      bars,
      context,
      regime,
      quant: null,
      analyst: null,
      setup: null,
      counter: null,
      advice: null,
      verdict: null,
      note: null,
      cost_calls: 0,
      latency_ms: 0,
    };

    const result = (
      stage: Stage,
      reason: string,
      extra: Partial<CycleResult> = {},
      mandate?: Mandate,
    ): CycleResult => ({
      ...empty,
      stage,
      reason,
      mandate: mandate ?? flatMandate(reason),
      ...extra,
    });

    const briefing = JSON.stringify(
      {
        departement: "Grok Strategy Department",
        moteurs: engines.snaps,
        nouveau_signal: engines.signal,
        consigne:
          "Signaux only Donchian 20 + Supertrend 10×3. Rien de nouveau = abstention. Nouveau signal = brief, le département exécute.",
        bot: { id: GROK_STRATEGY_BOT_ID, name: GROK_STRATEGY_BOT_LABEL },
        marche: context,
      },
      null,
      2,
    );

    if (!engines.signal) {
      const setup: SetupProposal = {
        agent: "strategie",
        abstained: true,
        abstain_reason: "pas de nouveau signal Donchian/Supertrend",
        latency_ms: 0,
        model_id: "engines",
        asset: data.asset,
        side: null,
        entry_price: null,
        stop_price: null,
        target_price: null,
        horizon_hours: 24,
        rationale: engines.snaps.map((s) => `${s.name} ${s.trend}`).join(" · "),
        evaluation: engines.snaps.map((s) => `${s.name}:${s.trend}`),
      };
      return result("PAS_DE_SETUP", "pas de nouveau signal Donchian/Supertrend", {
        setup,
        cost_calls: 0,
        latency_ms: 0,
      });
    }

    const sig = engines.signal;
    const cap = await grokCap();
    let grokUsdLeft = true;
    try {
      const spend = await import("./spend.server");
      const p = await import("./pilot.server");
      const capUsd = Number(p.readPilot().grokUsdPerDay);
      const used = spend.spendTodayUtc();
      const limit = Number.isFinite(capUsd) ? capUsd : 1;
      grokUsdLeft = used < limit;
    } catch {
      grokUsdLeft = true;
    }
    let rationale = sig.reason;
    let latency_ms = 0;
    let model_id = "engines";
    let cost_calls = 0;
    let horizon_hours = 24;
    if (cap > 0 && quotaOk(cap) && grokUsdLeft && process.env.XAI_API_KEY) {
      try {
        const sR = await ask(STRATEGY_SYSTEM, briefing);
        rationale = str(sR.obj.rationale, sig.reason) || sig.reason;
        latency_ms = sR.latency_ms;
        model_id = sR.model_id;
        cost_calls = 1;
        const h = Number((sR.obj as { horizon_hours?: number }).horizon_hours);
        if (Number.isFinite(h)) horizon_hours = Math.max(4, Math.min(72, Math.floor(h)));
        try {
          const talk = await import("./talk.server");
          talk.recordTalk({
            t: Date.now(),
            asset: data.asset,
            interval: data.interval,
            stage: "ORDRE",
            bot: rationale,
            signal: `${sig.source} ${sig.side} @ ${sig.entry}`,
            raw: String(sR.raw ?? "").slice(0, 1200),
          });
        } catch {
          /* journal */
        }
      } catch {
        rationale = `${sig.reason} (Grok sauté)`;
      }
    } else {
      rationale = !grokUsdLeft
        ? `${sig.reason} · quota $ / jour atteint`
        : cap <= 0
          ? `${sig.reason} · Grok off (0 $/h)`
          : `${sig.reason} · plafond Grok atteint`;
    }
    const setup: SetupProposal = {
      agent: "strategie",
      abstained: false,
      abstain_reason: null,
      latency_ms,
      model_id,
      asset: data.asset,
      side: sig.side,
      entry_price: sig.entry,
      stop_price: sig.stop,
      target_price: sig.target,
      horizon_hours,
      rationale,
      evaluation: [sig.source],
    };

    const mandate: Mandate = {
      mandate_id: `gsd_${nid().slice(0, 12)}`,
      issued_at_ms: Date.now(),
      ttl_ms: 20 * 60 * 1000,
      bias: setup.side ?? "FLAT",
      conviction: 1,
      universe: [setup.asset],
      max_notional_usd: GSD_NOTIONAL_USD,
      max_leverage: 3,
      size_factor: 1,
      journal_ref: setup.rationale,
    };

    return {
      ...empty,
      mandate,
      stage: "ORDRE",
      reason: "le département envoie l'ordre sur son wallet",
      setup,
      cost_calls,
      latency_ms,
    };
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      return { ok: false, error: "Le bot Grok n'est pas joignable ici." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "cycle interrompu" };
  }
}
