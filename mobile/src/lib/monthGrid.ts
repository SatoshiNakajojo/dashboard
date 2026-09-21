/**
 * Grille d'un mois, à l'heure du club.
 *
 * Six semaines de sept jours, toujours — une hauteur constante évite que la
 * grille saute d'une ligne d'un mois à l'autre, ce qui se voit plus qu'on ne
 * croit quand on feuillette.
 *
 * L'arithmétique se fait en UTC **sur des dates de calendrier**, jamais sur des
 * instants : `Date.UTC(2026, 9, 1)` est « le 1er octobre », pas « minuit
 * quelque part ». C'est ce qui empêche la grille de se décaler d'un jour selon
 * le fuseau de l'appareil qui l'affiche.
 *
 * Seul le rattachement d'une soirée à un jour consulte le décalage du club :
 * une soirée du 3 à 19 h 30 à Nouméa tombe le 2 en UTC, et elle doit apparaître
 * le 3.
 */

import { CLUB_OFFSET_MINUTES } from './clubTime';

export interface MonthDay {
  /** `2026-10-03` — la clé qui rapproche un jour de ses soirées. */
  key: string;
  day: number;
  /** `false` pour les jours de débord, ceux du mois d'avant ou d'après. */
  inMonth: boolean;
  isToday: boolean;
}

/** Lundi en tête : c'est la semaine française, pas celle des tableurs. */
export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

const MONTHS = [
  'JANVIER',
  'FÉVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOÛT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DÉCEMBRE',
];

const pad = (value: number) => String(value).padStart(2, '0');
const keyOf = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Le jour, au club, auquel appartient un instant.
 *
 * `2026-10-03T19:30:00+11:00` tombe le 2 octobre en UTC. Sans ce décalage,
 * chaque soirée de fin de journée apparaîtrait la veille dans la grille.
 */
export function clubDayKey(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  return keyOf(new Date(instant.getTime() + CLUB_OFFSET_MINUTES * 60_000));
}

/** Le mois affiché au départ : celui d'aujourd'hui, au club. */
export function currentMonth(now: number = Date.now()): { year: number; month: number } {
  const here = new Date(now + CLUB_OFFSET_MINUTES * 60_000);
  return { year: here.getUTCFullYear(), month: here.getUTCMonth() + 1 };
}

/** `OCTOBRE 2026`. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? ''} ${year}`;
}

/**
 * `2026-10` — le préfixe que partagent toutes les clés du mois.
 *
 * Feuilleter un mois et voir en dessous une soirée d'un autre mois, c'est ce
 * qu'aucun agenda ne fait : la grille et la liste doivent parler du même mois.
 */
export function monthPrefix(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** Le mois d'à côté, en passant l'année quand il faut. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Six lignes de sept jours, à partir du lundi qui précède le 1er.
 *
 * Les jours de débord appartiennent aux mois voisins : on les affiche en
 * retrait plutôt que de laisser des trous, qui rendent une grille illisible.
 */
export function buildMonth(
  year: number,
  month: number,
  now: number = Date.now(),
): MonthDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // `getUTCDay()` met dimanche à 0 ; on décale pour commencer le lundi.
  const offset = (first.getUTCDay() + 6) % 7;
  const start = Date.UTC(year, month - 1, 1 - offset);

  const here = new Date(now + CLUB_OFFSET_MINUTES * 60_000);
  const todayKey = keyOf(here);

  const weeks: MonthDay[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: MonthDay[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start + (week * 7 + day) * 86_400_000);
      row.push({
        key: keyOf(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1 && date.getUTCFullYear() === year,
        isToday: keyOf(date) === todayKey,
      });
    }
    weeks.push(row);
  }
  return weeks;
}
