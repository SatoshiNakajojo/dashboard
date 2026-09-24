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

export type OpenOrder = {
  oid: number;
  isBuy: boolean;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: number | null;
  size: number;
};

export type Account = {
  /** Taille BTC signée ; 0 = à plat. */
  position: number;
  orders: OpenOrder[];
  equity: number;
  markPx: number;
};

export type Action =
  | { kind: "cancel"; oid: number; why: string }
  | { kind: "keep"; oid: number; why: string }
  | {
      kind: "market";
      buy: boolean;
      size: number;
      purpose: "entrée" | "sortie" | "couverture";
      why: string;
    }
  | {
      kind: "stop";
      buy: boolean;
      triggerPx: number;
      size: number;
      reduceOnly: boolean;
      why: string;
    }
  | { kind: "none"; why: string };

export type PlanOptions = {
  /** Pas de taille de l'actif (10^-szDecimals). */
  step: number;
  /** Notionnel minimal accepté par l'exchange. */
  minNotional: number;
  /** Écart de prix toléré avant de remplacer un ordre stop (fraction). */
  pxTol?: number;
  /** Écart de taille toléré avant de remplacer un stop d'entrée (fraction). */
  sizeTol?: number;
  notionalMult?: number;
};

export function floorTo(x: number, step: number) {
  if (!(x > 0) || !(step > 0)) return 0;
  const k = Math.floor(x / step + 1e-9);
  return Number((k * step).toFixed(12));
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.abs(b) * tol;

/**
 * Ce que le compte doit faire pour porter exactement l'état de la règle.
 *
 * `levels` sont ceux de la barre en cours. Les actions au marché passent
 * avant les stops : le serveur exécute, relit le compte, puis replanifie.
 */
export function plan(
  state: { long: boolean; exitedToday: boolean; levels: Levels },
  acc: Account,
  o: PlanOptions,
): Action[] {
  const pxTol = o.pxTol ?? 0.0005;
  const sizeTol = o.sizeTol ?? 0.03;
  const mult = o.notionalMult ?? BTC_RULE.notionalMult;
  const out: Action[] = [];
  const half = o.step / 2;
  const cancelAll = (why: string, except?: number) => {
    for (const x of acc.orders) if (x.oid !== except) out.push({ kind: "cancel", oid: x.oid, why });
  };

  if (acc.position < -half) {
    cancelAll("la règle est long seul");
    out.push({
      kind: "market",
      buy: true,
      size: Math.abs(acc.position),
      purpose: "couverture",
      why: "position courte inattendue : on la referme",
    });
    return out;
  }
  const long = acc.position > half;

  if (state.long && !long) {
    const size = floorTo((acc.equity * mult) / acc.markPx, o.step);
    cancelAll("la règle est en position, l'entrée se fait au marché");
    if (size * acc.markPx < o.minNotional) {
      out.push({
        kind: "none",
        why: `compte trop petit : ${(acc.equity * mult).toFixed(2)} $ pour un minimum de ${o.minNotional} $`,
      });
      return out;
    }
    out.push({
      kind: "market",
      buy: true,
      size,
      purpose: "entrée",
      why: "la règle est en position, le compte non : entrée au marché",
    });
    return out;
  }

  if (!state.long && long) {
    cancelAll("la règle est sortie");
    out.push({
      kind: "market",
      buy: false,
      size: acc.position,
      purpose: "sortie",
      why: "la règle est sortie, le compte non : sortie au marché",
    });
    return out;
  }

  if (long) {
    const px = state.levels.exit;
    const ok = acc.orders.find(
      (x) =>
        x.isTrigger &&
        !x.isBuy &&
        x.reduceOnly &&
        x.triggerPx != null &&
        near(x.triggerPx, px, pxTol) &&
        Math.abs(x.size - acc.position) <= half,
    );
    cancelAll("remplacé par le stop du jour", ok?.oid);
    if (ok) out.push({ kind: "keep", oid: ok.oid, why: "stop de sortie en place" });
    else
      out.push({
        kind: "stop",
        buy: false,
        triggerPx: px,
        size: acc.position,
        reduceOnly: true,
        why: "stop de sortie au plus bas des 10 jours",
      });
    return out;
  }

  // À plat, et la règle aussi.
  if (state.exitedToday) {
    cancelAll("pas de ré-entrée le jour d'une sortie");
    out.push({ kind: "none", why: "sortie aujourd'hui : l'entrée se réarme demain" });
    return out;
  }
  const px = state.levels.entry;
  const size = floorTo((acc.equity * mult) / px, o.step);
  if (size * px < o.minNotional) {
    cancelAll("compte trop petit pour un ordre");
    out.push({
      kind: "none",
      why: `compte trop petit : ${(acc.equity * mult).toFixed(2)} $ pour un minimum de ${o.minNotional} $`,
    });
    return out;
  }
  const ok = acc.orders.find(
    (x) =>
      x.isTrigger &&
      x.isBuy &&
      !x.reduceOnly &&
      x.triggerPx != null &&
      near(x.triggerPx, px, pxTol) &&
      near(x.size, size, sizeTol),
  );
  cancelAll("remplacé par le stop d'entrée du jour", ok?.oid);
  if (ok) out.push({ kind: "keep", oid: ok.oid, why: "stop d'entrée en place" });
  else
    out.push({
      kind: "stop",
      buy: true,
      triggerPx: px,
      size,
      reduceOnly: false,
      why: "stop d'entrée au plus haut des 25 jours",
    });
  return out;
}
