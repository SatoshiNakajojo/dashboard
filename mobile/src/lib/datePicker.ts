/**
 * Choisir une date et une heure sans les taper — la partie sans écran.
 *
 * La feuille d'une soirée garde ses champs au format de saisie historique
 * (`03/10/2026`, `19:30`), que `parseClubDateTime` sait lire. Le calendrier,
 * lui, parle en clés de jour (`2026-10-03`, celles de `monthGrid.ts`). Ce
 * module passe de l'un à l'autre, et fournit la liste des heures du menu.
 */

const FIELD_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const pad = (value: number) => String(value).padStart(2, '0');

/** `03/10/2026` → `2026-10-03`, ou `null` si ce n'est pas un jour du calendrier. */
export function keyFromFieldDate(date: string): string | null {
  const match = FIELD_DATE_RE.exec(date.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (probe.getUTCDate() !== Number(d) || probe.getUTCMonth() !== Number(m) - 1) return null;
  return `${y}-${m}-${d}`;
}

/** `2026-10-03` → `03/10/2026`. */
export function fieldDateFromKey(key: string): string {
  const match = KEY_RE.exec(key);
  if (!match) return '';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

/** Le jour `delta` jours plus tard (ou plus tôt) : `2026-09-26`, −7 → `2026-09-19`. */
export function shiftDayKey(key: string, delta: number): string {
  const match = KEY_RE.exec(key);
  if (!match) return key;
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta),
  );
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** Le mois d'un jour, pour ouvrir le calendrier dessus. */
export function monthOfKey(key: string): { year: number; month: number } {
  const match = KEY_RE.exec(key);
  if (!match) return { year: 1970, month: 1 };
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parts(key: string): Date | null {
  const match = KEY_RE.exec(key);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** `sam. 3 oct. 2026` — ce qu'affiche le champ. */
export function shortDateLabel(key: string): string {
  const day = parts(key);
  if (!day) return '';
  return `${DAYS_SHORT[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS_SHORT[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** `samedi 3 octobre 2026` — ce que lit un lecteur d'écran. */
export function longDateLabel(key: string): string {
  const day = parts(key);
  if (!day) return '';
  return `${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** Pas du menu des heures, en minutes. */
export const TIME_STEP_MINUTES = 15;

/**
 * Les heures du menu : toute la journée, par quart d'heure. Une heure déjà
 * choisie hors de ce pas (une soirée à 19:40) y figure aussi, à sa place :
 * modifier la soirée ne doit pas la déplacer en silence.
 */
export function timeOptions(current?: string, step: number = TIME_STEP_MINUTES): string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    options.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  if (current && TIME_RE.test(current) && !options.includes(current)) {
    options.push(current);
    options.sort();
  }
  return options;
}
