/**
 * Les horizons de pari de l'Oracle.
 *
 * L'Oracle ne connaissait qu'une saison de 90 jours, une prédiction par membre,
 * et tout se verrouillait ensemble. Le club veut parier sur une semaine **et**
 * sur dix ans, en parallèle, chaque pari suivant son propre calendrier.
 *
 * Deux durées distinctes par horizon, et les confondre est le défaut qu'on
 * évite ici :
 *
 *   • la **fenêtre d'écriture** — le temps pendant lequel on peut encore
 *     redessiner. Elle est courte, et proportionnée : on ne laisse pas dix
 *     jours pour réviser un pari d'une semaine ;
 *   • la **durée du pari** — au bout de laquelle il se résout.
 *
 * Elles n'ont pas le même rôle. La première protège la sincérité du pari, la
 * seconde est le pari lui-même.
 */

export type HorizonKey = '1w' | '3m' | '6m' | '12m' | '5y' | '10y';

export interface Horizon {
  key: HorizonKey;
  /** Ce qu'on lit sur le sélecteur : court, sans ambiguïté. */
  label: string;
  /** Ce qu'on lit dans l'historique : la phrase complète. */
  long: string;
  /** Durée du pari, en jours. */
  days: number;
  /** Temps laissé pour redessiner avant verrouillage, en heures. */
  editingHours: number;
  /**
   * Le multiplicateur des points au classement (`standings.ts`).
   *
   * Viser juste à une semaine est facile — le bitcoin bouge de quelques pour
   * cent — et à un an beaucoup moins. Sans poids, le classement irait à qui
   * parie chaque semaine et fuit les longs horizons. Le poids croît moins vite
   * que la durée : un pari à dix ans ne doit pas écraser dix ans de semaines.
   */
  weight: number;
}

const DAY_MS = 86_400_000;

/**
 * Les six horizons, du plus court au plus long.
 *
 * Les années comptent 365 jours et non 365,25 : un pari de dix ans qui se
 * résoudrait deux jours et demi plus tard que prévu n'intéresse personne, et la
 * simplicité vaut mieux qu'une exactitude que le club ne vérifiera pas.
 */
export const HORIZONS: readonly Horizon[] = [
  { key: '1w', label: '1 SEM', long: 'Une semaine', days: 7, editingHours: 24, weight: 1 },
  { key: '3m', label: '3 MOIS', long: 'Trois mois', days: 90, editingHours: 72, weight: 2 },
  { key: '6m', label: '6 MOIS', long: 'Six mois', days: 182, editingHours: 120, weight: 3 },
  { key: '12m', label: '1 AN', long: 'Un an', days: 365, editingHours: 168, weight: 4 },
  {
    key: '5y',
    label: '5 ANS',
    long: 'Cinq ans',
    days: 5 * 365,
    editingHours: 336,
    weight: 6,
  },
  {
    key: '10y',
    label: '10 ANS',
    long: 'Dix ans',
    days: 10 * 365,
    editingHours: 336,
    weight: 8,
  },
] as const;

/** Vrai si la clé désigne un horizon connu de cette version de l'app. */
export function isHorizonKey(key: unknown): key is HorizonKey {
  return typeof key === 'string' && HORIZONS.some((horizon) => horizon.key === key);
}

/** L'horizon par défaut : celui de l'ancienne saison, pour ne dérouter personne. */
export const DEFAULT_HORIZON: HorizonKey = '3m';

const BY_KEY = new Map(HORIZONS.map((horizon) => [horizon.key, horizon]));

/**
 * L'horizon désigné par sa clé.
 *
 * Retombe sur celui par défaut plutôt que de lever : une clé inconnue vient
 * forcément d'une ligne en base écrite par une version plus récente, et un
 * écran vide serait pire qu'un axe un peu faux.
 */
export function horizonOf(key: string | null | undefined): Horizon {
  return BY_KEY.get((key ?? '') as HorizonKey) ?? BY_KEY.get(DEFAULT_HORIZON)!;
}

export interface Schedule {
  /** Instant d'ouverture, en millisecondes. */
  openedAt: number;
  /** Au-delà, le tracé ne bouge plus. */
  locksAt: number;
  /** Au-delà, le pari est jugé. */
  resolvesAt: number;
}

/** Le calendrier d'un pari ouvert à cet instant. */
export function scheduleFor(key: string, openedAt: number): Schedule {
  const horizon = horizonOf(key);
  return {
    openedAt,
    locksAt: openedAt + horizon.editingHours * 3_600_000,
    resolvesAt: openedAt + horizon.days * DAY_MS,
  };
}

export type BetPhase = 'open' | 'locked' | 'resolved';

/**
 * Où en est un pari.
 *
 * Les trois états sont exclusifs et ordonnés : un pari résolu l'emporte sur un
 * pari verrouillé, même si les deux instants sont dépassés. Les comparer dans
 * l'autre sens ferait afficher « verrouillé » sur un pari clos depuis des
 * années.
 */
export function phaseOf(schedule: Schedule, now: number): BetPhase {
  if (now >= schedule.resolvesAt) return 'resolved';
  if (now >= schedule.locksAt) return 'locked';
  return 'open';
}

/**
 * La bande de prix minimale d'un horizon, en multiples du cours du jour.
 *
 * Le repère se cale sur ce qu'il affiche — mais au moment d'ouvrir un pari à
 * dix ans, il n'affiche que quelques jours de cours, serrés autour du prix du
 * jour. Sans plancher de bande, on ne pourrait pas tracer un bitcoin à 1 M$ :
 * le doigt butterait sur un plafond à 130 k$.
 *
 * La bande ne dépend **jamais** du tracé en cours. Sinon l'échelle se
 * recalculerait sous le doigt à chaque point, et la courbe glisserait pendant
 * qu'on la dessine.
 */
export function bandFor(key: string): { low: number; high: number } {
  switch (horizonOf(key).key) {
    case '1w':
      return { low: 0.85, high: 1.15 };
    case '3m':
      return { low: 0.6, high: 1.6 };
    case '6m':
      return { low: 0.5, high: 2 };
    case '12m':
      return { low: 0.4, high: 2.6 };
    case '5y':
      return { low: 0.3, high: 6 };
    case '10y':
      return { low: 0.3, high: 12 };
  }
}

/**
 * Combien de jours de cours montrer **avant** aujourd'hui, pour cet horizon.
 *
 * On ne trace pas une suite sans voir ce qui précède : un repère qui commence
 * pile au moment du pari n'offre aucun cours auquel raccrocher sa courbe. Un
 * tiers de l'horizon, environ — sauf au-delà d'un an, borné par ce que
 * CoinGecko rend gratuitement (`MAX_HISTORY_DAYS` dans `coingecko.ts`).
 */
export function lookbackDays(key: string): number {
  switch (horizonOf(key).key) {
    case '1w':
      return 3;
    case '3m':
      return 30;
    case '6m':
      return 60;
    case '12m':
      return 120;
    case '5y':
    case '10y':
      return 360;
  }
}

/** `24 H`, `3 J`, `14 J` — la fenêtre de révision, dite comme on la lit. */
export function editingLabel(key: string): string {
  const hours = horizonOf(key).editingHours;
  return hours < 48 ? `${hours} H` : `${Math.round(hours / 24)} J`;
}
