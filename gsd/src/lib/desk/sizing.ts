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
