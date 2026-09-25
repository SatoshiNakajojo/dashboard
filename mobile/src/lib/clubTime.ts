/**
 * Dates et heures du club.
 *
 * Une Crypto Night a lieu à Nouméa. L'heure saisie est donc **toujours** de
 * l'heure calédonienne, quel que soit le fuseau du téléphone qui la saisit :
 * un membre en déplacement qui programme « 19 h 30 » veut 19 h 30 chez lui, pas
 * 19 h 30 à Tokyo. Laisser `new Date(y, m, d, h, min)` décider, c'est laisser
 * le fuseau de l'appareil choisir à sa place.
 *
 * La Nouvelle-Calédonie est à UTC+11 toute l'année — pas d'heure d'été, donc
 * pas de cas limite deux fois par an.
 *
 * Module **pur** : ni horloge implicite, ni `Intl`. Une date mal lue s'écrirait
 * en base et décalerait la soirée pour tout le monde.
 */

/** Décalage de Nouméa, en minutes. Constant toute l'année. */
export const CLUB_OFFSET_MINUTES = 11 * 60;

/** `+11:00` — le suffixe que PostgreSQL attend pour un `timestamptz`. */
export const CLUB_OFFSET_SUFFIX = '+11:00';

const DATE_RE = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/;
const TIME_RE = /^(\d{1,2})\s*[:hH]\s*(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * `'03/10/2026'` + `'19:30'` → `'2026-10-03T19:30:00+11:00'`.
 *
 * Renvoie `null` sur une saisie que la base refuserait, **y compris une date
 * qui n'existe pas** : le 31 février se lit sans erreur si on se contente de
 * découper des nombres.
 */
export function parseClubDateTime(date: string, time: string): string | null {
  const day = DATE_RE.exec(date.trim());
  const clock = TIME_RE.exec(time.trim());
  if (!day || !clock) return null;

  const d = Number(day[1]);
  const m = Number(day[2]);
  const y = Number(day[3]);
  const hh = Number(clock[1]);
  const mm = Number(clock[2]);

  if (hh > 23 || mm > 59) return null;
  if (m < 1 || m > 12 || d < 1) return null;

  // Le 31 avril se découpe parfaitement ; seule une reconstruction le démasque.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  // Écrit tel quel plutôt que converti : le décalage est explicite dans la
  // chaîne, et aucune arithmétique ne peut le fausser.
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${CLUB_OFFSET_SUFFIX}`;
}

/** Le jour même, à Nouméa, au format de saisie — pour pré-remplir le champ. */
export function todayInClub(now: number = Date.now()): string {
  const here = new Date(now + CLUB_OFFSET_MINUTES * 60_000);
  return `${pad(here.getUTCDate())}/${pad(here.getUTCMonth() + 1)}/${here.getUTCFullYear()}`;
}

/**
 * L'inverse de `parseClubDateTime` : un instant, relu à l'heure de Nouméa, dans
 * le format des champs de saisie — pour pré-remplir la feuille d'une soirée
 * qu'on modifie. `'2026-10-03T08:30:00Z'` → `{ date: '03/10/2026', time: '19:30' }`.
 */
export function clubDateTimeParts(iso: string): { date: string; time: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const here = new Date(ms + CLUB_OFFSET_MINUTES * 60_000);
  return {
    date: `${pad(here.getUTCDate())}/${pad(here.getUTCMonth() + 1)}/${here.getUTCFullYear()}`,
    time: `${pad(here.getUTCHours())}:${pad(here.getUTCMinutes())}`,
  };
}
