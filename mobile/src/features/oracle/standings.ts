/**
 * Le classement des oracles.
 *
 * Chaque pari résolu rapporte des points : sa justesse (0 à 100), multipliée
 * par le poids de son horizon (`HORIZONS[].weight`, de 1 pour une semaine à 8
 * pour dix ans). Les points se **cumulent** : parier souvent paie, parier loin
 * aussi, et se tromper ne coûte rien de plus que de ne pas avoir parié.
 *
 * Pourquoi pas une simple moyenne : un seul pari chanceux à 97 % battrait dix
 * paris à 90 %, et le classement irait à qui parie le moins. La moyenne reste
 * affichée, à côté — c'est elle qui dit qui vise juste.
 *
 * Un pari sans justesse (cours indisponible) ne compte pas : le noter zéro se
 * lirait comme « complètement faux ».
 *
 * Module pur : la vue fournit les paris résolus, déjà jugés.
 */

import { CLUB_OFFSET_MINUTES } from '@/lib/clubTime';
import { horizonOf } from '@/lib/horizons';
import type { Member } from '@/types/domain';
import type { BetView } from './useOracle';

export interface Standing {
  member: Member;
  /** Rang, à partir de 1. Deux membres à égalité de points partagent le rang. */
  rank: number;
  points: number;
  /** Paris résolus et jugés. */
  bets: number;
  /** Justesse moyenne, en %. */
  average: number;
  /** Meilleure justesse, en %. */
  best: number;
}

/** Ce qu'un pari résolu rapporte. `null` s'il n'a pas pu être jugé. */
export function betPoints(view: Pick<BetView, 'bet' | 'accuracy'>): number | null {
  if (view.accuracy === null) return null;
  return Math.round(view.accuracy * horizonOf(view.bet.horizon).weight);
}

/** L'année, à Nouméa, où un instant tombe. */
export function clubYear(ms: number): number {
  return new Date(ms + CLUB_OFFSET_MINUTES * 60_000).getUTCFullYear();
}

/**
 * Le classement, sur une année de résolution ou depuis toujours (`year` nul).
 *
 * Trié par points ; à égalité, par justesse moyenne, puis par nom — un ordre
 * stable, qui ne change pas d'un rendu à l'autre.
 */
export function standings(history: readonly BetView[], year: number | null): Standing[] {
  const byMember = new Map<string, { member: Member; scores: number[]; points: number }>();

  for (const view of history) {
    const points = betPoints(view);
    if (points === null || view.accuracy === null) continue;
    if (year !== null && clubYear(view.bet.resolvesAt) !== year) continue;

    const entry = byMember.get(view.author.id) ?? {
      member: view.author,
      scores: [],
      points: 0,
    };
    entry.scores.push(view.accuracy);
    entry.points += points;
    byMember.set(view.author.id, entry);
  }

  const rows = [...byMember.values()].map(({ member, scores, points }) => ({
    member,
    rank: 0,
    points,
    bets: scores.length,
    average: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    best: Math.max(...scores),
  }));

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.average - a.average ||
      a.member.displayName.localeCompare(b.member.displayName, 'fr'),
  );

  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.rank = previous && previous.points === row.points ? previous.rank : index + 1;
  });

  return rows;
}
