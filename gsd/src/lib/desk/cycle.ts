import { createServerFn } from "@tanstack/react-start";
import type { CycleResult } from "./types";
import { ASSETS, INTERVALS } from "./types";

export const runDeskCycle = createServerFn({ method: "POST" })
  .validator((input: { asset: string; interval: string }) => {
    const asset = ASSETS.includes(input.asset as (typeof ASSETS)[number]) ? input.asset : "BTCUSDT";
    const interval = INTERVALS.includes(input.interval as (typeof INTERVALS)[number])
      ? input.interval
      : "1h";
    return { asset, interval };
  })
  .handler(async ({ data }): Promise<CycleResult | { ok: false; error: string }> => {
    const { executeCycle } = await import("./cycle.server");
    return executeCycle(data);
  });
