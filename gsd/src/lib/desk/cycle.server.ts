import { GSD_NOTIONAL_USD, GSD_TIME_STOP_H } from "./bot";
import { buildMarketContext } from "./context";
import { fetchBars } from "./market";
import { readEngines } from "./strats";
import type { CycleResult, Mandate, RegimeRead, SetupProposal, Stage } from "./types";

function nid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
    // Grok écrivait ici une justification et un horizon de détention. Aucune
    // règle de sortie ne lisait cet horizon : l'appel se payait à chaque
    // signal sans rien décider. L'horizon affiché est désormais celui qui
    // s'applique vraiment, le time-stop.
    const rationale = sig.reason;
    const latency_ms = 0;
    const model_id = "engines";
    const cost_calls = 0;
    const horizon_hours = GSD_TIME_STOP_H;
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
    return { ok: false, error: e instanceof Error ? e.message : "cycle interrompu" };
  }
}
