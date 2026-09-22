import { createServerFn } from "@tanstack/react-start";
import { GSD_NOTIONAL_USD, GSD_WALLET_ADDRESS } from "./bot";

export const loadDeptWallet = createServerFn({ method: "GET" }).handler(async () => {
  const envAddr = process.env.GSD_WALLET_ADDRESS?.trim();
  const address = (envAddr && /^0x[a-fA-F0-9]{40}$/.test(envAddr) ? envAddr : GSD_WALLET_ADDRESS) as string;
  const liveKey = Boolean(process.env.GSD_HL_PRIVATE_KEY);

  let hlEquity: number | null = null;
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: address }),
    });
    if (res.ok) {
      const json = (await res.json()) as { marginSummary?: { accountValue?: string } };
      const v = Number(json.marginSummary?.accountValue);
      if (Number.isFinite(v)) hlEquity = v;
    }
  } catch {
    /* lecture HL facultative */
  }

  return {
    address,
    notional: GSD_NOTIONAL_USD,
    liveReady: liveKey,
    hlEquity,
    venue: liveKey ? "hyperliquid" : "gsd",
  };
});
