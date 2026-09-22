import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atr, ema } from "./indicators";
import type { Bar } from "./types";

export const REGIME_CFG = {
  day_loss_pct: -0.025,
  streak_losses: 5,
  max_positions: 8,
  gross_exposure_pct: 0.8,
  shock_candles: 4,
  atr_shock_mult: 3,
  btc_dump_pct: -0.03,
  auto_resume: false,
  min_bars: 50,
};

export type RegimeName = "TREND" | "RANGE" | "SHOCK" | "UNKNOWN";

export type RegimeSnap = {
  t: number;
  regime: RegimeName;
  bias: "BULL" | "BEAR" | "FLAT";
  halted: boolean;
  can_open_new_trade: boolean;
  kill_reasons: string[];
  day_pnl_pct: number;
  loss_streak: number;
  shock_streak: number;
  open_positions: number;
  gross_exposure_pct: number;
  equity: number;
};

type State = {
  halted: boolean;
  reasons: string[];
  regime: RegimeName;
  dayKey: string;
  dayStartNav: number;
  lossStreak: number;
  shockStreak: number;
  last: RegimeSnap | null;
};

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function path() {
  return join(dir(), "regime_state.json");
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function empty(): State {
  return {
    halted: false,
    reasons: [],
    regime: "UNKNOWN",
    dayKey: utcDay(),
    dayStartNav: 0,
    lossStreak: 0,
    shockStreak: 0,
    last: null,
  };
}

function load(): State {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(path(), "utf8")) };
  } catch {
    return empty();
  }
}

function save(s: State) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path(), JSON.stringify(s));
}

function classify(bars: Bar[]): { regime: RegimeName; shock: boolean; bias: "BULL" | "BEAR" | "FLAT" } {
  if (bars.length < REGIME_CFG.min_bars) return { regime: "UNKNOWN", shock: false, bias: "FLAT" };
  const c = bars.map((b) => b.close);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const a = atr(bars, 14);
  const lastA = a[a.length - 1];
  const recent = a.slice(-40).filter((x): x is number => x != null);
  const med = recent.sort((x, y) => x - y)[Math.floor(recent.length / 2)] || lastA || 0;
  const last = bars[bars.length - 1];
  const ret = last.close / last.open - 1;
  const shock = (lastA != null && med > 0 && lastA > med * REGIME_CFG.atr_shock_mult) || ret <= REGIME_CFG.btc_dump_pct;
  const v20 = e20[e20.length - 1];
  const v50 = e50[e50.length - 1];
  const v20p = e20[e20.length - 6];
  let bias: "BULL" | "BEAR" | "FLAT" = "FLAT";
  if (v20 != null && v50 != null) {
    if (v20 > v50) bias = "BULL";
    else if (v20 < v50) bias = "BEAR";
  }
  if (shock) return { regime: "SHOCK", shock: true, bias };
  if (v20 != null && v50 != null && v20p != null && Math.abs(v20 - v50) / last.close > 0.004 && Math.abs(v20 - v20p) / last.close > 0.002) {
    return { regime: "TREND", shock: false, bias };
  }
  return { regime: "RANGE", shock: false, bias };
}

export function readRegime(): RegimeSnap | null {
  return load().last;
}

export function resumeRegime(force = true) {
  if (!force && REGIME_CFG.auto_resume) return readRegime();
  const s = load();
  s.halted = false;
  s.reasons = [];
  s.shockStreak = 0;
  if (s.last) {
    s.last.halted = false;
    s.last.can_open_new_trade = s.last.regime !== "SHOCK" && s.last.regime !== "UNKNOWN";
    s.last.kill_reasons = [];
  }
  save(s);
  return s.last;
}

export function recordTradeResult(pnlPct: number) {
  const s = load();
  if (pnlPct < 0) s.lossStreak += 1;
  else s.lossStreak = 0;
  if (s.lossStreak >= REGIME_CFG.streak_losses) {
    s.halted = true;
    if (!s.reasons.includes("STREAK")) s.reasons.push("STREAK");
  }
  save(s);
}

export async function evaluateGate(input: {
  equity: number;
  open_positions: number;
  gross_notional: number;
  pairBars?: Bar[];
  btc15?: Bar[];
  btc1h?: Bar[];
}): Promise<RegimeSnap> {
  const s = load();
  const day = utcDay();
  if (s.dayKey !== day) {
    s.dayKey = day;
    s.dayStartNav = input.equity;
    s.lossStreak = 0;
  }
  if (!s.dayStartNav && input.equity > 0) s.dayStartNav = input.equity;
  const dayPnl = s.dayStartNav > 0 ? (input.equity - s.dayStartNav) / s.dayStartNav : 0;
  const expo = input.equity > 0 ? input.gross_notional / input.equity : 0;

  const bars = input.btc15?.length ? input.btc15 : input.btc1h?.length ? input.btc1h : input.pairBars || [];
  const cls = classify(bars);
  if (cls.shock) s.shockStreak += 1;
  else s.shockStreak = 0;

  let regime: RegimeName = cls.regime;
  if (s.shockStreak >= REGIME_CFG.shock_candles) regime = "SHOCK";

  const reasons: string[] = [];
  if (dayPnl <= REGIME_CFG.day_loss_pct) reasons.push("DAY_LOSS");
  if (s.lossStreak >= REGIME_CFG.streak_losses) reasons.push("STREAK");
  if (input.open_positions > REGIME_CFG.max_positions) reasons.push("MAX_POS");
  if (expo >= REGIME_CFG.gross_exposure_pct) reasons.push("EXPOSURE");
  if (s.shockStreak >= REGIME_CFG.shock_candles) reasons.push("SHOCK_CANDLES");
  if (regime === "SHOCK") reasons.push("REGIME_SHOCK");
  if (regime === "UNKNOWN") reasons.push("REGIME_UNKNOWN");

  if (reasons.length) {
    s.halted = true;
    s.reasons = [...new Set([...s.reasons, ...reasons])];
  }
  s.regime = regime;

  const snap: RegimeSnap = {
    t: Date.now(),
    regime,
    bias: cls.bias,
    halted: s.halted,
    can_open_new_trade: !s.halted && regime !== "SHOCK" && regime !== "UNKNOWN",
    kill_reasons: s.halted ? s.reasons : reasons,
    day_pnl_pct: dayPnl,
    loss_streak: s.lossStreak,
    shock_streak: s.shockStreak,
    open_positions: input.open_positions,
    gross_exposure_pct: expo,
    equity: input.equity,
  };
  s.last = snap;
  save(s);
  try {
    const talk = await import("./talk.server");
    talk.recordTalk({
      t: Date.now(),
      asset: "REGIME",
      interval: "gate",
      stage: snap.can_open_new_trade ? "PAS_DE_SETUP" : "PAS_DE_SETUP",
      bot: `regime ${snap.regime} · open=${snap.can_open_new_trade} · ${snap.kill_reasons.join(",") || "ok"} · jour ${(snap.day_pnl_pct * 100).toFixed(2)}%`,
    });
  } catch {
    /* */
  }
  return snap;
}
