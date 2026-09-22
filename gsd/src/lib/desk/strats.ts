import { atr, donchian } from "./indicators";
import type { Bar, Side } from "./types";

export type EngineSnap = {
  name: "Donchian" | "Supertrend";
  trend: "LONG" | "SHORT" | "FLAT";
  upper: number | null;
  lower: number | null;
  line: number | null;
};

export type EngineSignal = {
  source: "Donchian" | "Supertrend";
  side: Side;
  entry: number;
  stop: number;
  target: number | null;
  reason: string;
};

function lastClosed(bars: Bar[]): Bar[] {
  if (bars.length < 3) return bars;
  return bars.slice(0, -1);
}

export function supertrend(bars: Bar[], period = 10, mult = 3) {
  const n = bars.length;
  const a = atr(bars, period);
  const line: Array<number | null> = Array(n).fill(null);
  const dir: Array<1 | -1 | 0> = Array(n).fill(0);
  let prevLine: number | null = null;
  let prevDir: 1 | -1 = 1;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    if (av == null) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    let upper = hl2 + mult * av;
    let lower = hl2 - mult * av;
    if (prevLine != null) {
      if (prevDir === 1) lower = Math.max(lower, prevLine);
      else upper = Math.min(upper, prevLine);
    }
    let d: 1 | -1 = prevDir;
    if (prevLine != null) {
      if (prevDir === 1 && bars[i].close < prevLine) d = -1;
      else if (prevDir === -1 && bars[i].close > prevLine) d = 1;
    }
    const L = d === 1 ? lower : upper;
    line[i] = L;
    dir[i] = d;
    prevLine = L;
    prevDir = d;
  }
  return { line, dir };
}

export function readEngines(bars: Bar[]): { snaps: EngineSnap[]; signal: EngineSignal | null } {
  const closed = lastClosed(bars);
  const i = closed.length - 1;
  const snaps: EngineSnap[] = [];
  let signal: EngineSignal | null = null;
  if (i < 25) return { snaps, signal };

  const px = closed[i].close;
  const { hi, lo } = donchian(closed, 20);
  const dHi = hi[i];
  const dLo = lo[i];
  const pHi = hi[i - 1];
  const pLo = lo[i - 1];
  let dTrend: EngineSnap["trend"] = "FLAT";
  if (dHi != null && px >= dHi) dTrend = "LONG";
  else if (dLo != null && px <= dLo) dTrend = "SHORT";
  snaps.push({ name: "Donchian", trend: dTrend, upper: dHi, lower: dLo, line: null });

  if (pHi != null && closed[i - 1].close <= pHi && dHi != null && px > pHi) {
    const stop = dLo ?? px * 0.97;
    signal = {
      source: "Donchian",
      side: "LONG",
      entry: px,
      stop,
      target: px + (px - stop) * 1.5,
      reason: `Donchian 20 : cassure haussière au-dessus de ${pHi.toFixed(2)}`,
    };
  } else if (pLo != null && closed[i - 1].close >= pLo && dLo != null && px < pLo) {
    const stop = dHi ?? px * 1.03;
    signal = {
      source: "Donchian",
      side: "SHORT",
      entry: px,
      stop,
      target: px - (stop - px) * 1.5,
      reason: `Donchian 20 : cassure baissière sous ${pLo.toFixed(2)}`,
    };
  }

  const st = supertrend(closed, 10, 3);
  const stLine = st.line[i];
  const stDir = st.dir[i];
  const stPrev = st.dir[i - 1];
  snaps.push({
    name: "Supertrend",
    trend: stDir === 1 ? "LONG" : stDir === -1 ? "SHORT" : "FLAT",
    upper: null,
    lower: null,
    line: stLine,
  });

  if (!signal && stDir && stPrev && stDir !== stPrev && stLine != null) {
    const side: Side = stDir === 1 ? "LONG" : "SHORT";
    const stop = stLine;
    signal = {
      source: "Supertrend",
      side,
      entry: px,
      stop,
      target: side === "LONG" ? px + (px - stop) * 1.5 : px - (stop - px) * 1.5,
      reason: `Supertrend 10×3 : retournement ${side} (ligne ${stLine.toFixed(2)})`,
    };
  }

  return { snaps, signal };
}
