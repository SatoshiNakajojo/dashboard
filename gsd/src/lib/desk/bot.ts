/** Bot Grok existant — Grok Strategy Department. Ne pas en créer un autre. */
export const GROK_STRATEGY_BOT_ID = "e8b2ded4-9c60-4d55-b905-865f0a94eba3";
export const GROK_STRATEGY_BOT_URL = `https://grok.com/bot/${GROK_STRATEGY_BOT_ID}`;
export const GROK_STRATEGY_BOT_LABEL = "Stratégie de Trading";
export const GSD_HL_AGENT_NAME = "Grok Strategy Dp";

/** Wallet du département — isolé du desk. Dérivé de l'id bot, pas le wallet du desk. */
export const GSD_WALLET_ADDRESS = ("0x" +
  GROK_STRATEGY_BOT_ID.replace(/-/g, "").slice(0, 32) +
  GROK_STRATEGY_BOT_ID.replace(/-/g, "").slice(0, 8)) as `0x${string}`;

/* ------------------------------------------------------------------ *
 * Politique de risque — un seul endroit, des unités nommées.
 *
 * Toute taille de position descend de GSD_RISK_PCT et de la distance au
 * stop. Les autres constantes sont des PLAFONDS : elles ne peuvent que
 * réduire la taille calculée, jamais l'augmenter.
 * ------------------------------------------------------------------ */

/** Notionnel absolu maximal d'une position, en dollars. */
export const GSD_NOTIONAL_USD = 300;

/** Notionnel minimal accepté par Hyperliquid. Sous ce seuil, on n'envoie pas. */
export const GSD_MIN_NOTIONAL = 10;

/** Nombre maximal de positions ouvertes simultanément. */
export const GSD_MAX_OPEN = 5;

/**
 * Fraction de l'équité risquée par trade, entre l'entrée et le stop.
 * C'est la seule constante qui DÉTERMINE une taille ; toutes les autres
 * la bornent.
 */
export const GSD_RISK_PCT = 0.01;

/** Notionnel maximal d'une position, en fraction de l'équité. */
export const GSD_MAX_SLOT_PCT = 0.5;

/** Notionnel maximal du livre entier, en fraction de l'équité. */
export const GSD_MAX_BOOK_PCT = 1.5;

/**
 * Part de la marge libre gardée en réserve et jamais engagée.
 * Sans elle, cinq créneaux consomment 100 % du compte et le sixième
 * ordre — comme le moindre mouvement adverse — se fait refuser.
 */
export const GSD_MARGIN_RESERVE_PCT = 0.3;

/** Levier demandé à l'exchange. */
export const GSD_LEVERAGE = 2;

/**
 * Distance au stop admissible, en fraction du prix d'entrée.
 * Sous le plancher le stop est du bruit ; au-dessus du plafond, le signal
 * est refusé plutôt que dimensionné à une taille dérisoire.
 */
export const GSD_MIN_STOP_FRAC = 0.005;
export const GSD_MAX_STOP_FRAC = 0.15;

/**
 * Filet de sécurité : perte latente, en multiple du risque prévu, au-delà
 * de laquelle on ferme sans attendre. Le stop chez l'exchange reste le
 * contrôle principal — ceci ne se déclenche que s'il a échoué.
 */
export const GSD_BACKSTOP_R = 1.5;

/** Notionnel sous lequel une position est une miette à liquider. */
export const GSD_DUST_NOTIONAL = 5;

/** Âge au-delà duquel une position sans gain est rendue au marché. */
export const GSD_TIME_STOP_H = 24;

export const GSD_AUTOPILOT_MS = 5 * 60 * 1000;
