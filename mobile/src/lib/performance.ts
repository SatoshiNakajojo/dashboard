/**
 * Règles métier de performance — README §7.3.
 *
 * Deux référentiels, toujours affichés côte à côte :
 *   • la perf en dollars, `(current - entry) / entry` ;
 *   • la perf **vs ₿**, seule retenue pour le Hall of Fame.
 *
 * Seuils du design validé : Hall of Fame ≥ +50 % vs ₿, Rekt Board ≤ −20 % en
 * dollars. Ils sont exportés — le libellé à l'écran les lit ici, de sorte que
 * texte et logique ne puissent pas diverger.
 */

import type { CallView } from '@/types/domain';

export const HALL_OF_FAME_THRESHOLD_VS_BTC = 50;
export const REKT_THRESHOLD_USD = -20;

/** Perf en %, ou `null` si le prix courant est indisponible (mode HORS LIGNE). */
export function performancePercent(
  entryPrice: number,
  currentPrice: number | null | undefined,
): number | null {
  if (currentPrice == null || !Number.isFinite(currentPrice)) return null;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

/**
 * Perf relative à Bitcoin, en %.
 *
 * Un actif qui prend 12 % pendant que BTC en prend 15 % a **perdu** vs ₿ :
 * `(1 + perf) / (1 + perfBtc) - 1`. Renvoie `null` si l'une des deux jambes
 * manque — jamais 0, qui se lirait comme « à égalité ».
 */
export function vsBitcoinPercent(
  entryPrice: number,
  currentPrice: number | null | undefined,
  entryBtcPrice: number | null | undefined,
  currentBtcPrice: number | null | undefined,
): number | null {
  const asset = performancePercent(entryPrice, currentPrice);
  const btc = performancePercent(entryBtcPrice ?? 0, currentBtcPrice);
  if (asset === null || btc === null) return null;
  const ratio = (1 + asset / 100) / (1 + btc / 100);
  if (!Number.isFinite(ratio)) return null;
  return (ratio - 1) * 100;
}

/**
 * Sépare les calls en Hall of Fame et Rekt Board.
 *
 * Le classement se juge contre Bitcoin ; un call BTC n'a pas de perf vs ₿ (il
 * *est* le référentiel) et entre au Hall of Fame sur sa perf en dollars.
 * Un call peut n'appartenir à aucun des deux : c'est le cas ordinaire.
 */
export function splitLeaderboards(calls: readonly CallView[]): {
  fame: CallView[];
  rekt: CallView[];
} {
  const fame: CallView[] = [];
  const rekt: CallView[] = [];

  for (const call of calls) {
    const score = call.vsBtcPercent ?? call.performancePercent;
    if (score !== null && score >= HALL_OF_FAME_THRESHOLD_VS_BTC) {
      fame.push(call);
    } else if (
      call.performancePercent !== null &&
      call.performancePercent <= REKT_THRESHOLD_USD
    ) {
      rekt.push(call);
    }
  }

  const score = (call: CallView) => call.vsBtcPercent ?? call.performancePercent ?? 0;
  fame.sort((a, b) => score(b) - score(a));
  rekt.sort((a, b) => (a.performancePercent ?? 0) - (b.performancePercent ?? 0));

  return { fame, rekt };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Rangs du Hall of Fame en chiffres romains — jamais `01 / 02 / 03`. */
export function romanRank(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

/** Frimousses du Rekt Board, en monospace — l'humour du club, en sourdine. */
const FACES = ['x_x', 'T_T', '>_<', ';_;', 'o_O'];

export function rektFace(index: number): string {
  return FACES[index % FACES.length]!;
}

/**
 * Désature une couleur de membre à 70 % — les avatars du Rekt Board.
 * RN n'a pas de `filter: grayscale()`, le calcul se fait donc en amont (README §8.5).
 */
export function desaturate(hex: string, amount = 0.7): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const int = parseInt(match[1]!, 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;

  // Luminance perçue (Rec. 601), la même que celle d'un filtre grayscale CSS.
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (channel: number) => Math.round(channel + (grey - channel) * amount);

  return `#${[mix(r), mix(g), mix(b)]
    .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'))
    .join('')}`;
}
