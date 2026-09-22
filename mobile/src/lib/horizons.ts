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
  { key: '1w', label: '1 SEM', long: 'Une semaine', days: 7, editingHours: 24 },
  { key: '3m', label: '3 MOIS', long: 'Trois mois', days: 90, editingHours: 72 },
  { key: '6m', label: '6 MOIS', long: 'Six mois', days: 182, editingHours: 120 },
  { key: '12m', label: '1 AN', long: 'Un an', days: 365, editingHours: 168 },
  { key: '5y', label: '5 ANS', long: 'Cinq ans', days: 5 * 365, editingHours: 336 },
  { key: '10y', label: '10 ANS', long: 'Dix ans', days: 10 * 365, editingHours: 336 },
] as const;

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
 * La part du pari déjà écoulée, de 0 à 1.
 *
 * Sert au repère : c'est là que se place le trait « aujourd'hui ». Bornée des
 * deux côtés — une horloge qui recule ne doit pas sortir le trait du cadre.
 */
export function elapsedFraction(schedule: Schedule, now: number): number {
  const span = schedule.resolvesAt - schedule.openedAt;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (now - schedule.openedAt) / span));
}

/**
 * Les graduations de l'axe des temps, pour cet horizon.
 *
 * Un axe en mois sur un pari d'une semaine ne dit rien ; un axe en jours sur
 * dix ans est illisible. L'unité suit la durée, et on vise quatre à six
 * repères — au-delà, ils se chevauchent sur 320 points de large.
 */
export function timeTicks(key: string): { label: string; day: number }[] {
  const horizon = horizonOf(key);
  const { days } = horizon;

  if (days <= 14) {
    // Une semaine : on compte en jours.
    return [0, 2, 4, 6].filter((d) => d <= days).map((d) => ({ label: `J+${d}`, day: d }));
  }
  if (days <= 400) {
    // Quelques mois à un an : on compte en mois.
    const step = days <= 100 ? 1 : days <= 200 ? 2 : 3;
    const out: { label: string; day: number }[] = [];
    for (let month = 0; month * 30 <= days; month += step) {
      out.push({ label: month === 0 ? 'DÉBUT' : `M+${month}`, day: month * 30 });
    }
    return out;
  }
  // Plusieurs années : on compte en années.
  const years = Math.round(days / 365);
  const step = years <= 5 ? 1 : 2;
  const out: { label: string; day: number }[] = [];
  for (let year = 0; year <= years; year += step) {
    out.push({ label: year === 0 ? 'DÉBUT' : `A+${year}`, day: year * 365 });
  }
  return out;
}

/** Combien de jours d'historique demander pour dessiner ce pari. */
export function historyDaysFor(key: string, openedAt: number, now: number): number {
  const horizon = horizonOf(key);
  const elapsed = Math.ceil((now - openedAt) / DAY_MS);
  // Au moins deux jours : CoinGecko rend une série vide en deçà, et un repère
  // sans courbe réelle n'a rien à quoi se comparer.
  return Math.min(horizon.days, Math.max(2, elapsed));
}
