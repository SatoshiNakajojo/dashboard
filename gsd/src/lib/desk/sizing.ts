import {
  GSD_MARGIN_RESERVE_PCT,
  GSD_LEVERAGE,
  GSD_MAX_BOOK_PCT,
  GSD_MAX_SLOT_PCT,
  GSD_MAX_STOP_FRAC,
  GSD_MIN_NOTIONAL,
  GSD_MIN_STOP_FRAC,
  GSD_NOTIONAL_USD,
  GSD_RISK_PCT,
} from "./bot.ts";

/*
 * Dimensionnement des positions — module PUR, sans dépendance à l'exchange.
 *
 * C'est la pièce que l'audit a désignée comme cause racine : l'ancien calcul
 * ignorait la distance au stop, et multipliait la fraction de créneau par le
 * levier, si bien que cinq positions consommaient 100 % du compte en marge.
 * Isolé ici, il est testable sans réseau ni clé.
 */

/** Notionnel maximal d'UNE position. Plafond, pas une cible. */
export function orderTarget(equity: number) {
  const eq = Number.isFinite(equity) ? Math.max(0, equity) : 0;
  return Math.min(GSD_NOTIONAL_USD, eq * GSD_MAX_SLOT_PCT);
}

/** Ce que la marge libre autorise, réserve déduite. Plafond, pas une cible. */
export function marginCeiling(free: number) {
  if (!Number.isFinite(free)) return 0;
  return Math.max(0, free) * (1 - GSD_MARGIN_RESERVE_PCT) * GSD_LEVERAGE;
}

/** Plafond effectif affiché au pupitre : le plus contraignant des deux. */
export function orderNotional(equity: number, free?: number) {
  let cap = orderTarget(equity);
  if (free != null && Number.isFinite(free)) cap = Math.min(cap, marginCeiling(free));
  return Number.isFinite(cap) ? Math.max(0, cap) : 0;
}

/** Ce qui a borné la taille — nommé, pour que le journal le dise. */
export type SizeBind = "risque" | "position" | "livre" | "marge" | "plafond";

export type SizePlan = {
  /** Notionnel à engager, en dollars. */
  notional: number;
  /** Dollars réellement risqués entre l'entrée et le stop. */
  risqueUsd: number;
  /** Distance au stop, en fraction du prix d'entrée. */
  stopFrac: number;
  /** La contrainte qui a décidé de la taille. */
  bind: SizeBind;
};

/**
 * Taille d'une position, depuis le risque et la distance au stop.
 *
 * C'est le correctif central de l'audit : l'ancien calcul ignorait le stop,
 * si bien qu'un signal à −36 % et un signal à −3 % recevaient le MÊME
 * notionnel — un risque réel variant d'un facteur douze. Ici la distance au
 * stop est au dénominateur : plus le stop est loin, plus la position est
 * petite, et le risque en dollars reste constant.
 */
