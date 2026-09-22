import type { Bar } from "./types";

export type Series = Array<number | null>;

export function closes(bars: Bar[]): number[] {
  return bars.map((b) => b.close);
}

export function sma(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
    if (i >= period) total -= values[i - period];
    if (i >= period - 1) out[i] = total / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wilder(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length < period) return out;
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function rsi(values: number[], period = 14): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  const gains = Array(values.length).fill(0);
  const losses = Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = rsiValue(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}

export function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prev = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
}

export function atr(bars: Bar[], period = 14): Series {
  return wilder(trueRange(bars), period);
}

export function donchian(bars: Bar[], period = 20): { hi: Series; lo: Series } {
  const hi: Series = Array(bars.length).fill(null);
  const lo: Series = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) continue;
    const w = bars.slice(i - period + 1, i + 1);
    hi[i] = Math.max(...w.map((b) => b.high));
    lo[i] = Math.min(...w.map((b) => b.low));
  }
  return { hi, lo };
}

export function realizedVolBps(values: number[], period = 24): Series {
  const out: Series = Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    const rets: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j - 1] <= 0) continue;
      rets.push(Math.log(values[j] / values[j - 1]));
    }
    if (rets.length < 2) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const var_ = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
    out[i] = Math.sqrt(var_) * 10000;
  }
  return out;
}

export function lastNum(s: Series): number | null {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] != null) return s[i] as number;
  }
  return null;
}
