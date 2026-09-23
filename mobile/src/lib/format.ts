/**
 * Formatage français — l'espace insécable avant `%`, `$` et dans les milliers
 * fait partie du design (SPEC §7). `Intl` en RN produit déjà des U+202F pour
 * `fr-FR` ; on normalise pour ne jamais laisser passer une espace ordinaire.
 */

import { CLUB_OFFSET_MINUTES } from './clubTime';

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

/**
 * Le prix visé par un pari : `164 k$`, et `1,2 M$` au-delà du million.
 *
 * Sur dix ans, « 1 200 k$ » se lit mal et déborde de sa colonne.
 */
export function formatTarget(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const body = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 1_000_000);
    return `${normalizeSpaces(body)}${NBSP}M$`;
  }
  return formatThousands(value);
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

/**
 * Le même instant, lu à l'heure de Nouméa.
 *
 * Une Crypto Night a lieu au club, et l'heure saisie est de l'heure
 * calédonienne (`clubTime.ts`). L'afficher dans le fuseau de l'appareil ferait
 * lire « 17:30 » à un membre en déplacement qui vient de taper « 19:30 » — la
 * saisie et la carte se contrediraient à une minute d'intervalle.
 *
 * On lit donc les composantes en UTC après décalage : `getUTCHours()` ne
 * consulte pas l'horloge du téléphone, contrairement à `getHours()`.
 */
function atClub(iso: string): Date | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return new Date(instant.getTime() + CLUB_OFFSET_MINUTES * 60_000);
}

/** Bloc date d'une carte d'événement : `{ day: '18', month: 'SEPT' }`. */
export function splitEventDate(iso: string): { day: string; month: string } {
  const d = atClub(iso);
  if (!d) return { day: '--', month: '' };
  return {
    day: String(d.getUTCDate()).padStart(2, '0'),
    month: MONTHS_SHORT[d.getUTCMonth()] ?? '',
  };
}

/** `20:00` — heure du club, sans secondes. */
export function formatTime(iso: string): string {
  const d = atClub(iso);
  if (!d) return '--:--';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
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

/** `03 DÉC 2026` — une date de pari, à l'heure du club. */
export function formatClubDate(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const d = atClub(new Date(ms).toISOString());
  if (!d) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS_SHORT[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`;
}

/**
 * Le temps qui reste, à la grosse maille : `9 ans`, `4 mois`, `71 j`, `5 h`.
 *
 * Un compte à rebours à la seconde sur dix ans n'aide personne ; c'est
 * l'ordre de grandeur qui compte. On arrondit **vers le bas** : annoncer
 * « 1 an » à 360 jours ferait croire le pari plus loin qu'il ne l'est.
 */
export function formatLeft(ms: number): string {
  const safe = Math.max(0, ms);
  const days = safe / 86_400_000;
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years}${NBSP}an${years > 1 ? 's' : ''}`;
  }
  if (days >= 60) return `${Math.floor(days / 30)}${NBSP}mois`;
  if (days >= 2) return `${Math.floor(days)}${NBSP}j`;
  const hours = Math.floor(safe / 3_600_000);
  if (hours >= 1) return `${hours}${NBSP}h`;
  return `${Math.floor(safe / 60_000)}${NBSP}min`;
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
