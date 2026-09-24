import { createServerFn } from "@tanstack/react-start";

export const getPilot = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./pilot.server");
    m.startPilot();
    const s = m.readPilot();
    let opens: Awaited<ReturnType<typeof m.liveOpens>> = [];
    try {
      opens = await m.liveOpens();
    } catch {
      opens = [];
    }
    const wallet = await m.liveWallet();
    const nav = wallet && "trading" in wallet ? wallet.trading : null;
    try {
      const book = await import("./book.server");
      const { readHlClosingFills } = await import("./hl");
      let fills: Awaited<ReturnType<typeof readHlClosingFills>> = [];
      try {
        const rawMaster = process.env.HL_MASTER;
        if (rawMaster) {
          const master = (
            rawMaster.startsWith("0x") ? rawMaster : `0x${rawMaster}`
          ) as `0x${string}`;
          fills = await readHlClosingFills(master);
        }
      } catch {
        fills = [];
      }
      if (typeof nav === "number") book.snapshot(nav, opens, s.lastSetups, fills);
    } catch {
      /* */
    }
    let regime = null;
    try {
      const rg = await import("./regime.server");
      regime = rg.readRegime();
    } catch {
      regime = null;
    }
    return Object.assign({}, s, { hlReady: m.hlReady(), opens, wallet, nav, regime });
  });

export const setPilot = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => ({
    autonome: typeof input.autonome === "boolean" ? input.autonome : undefined,
    kill: typeof input.kill === "boolean" ? input.kill : undefined,
    asset: typeof input.asset === "string" ? input.asset : undefined,
    interval: typeof input.interval === "string" ? input.interval : undefined,
    grokCallsPerHour:
      input.grokCallsPerHour != null && Number.isFinite(Number(input.grokCallsPerHour))
        ? Number(input.grokCallsPerHour)
        : undefined,
    scanEveryMin:
      input.scanEveryMin != null && Number.isFinite(Number(input.scanEveryMin))
        ? Number(input.scanEveryMin)
        : undefined,
    grokUsdPerDay:
      input.grokUsdPerDay != null && Number.isFinite(Number(input.grokUsdPerDay))
        ? Number(input.grokUsdPerDay)
        : undefined,
    strategy:
      input.strategy === "btc_25_10" || input.strategy === "legacy"
        ? (input.strategy as "btc_25_10" | "legacy")
        : undefined,
  }))
  .handler(async ({ data }) => {
    const m = await import("./pilot.server");
    m.startPilot();
    return m.patchPilot(data);
  });

export const loadDeptWallet = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./pilot.server");
    return m.liveWallet();
  });

export const runPilotTick = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const m = await import("./pilot.server");
    m.startPilot();
    await m.forceTick();
    const s = m.readPilot();
    return {
      lastStage: s.lastStage,
      lastReason: s.lastReason,
      lastError: s.lastError,
      lastOrder: s.lastOrder,
      cycles: s.cycles,
    };
  });

export const resumeRegime = createServerFn({ method: "POST" })
  .validator((input: Record<string, never> | undefined) => input ?? {})
  .handler(async () => {
    const r = await import("./regime.server");
    return r.resumeRegime(true);
  });
