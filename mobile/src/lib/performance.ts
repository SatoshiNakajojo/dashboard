/**
 * Règles métier de performance — README §7.3.
 *
 * Deux référentiels, toujours affichés côte à côte sur une carte de call :
 *   • la perf en dollars, `(current - entry) / entry` ;
 *   • la perf **vs ₿**, qui est celle qui compte au club.
 *
 * ## Le référentiel du classement : un conflit du dossier de design
 *
 * Les trois sources ne disent pas la même chose :
 *
 * | Source | Ce qu'elle dit |
 * |---|---|
 * | Prototype v1 | `CALLS ≥ +50 %` — le dollar |
 * | Prototype v2 | `≥ +50 % VS ₿` |
 * | Fixtures des deux | `$NVDA +74 %` avec `+31 % vs ₿`, `$MSTR +63 %` avec `+19 % vs ₿` |
 *
 * Les **données tranchent** : à +31 % et +19 % vs ₿, ces deux lignes n'auraient
 * rien à faire dans un Hall of Fame mesuré vs ₿. Elles passent le seuil en
 * dollars. C'est donc le dollar qui est implémenté, comme dans la v1.
 *
 * Basculer sur l'autre lecture est un mot à changer — `REFERENCE` ci-dessous —
 * et le libellé à l'écran suit, puisqu'il est dérivé d'ici. C'est exactement ce
 * qu'exige le README §7.3 : texte et logique ne peuvent pas diverger.
 */

import type { CallView } from '@/types/domain';

export type LeaderboardReference = 'usd' | 'vsBtc';

/**
 * **Le seul endroit à toucher pour changer la règle de classement.**
 * Le libellé à l'écran en est dérivé : il ne peut pas mentir sur le calcul.
 */
export const LEADERBOARD: {
  reference: LeaderboardReference;
  fameThreshold: number;
  rektThresholdUsd: number;
} = {
  reference: 'usd',
  fameThreshold: 50,
  rektThresholdUsd: -20,
};

/** Qualificatif affiché à droite du titre « HALL OF FAME ». */
export const HALL_OF_FAME_LABEL =
  LEADERBOARD.reference === 'vsBtc'
    ? `≥ +${LEADERBOARD.fameThreshold} % VS ₿`
    : `CALLS ≥ +${LEADERBOARD.fameThreshold} %`;

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
 * Score retenu pour le Hall of Fame.
 *
 * Un call BTC n'a jamais de perf vs ₿ — il *est* le référentiel — et retombe
 * donc toujours sur sa perf en dollars, quel que soit `REFERENCE`.
 */
export function fameScore(call: CallView): number | null {
  if (LEADERBOARD.reference === 'usd') return call.performancePercent;
  return call.vsBtcPercent ?? call.performancePercent;
}

/**
 * Sépare les calls en Hall of Fame et Rekt Board.
 *
 * Un call peut n'appartenir à aucun des deux : c'est le cas ordinaire, et
 * c'est pourquoi les deux tableaux ont un état vide qui n'est pas une erreur.
 * Un call sans prix courant n'est classé nulle part — on ne le compte pas à
 * zéro, ce qui le ferait passer pour une position neutre.
 */
export function splitLeaderboards(calls: readonly CallView[]): {
  fame: CallView[];
  rekt: CallView[];
} {
  const fame: CallView[] = [];
  const rekt: CallView[] = [];

  for (const call of calls) {
    const score = fameScore(call);
    if (score !== null && score >= LEADERBOARD.fameThreshold) {
      fame.push(call);
    } else if (
      call.performancePercent !== null &&
      call.performancePercent <= LEADERBOARD.rektThresholdUsd
    ) {
      rekt.push(call);
    }
  }

  fame.sort((a, b) => (fameScore(b) ?? 0) - (fameScore(a) ?? 0));
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
