/**
 * Formatage français — l'espace insécable avant `%`, `$` et dans les milliers
 * fait partie du design (SPEC §7). `Intl` en RN produit déjà des U+202F pour
 * `fr-FR` ; on normalise pour ne jamais laisser passer une espace ordinaire.
 */

/** Espace insécable étroite (U+202F), celle qu'attend la typographie française. */
const NBSP = ' ';

function normalizeSpaces(input: string): string {
  return input.replace(/[\s  ]/g, NBSP);
}

/** `120911` → `120 911 $`. */
export function formatUsd(value: number, fractionDigits = 0): string {
  const body = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${normalizeSpaces(body)}${NBSP}$`;
}

/**
 * Prix d'un actif : deux décimales sous 1 000 $, aucune au-dessus.
 * `1.84` → `1,84 $` · `103200` → `103 200 $`.
 */
export function formatPrice(value: number): string {
  return formatUsd(value, Math.abs(value) < 1000 ? 2 : 0);
}

/** `14.9` → `+14,9 %` · `-61` → `-61,0 %`. */
export function formatPercent(value: number, fractionDigits = 1): string {
  const sign = value > 0 ? '+' : '';
  const body = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${sign}${normalizeSpaces(body)}${NBSP}%`;
}

/** `164000` → `164 k$` — format des cibles de prédiction. */
export function formatThousands(value: number): string {
  return `${Math.round(value / 1000)}${NBSP}k$`;
}

/** `12500` → `12,5 k$` — taille de position. */
export function formatSize(value: number): string {
  const body = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 1000);
  return `${normalizeSpaces(body)}${NBSP}k$`;
}

/** `912447` → `912 447`. */
export function formatInteger(value: number): string {
  return normalizeSpaces(new Intl.NumberFormat('fr-FR').format(value));
}

const MONTHS_SHORT = [
  'JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN',
  'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC',
];

/** Bloc date d'une carte d'événement : `{ day: '18', month: 'SEPT' }`. */
export function splitEventDate(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '--', month: '' };
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: MONTHS_SHORT[d.getMonth()] ?? '',
  };
}

/** `20:00` — heure locale sans secondes. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Compte à rebours du time-lock, une seule ligne : `2j 07:40:30`.
 * `remainingMs` négatif est ramené à zéro — le verrouillage ne recule pas.
 */
export function formatCountdown(remainingMs: number): string {
  const ms = Math.max(0, remainingMs);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000) % 24;
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const p2 = (v: number) => String(v).padStart(2, '0');
  return `${days}j ${p2(hours)}:${p2(minutes)}:${p2(seconds)}`;
}

/** Horodatage relatif court : `il y a 2 h`, `hier`, `il y a 5 j`. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}${NBSP}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  return `il y a ${days}${NBSP}j`;
}

/**
 * Chiffres romains — les rangs du Hall of Fame et les numéros de saison.
 *
 * Écrits en toutes lettres jusqu'où le club ira : un « 11 » au milieu de I à X
 * se verrait, et le repli numérique de l'ancienne table de dix le produisait
 * fatalement.
 */
const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(value: number): string {
  let rest = Math.max(1, Math.floor(value));
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  }
  return out;
}
