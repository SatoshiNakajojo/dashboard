/** Bot Grok existant — Grok Strategy Department. Ne pas en créer un autre. */
export const GROK_STRATEGY_BOT_ID = "e8b2ded4-9c60-4d55-b905-865f0a94eba3";
export const GROK_STRATEGY_BOT_URL = `https://grok.com/bot/${GROK_STRATEGY_BOT_ID}`;
export const GROK_STRATEGY_BOT_LABEL = "Stratégie de Trading";
export const GSD_HL_AGENT_NAME = "Grok Strategy Dp";

/** Wallet du département — isolé du desk. Dérivé de l'id bot, pas le wallet du desk. */
export const GSD_WALLET_ADDRESS = ("0x" +
  GROK_STRATEGY_BOT_ID.replace(/-/g, "").slice(0, 32) +
  GROK_STRATEGY_BOT_ID.replace(/-/g, "").slice(0, 8)) as `0x${string}`;

export const GSD_NOTIONAL_USD = 300;
export const GSD_MIN_NOTIONAL = 10;
export const GSD_MAX_OPEN = 5;
export const GSD_SLOT_PCT = 0.2;
export const GSD_AUTOPILOT_MS = 5 * 60 * 1000;
