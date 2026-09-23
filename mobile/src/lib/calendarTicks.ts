/**
 * Les graduations de l'axe des temps de l'Oracle, en dates du calendrier.
 *
 * Le repère ne part plus d'un jour zéro commun : il couvre une fenêtre
 * calendaire, avec du passé à gauche d'« aujourd'hui » et des paris ouverts à
 * des dates différentes. Des repères relatifs (`J+3`, `M+2`) ne diraient plus
 * de quel jour on parle. On pose donc de vraies dates — le 25, octobre, 2028 —
 * à l'heure de Nouméa, comme tout le reste de l'app.
 *
 * Module pur : ni horloge implicite, ni `Intl`.
 */

import { CLUB_OFFSET_MINUTES } from './clubTime';

const DAY_MS = 86_400_000;
const OFFSET_MS = CLUB_OFFSET_MINUTES * 60_000;

const MONTHS = [
  'JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN',
  'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC',
];

/** Au-delà, les étiquettes se chevauchent sur 320 points de large. */
const MAX_TICKS = 6;

export interface TimeTick {
  label: string;
  /** Position, en jours depuis l'origine de la fenêtre. */
  day: number;
}

/** Un instant du calendrier de Nouméa (année, mois 0–11, jour) → millisecondes UTC. */
function clubInstant(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - OFFSET_MS;
}

/** Les composantes calendaires d'un instant, lues à Nouméa. */
function clubParts(ms: number) {
  const d = new Date(ms + OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * Les graduations d'une fenêtre qui commence à `originMs` et dure `days` jours.
 *
 * L'unité suit la durée :
 *
 *   • jusqu'à trois semaines, des **jours** (`25`) ;
 *   • jusqu'à deux ans et demi, des **mois** (`OCT`) — janvier porte l'année,
 *     sans quoi on ne saurait pas de quelle année est « MARS » ;
 *   • au-delà, des **années** (`2028`).
 */
export function calendarTicks(originMs: number, days: number): TimeTick[] {
  if (!Number.isFinite(originMs) || !(days > 0)) return [];
  const end = originMs + days * DAY_MS;
  const at = (ms: number) => (ms - originMs) / DAY_MS;
  const out: TimeTick[] = [];

  if (days <= 21) {
    const step = Math.max(1, Math.ceil(days / MAX_TICKS));
    const start = clubParts(originMs);
    // Premier minuit de Nouméa au plus tôt à l'origine.
    let t = clubInstant(start.year, start.month, start.day);
    if (t < originMs) t += DAY_MS;
    for (; t <= end; t += step * DAY_MS) {
      out.push({ label: String(clubParts(t).day).padStart(2, '0'), day: at(t) });
    }
    return out;
  }

  if (days <= 900) {
    const months = days / 30.44;
    const step = Math.max(1, Math.ceil(months / MAX_TICKS));
    const start = clubParts(originMs);
    let year = start.year;
    let month = start.month;
    // Premier début de mois au plus tôt à l'origine.
    if (clubInstant(year, month, 1) < originMs) {
      month += 1;
      if (month === 12) {
        month = 0;
        year += 1;
      }
    }
    for (;;) {
      const t = clubInstant(year, month, 1);
      if (t > end) break;
      out.push({ label: month === 0 ? String(year) : MONTHS[month]!, day: at(t) });
      month += step;
      while (month >= 12) {
        month -= 12;
        year += 1;
      }
    }
    return out;
  }

  const years = days / 365.25;
  const step = Math.max(1, Math.ceil(years / MAX_TICKS));
  let year = clubParts(originMs).year;
  if (clubInstant(year, 0, 1) < originMs) year += 1;
  for (let t = clubInstant(year, 0, 1); t <= end; year += step, t = clubInstant(year, 0, 1)) {
    out.push({ label: String(year), day: at(t) });
  }
  return out;
}
