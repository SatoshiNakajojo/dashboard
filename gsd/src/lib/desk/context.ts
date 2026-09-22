import { atr, closes, donchian, ema, lastNum, realizedVolBps, rsi } from "./indicators";
import type { Bar, MarketContext, Regime } from "./types";

function rnd(v: number | null, d = 2): number | null {
  return v == null ? null : Number(v.toFixed(d));
}

export function buildMarketContext(bars: Bar[], lookback = 60): MarketContext {
  if (bars.length < 30) {
    throw new Error(`au moins 30 barres nécessaires, ${bars.length} fournies`);
  }
  const px = closes(bars);
  const last = bars[bars.length - 1];
  const rsi14 = rsi(px, 14);
  const ema20 = ema(px, 20);
  const ema50 = ema(px, 50);
  const atr14 = atr(bars, 14);
  const vol = realizedVolBps(px, 24);
  const { hi, lo } = donchian(bars, 20);
  const window = bars.slice(-lookback);
  const changePct = (last.close / window[0].open - 1) * 100;
  const e20 = lastNum(ema20);
  const e50 = lastNum(ema50);
  const a = lastNum(atr14);
  return {
    actif: last.asset,
    horodatage_ms: last.ts,
    barres_analysees: bars.length,
    prix: {
      dernier: last.close,
      ouverture_periode: window[0].open,
      variation_periode_pct: Number(changePct.toFixed(2)),
      plus_haut_20: rnd(lastNum(hi)),
      plus_bas_20: rnd(lastNum(lo)),
      plus_haut_40: rnd(Math.max(...bars.slice(-40).map((b) => b.high))),
      plus_bas_40: rnd(Math.min(...bars.slice(-40).map((b) => b.low))),
      plus_haut_120: rnd(Math.max(...bars.slice(-Math.min(120, bars.length)).map((b) => b.high))),
      plus_bas_120: rnd(Math.min(...bars.slice(-Math.min(120, bars.length)).map((b) => b.low))),
    },
    indicateurs: {
      rsi_14: rnd(lastNum(rsi14), 1),
      ema_20: rnd(e20),
      ema_50: rnd(e50),
      ema_20_au_dessus_50: e20 == null || e50 == null ? null : e20 > e50,
      atr_14: rnd(a),
      atr_pct_du_prix: a == null ? null : rnd((a / last.close) * 100),
      volatilite_realisee_bps_24: rnd(lastNum(vol), 1),
    },
    regime_code: inferRegime(e20, e50, lastNum(rsi14)),
  };
}

/** Lecture déterministe — pas un agent. Sert au scoring d'alignement. */
export function inferRegime(
  ema20: number | null,
  ema50: number | null,
  rsi14: number | null,
): { regime: Regime; confidence: number } {
  if (ema20 == null || ema50 == null || rsi14 == null) {
    return { regime: "UNKNOWN", confidence: 0 };
  }
  const spread = (ema20 - ema50) / ema50;
  if (spread > 0.004 && rsi14 >= 52) return { regime: "TREND_UP", confidence: Math.min(0.85, 0.45 + Math.abs(spread) * 40) };
  if (spread < -0.004 && rsi14 <= 48) return { regime: "TREND_DOWN", confidence: Math.min(0.85, 0.45 + Math.abs(spread) * 40) };
  if (Math.abs(spread) < 0.002) return { regime: "RANGE", confidence: 0.55 };
  return { regime: "UNKNOWN", confidence: 0.35 };
}
