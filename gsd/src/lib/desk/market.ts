import { createServerFn } from "@tanstack/react-start";
import { buildMarketContext } from "./context";
import type { Bar, MarketContext } from "./types";
import { ASSETS, INTERVALS } from "./types";

const INTERVAL_MAP: Record<string, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "12h": "12h",
};

export async function fetchBars(asset: string, interval: string, limit = 300): Promise<Bar[]> {
  const iv = INTERVAL_MAP[interval] ?? "1h";
  const symbol = asset.toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${iv}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`marché indisponible (${res.status})`);
  const raw = (await res.json()) as number[][];
  return raw.map((k) => ({
    asset: symbol,
    ts: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

export const loadMarket = createServerFn({ method: "POST" })
  .validator((input: { asset: string; interval: string }) => {
    const asset = ASSETS.includes(input.asset as (typeof ASSETS)[number]) ? input.asset : "BTCUSDT";
    const interval = INTERVALS.includes(input.interval as (typeof INTERVALS)[number])
      ? input.interval
      : "1h";
    return { asset, interval };
  })
  .handler(async ({ data }): Promise<{ bars: Bar[]; context: MarketContext }> => {
    const bars = await fetchBars(data.asset, data.interval);
    return { bars, context: buildMarketContext(bars) };
  });
