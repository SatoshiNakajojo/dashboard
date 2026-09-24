/**
 * Le classement du club : qui détient la vérité, qui est à côté de la plaque.
 *
 * Il additionne les deux jeux du club :
 *
 *   • les **points des calls** (`features/bag/callPoints.ts`) — comme auteur et
 *     comme votant, acquis sur les calls clôturés, latents sur les autres ;
 *   • les **points de l'Oracle** (`features/oracle/standings.ts`) — la justesse
 *     des paris résolus, pondérée par l'horizon.
 *
 * Tous les membres y figurent, même sans point : un membre qui ne joue pas
 * n'est pas plus « à côté de la plaque » qu'un autre, mais il doit voir où il
 * en est.
 *
 * Module pur.
 */

import { memberCallPoints, type PointLine } from '@/features/bag/callPoints';
import { standings } from '@/features/oracle/standings';
import type { BetView } from '@/features/oracle/useOracle';
import type { Member } from '@/types/domain';

export interface ClubStanding {
  member: Member;
  /** Rang, à partir de 1 ; deux totaux égaux partagent le rang. */
  rank: number;
  total: number;
  /** Points des calls (auteur et votant). */
  calls: number;
  /** Dont latents : ils bougent avec le cours des calls en cours. */
  callsLatent: number;
  /** Points de l'Oracle. */
  oracle: number;
}

export function clubStandings(
  members: readonly Member[],
  lines: readonly PointLine[],
  oracleHistory: readonly BetView[],
  year: number | null,
): ClubStanding[] {
  const oracle = new Map(
    standings(oracleHistory, year).map((row) => [row.member.id, row.points]),
  );

  const rows = members.map((member) => {
    const calls = memberCallPoints(lines, member.id, year);
    const oraclePoints = oracle.get(member.id) ?? 0;
    return {
      member,
      rank: 0,
      total: calls.total + oraclePoints,
      calls: calls.total,
      callsLatent: calls.latent,
      oracle: oraclePoints,
    };
  });

  rows.sort(
    (a, b) =>
      b.total - a.total || a.member.displayName.localeCompare(b.member.displayName, 'fr'),
  );
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.rank = previous && previous.total === row.total ? previous.rank : index + 1;
  });
  return rows;
}

/**
 * Les deux titres du classement, s'ils sont mérités : un seul premier, un seul
 * dernier, et un écart entre eux. Sept membres à zéro ne désignent personne.
 */
export function titlesOf(rows: readonly ClubStanding[]): {
  truth: string | null;
  offMark: string | null;
} {
  if (rows.length < 2) return { truth: null, offMark: null };
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (first.total === last.total) return { truth: null, offMark: null };
  const soleFirst = rows.filter((row) => row.rank === first.rank).length === 1;
  const soleLast = rows.filter((row) => row.rank === last.rank).length === 1;
  return {
    truth: soleFirst ? first.member.id : null,
    offMark: soleLast ? last.member.id : null,
  };
}