export function planSize(input: {
  equity: number;
  free: number;
  entry: number;
  stop: number;
  bookNotional?: number;
}): { ok: true; plan: SizePlan } | { ok: false; error: string } {
  const { equity, free, entry, stop } = input;
  const book = Number.isFinite(input.bookNotional) ? Math.max(0, input.bookNotional as number) : 0;

  if (!Number.isFinite(equity) || equity <= 0) return { ok: false, error: "équité illisible ou nulle" };
  if (!Number.isFinite(entry) || entry <= 0) return { ok: false, error: "prix d'entrée illisible" };
  if (!Number.isFinite(stop) || stop <= 0) return { ok: false, error: "stop absent — aucune taille calculable" };

  const stopFrac = Math.abs(entry - stop) / entry;
  if (!Number.isFinite(stopFrac) || stopFrac < GSD_MIN_STOP_FRAC) {
    return { ok: false, error: `stop à ${(stopFrac * 100).toFixed(2)} % — trop proche pour dimensionner` };
  }
  if (stopFrac > GSD_MAX_STOP_FRAC) {
    return {
      ok: false,
      error: `stop à ${(stopFrac * 100).toFixed(1)} % (max ${(GSD_MAX_STOP_FRAC * 100).toFixed(0)} %) — signal refusé`,
    };
  }

  const risqueUsd = GSD_RISK_PCT * equity;
  const bornes: Array<{ bind: SizeBind; v: number }> = [
    { bind: "risque", v: risqueUsd / stopFrac },
    { bind: "position", v: equity * GSD_MAX_SLOT_PCT },
    { bind: "livre", v: Math.max(0, equity * GSD_MAX_BOOK_PCT - book) },
    { bind: "marge", v: marginCeiling(free) },
    { bind: "plafond", v: GSD_NOTIONAL_USD },
  ];

  let retenu = bornes[0];
  for (const b of bornes) if (b.v < retenu.v) retenu = b;

  if (!Number.isFinite(retenu.v) || retenu.v < GSD_MIN_NOTIONAL) {
    return {
      ok: false,
      error: `ticket ${retenu.v.toFixed(2)} $ sous le minimum ${GSD_MIN_NOTIONAL} $ — bridé par « ${retenu.bind} »`,
    };
  }

  return {
    ok: true,
    plan: {
      notional: retenu.v,
      risqueUsd: retenu.v * stopFrac,
      stopFrac,
      bind: retenu.bind,
    },
  };
}

export type HlBalances = {
  perps: number;
  spot: number;
  /** Part du spot immobilisée en collatéral des perps. */
  spotHold: number;
  /** Spot disponible, transférable vers les perps. */
  spotFree: number;
  total: number;
  withdrawable: number;
  marginUsed: number;
  unified: boolean;
  /** Équité économique : ce sur quoi on dimensionne le risque. */
  trading: number;
  /** Marge utilisable IMMÉDIATEMENT côté perps. Le spot libre n'en fait pas
   *  partie : il faut un usdClassTransfer avant de pouvoir s'en servir. */
  free: number;
  upnl: number;
  cash: number;
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/*
 * Relevé du 22/09/2026, après la coupe des quatre positions :
 *   spot USDC  total 47,078827  hold 0,323338
 *   perp       accountValue 0,322794
 * `accountValue` ne valait plus que la marge immobilisée. Lire l'équité
 * dessus faisait croire à un compte de 0,32 $ au lieu de 47,08 $ — et tout
 * dimensionnement en aval s'effondrait. L'équité est donc le perp PLUS le
 * spot libre, les deux relevés séparément.
 */
export function classifyHl(
  perps: number,
  spot: number,
  withdrawable = 0,
  marginUsed = 0,
  spotHold = 0,
): HlBalances {
  // Clampés : une valeur de compte négative n'existe pas chez l'exchange, et
  // en laisser passer une contaminerait tout le dimensionnement en aval.
  const p = Math.max(0, n(perps));
  const s = Math.max(0, n(spot));
  const w = Math.max(0, n(withdrawable));
  const m = Math.max(0, n(marginUsed));
  const h = Math.min(Math.max(0, n(spotHold)), s);
  const spotFree = Math.max(0, s - h);

  // Le spot immobilisé sert déjà de collatéral aux perps : le compter en plus
  // du perp reviendrait à additionner deux fois la même garantie.
  const trading = p + spotFree;
  const free = w > 0 ? w : Math.max(0, p - m);
  const unified = h > 0 && s > 0 && Math.abs(p - h) <= Math.max(0.5, 0.05 * Math.max(p, h));

  return {
    perps: p,
    spot: s,
    spotHold: h,
    spotFree,
    total: trading,
    withdrawable: w,
    marginUsed: m,
    unified,
    trading,
    free,
    upnl: 0,
    cash: trading,
  };
}

export function hlTradingEquity(perps: number, spot: number) {
  return classifyHl(perps, spot).trading;
}
