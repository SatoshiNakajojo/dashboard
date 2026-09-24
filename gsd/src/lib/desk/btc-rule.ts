/**
 * La règle BTC 25/10 — proposée par Grok, testée dans `research/grok-btc`.
 *
 * BTC seul, en journalier. Achat au plus haut des 25 derniers jours, sortie au
 * plus bas des 10 derniers jours. Une fois le notionnel, à plat le reste du
 * temps. Pas de short, pas de levier.
 *
 * Ce que la recherche a établi, et qu'il faut garder en tête : son timing
 * bat le hasard hors échantillon (2013–2020, p = 0,0004), mais 25/10 est le
 * meilleur réglage de la période où Grok l'a choisi. C'est une façon de
 * détenir du BTC pendant ses tendances, pas un edge indépendant du BTC.
 *
 * Module pur : il rejoue la règle sur l'historique pour savoir où elle en est
 * maintenant, puis dit quels ordres le compte doit porter. Ni réseau, ni
 * disque — tout est testé.
 */

export const BTC_RULE = { coin: "BTC", entryDays: 25, exitDays: 10, notionalMult: 1 } as const;

export type DayBar = { t: number; o: number; h: number; l: number; c: number };

export type RuleTrade = { entryT: number; entryPx: number; exitT: number; exitPx: number };

export type Levels = { entry: number; exit: number };

export type RuleState = {
  long: boolean;
  entryT: number | null;
  entryPx: number | null;
  lastExitT: number | null;
  /** Niveaux en vigueur sur la dernière barre, calculés sur les barres qui la précèdent. */
  levels: Levels | null;
  /** Niveaux d'une barre qui suivrait la dernière — si celle-ci est close. */
  nextLevels: Levels | null;
  lastBarT: number | null;
  trades: RuleTrade[];
};

function channel(bars: DayBar[], end: number, n: number, m: number): Levels | null {
  if (end < Math.max(n, m)) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = end - n; k < end; k++) hi = Math.max(hi, bars[k].h);
  for (let k = end - m; k < end; k++) lo = Math.min(lo, bars[k].l);
  return Number.isFinite(hi) && Number.isFinite(lo) ? { entry: hi, exit: lo } : null;
}

/**
 * Rejoue la variante A de la recherche, à l'identique : ordres stop posés aux
 * niveaux du canal ; la sortie d'une position ouverte la veille est vérifiée
 * avant toute entrée ; remplissage au pire de l'ouverture et du niveau ; pas
 * de ré-entrée le jour d'une sortie, pas de sortie le jour d'une entrée.
 *
 * La dernière barre peut être la bougie en cours : ses plus haut et plus bas
 * sont exactement ce que des ordres stop auraient vu jusqu'ici.
 */
export function replay(
  bars: DayBar[],
  rule: { entryDays: number; exitDays: number } = BTC_RULE,
): RuleState {
  const n = rule.entryDays;
  const m = rule.exitDays;
  let long = false;
  let entryT: number | null = null;
  let entryPx: number | null = null;
  let lastExitT: number | null = null;
  let levels: Levels | null = null;
  const trades: RuleTrade[] = [];
  for (let i = 0; i < bars.length; i++) {
    levels = channel(bars, i, n, m);
    if (!levels) continue;
    const b = bars[i];
    if (long) {
      if (b.l <= levels.exit) {
        const exitPx = Math.min(b.o, levels.exit);
        trades.push({ entryT: entryT as number, entryPx: entryPx as number, exitT: b.t, exitPx });
        long = false;
        entryT = null;
        entryPx = null;
        lastExitT = b.t;
      }
    } else if (b.h >= levels.entry) {
      entryPx = Math.max(b.o, levels.entry);
      entryT = b.t;
      long = true;
    }
  }
  return {
    long,
    entryT,
    entryPx,
    lastExitT,
    levels,
    nextLevels: channel(bars, bars.length, n, m),
    lastBarT: bars.length ? bars[bars.length - 1].t : null,
    trades,
  };
}

/** Ce que le compte porte, lu au comptant — plus ce qui reste en perp, à migrer. */
export type SpotAccount = {
  /** UBTC disponible. */
  base: number;
  /** USDC disponible. */
  quote: number;
  /** Prix de la paire UBTC/USDC. */
  markPx: number;
  /** Position BTC en perp, signée : l'ancienne exécution, à refermer. */
  perpPosition: number;
  /** Ordres perp BTC encore au repos. */
  perpOrders: number[];
};

export type SpotAction =
  | { kind: "cancelPerp"; oids: number[]; why: string }
  | { kind: "closePerp"; size: number; why: string }
  | { kind: "buy"; size: number; limitPx: number; why: string }
  | { kind: "sell"; size: number; limitPx: number; why: string }
  | { kind: "hold"; why: string }
  | { kind: "none"; why: string };

export type SpotOptions = {
  /** Pas de taille de l'UBTC (10^-szDecimals). */
  step: number;
  /** Valeur minimale d'un ordre chez l'exchange. */
  minNotional: number;
  /** Écart de prix maximal accepté par un ordre au marché (fraction). */
  slippage?: number;
  /** Part des USDC laissée de côté pour les frais. */
  feeBuffer?: number;
};

export function floorTo(x: number, step: number) {
  if (!(x > 0) || !(step > 0)) return 0;
  const k = Math.floor(x / step + 1e-9);
  return Number((k * step).toFixed(12));
}

/**
 * Ce que le compte doit faire pour porter l'état de la règle, au comptant.
 *
 * Il n'y a pas d'ordre stop au repos : le bot relit la règle à chaque passage
 * et chaque minute, et achète ou vend au marché dès qu'elle change d'état.
 * Ce qui reste en perp — l'exécution d'avant — est refermé d'abord ; le
 * serveur relit alors le compte et replanifie.
 */
export function planSpot(state: { long: boolean }, acc: SpotAccount, o: SpotOptions): SpotAction[] {
  const out: SpotAction[] = [];
  const slip = o.slippage ?? 0.005;
  if (acc.perpOrders.length) {
    out.push({
      kind: "cancelPerp",
      oids: acc.perpOrders,
      why: "la règle se joue au comptant : ordres perp annulés",
    });
  }
  if (Math.abs(acc.perpPosition) > o.step / 2) {
    out.push({
      kind: "closePerp",
      size: Math.abs(acc.perpPosition),
      why: "la règle se joue au comptant : position perp refermée",
    });
    return out;
  }
  const holding = acc.base * acc.markPx >= o.minNotional;
  if (state.long && !holding) {
    const limitPx = acc.markPx * (1 + slip);
    const size = floorTo((acc.quote * (1 - (o.feeBuffer ?? 0.002))) / limitPx, o.step);
    if (size * acc.markPx < o.minNotional) {
      out.push({
        kind: "none",
        why: `compte trop petit : ${acc.quote.toFixed(2)} $ disponibles pour un minimum de ${o.minNotional} $`,
      });
      return out;
    }
    out.push({ kind: "buy", size, limitPx, why: "la règle est en position : achat au comptant" });
    return out;
  }
  if (!state.long && holding) {
    out.push({
      kind: "sell",
      size: floorTo(acc.base, o.step),
      limitPx: acc.markPx * (1 - slip),
      why: "la règle est sortie : vente au comptant",
    });
    return out;
  }
  out.push({
    kind: "hold",
    why: state.long ? "en position, rien à faire" : "à plat, rien à faire",
  });
  return out;
}
