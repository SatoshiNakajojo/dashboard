/**
 * Le classement du club : qui détient la vérité, qui finance les autres.
 *
 * Il additionne les deux jeux du club :
 *
 *   • les **points des calls** (`features/bag/callPoints.ts`) — comme auteur et
 *     comme votant, acquis sur les calls clôturés, latents sur les autres ;
 *   • les **points de l'Oracle** (`features/oracle/standings.ts`) — la justesse
 *     des paris résolus, pondérée par l'horizon.
 *
 * Tous les membres y figurent, même sans point : celui qui ne joue pas encore
 * doit voir où il en est.
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

/** Les affiches des titres : `assets/titles/<key>.jpg` (voir `titleArt.ts`). */
export type ClubTitleKey = 'oracle' | 'loup' | 'chercheur' | 'analyste' | 'fournisseur';

export interface ClubTitle {
  rank: number;
  key: ClubTitleKey;
  title: string;
  motto: string;
}

/**
 * Les titres du club, du premier au cinquième — tels qu'écrits sur leurs
 * affiches : le nom et la devise de l'écran ne doivent pas contredire l'image.
 */
export const CLUB_TITLES: readonly ClubTitle[] = [
  {
    rank: 1,
    key: 'oracle',
    title: 'L’Oracle de Wall Street',
    motto: 'Les marchés parlent. L’Oracle écoute.',
  },
  {
    rank: 2,
    key: 'loup',
    title: 'Le Loup de Wall Street',
    motto: 'Il ne suit pas la tendance. La tendance le suit.',
  },
  {
    rank: 3,
    key: 'chercheur',
    title: 'Le Chercheur en Pumpologie',
    motto: 'Chaque perte est une nouvelle donnée scientifique.',
  },
  {
    rank: 4,
    key: 'analyste',
    title: 'L’Analyste de Boursorama',
    motto: 'Il peut aussi vous proposer une assurance vie.',
  },
  {
    rank: 5,
    key: 'fournisseur',
    title: 'Fournisseur de Liquidité',
    motto: 'Il ne trade plus, il finance les autres.',
  },
];

/**
 * Le titre d'une ligne du classement : celui de son rang.
 *
 * Deux ex æquo partagent rang et titre. Tant que tout le monde est à égalité —
 * au premier jour, sept membres à zéro — personne n'est titré : le podium ne
 * se gagne pas à l'ordre alphabétique.
 */
export function titleOf(
  row: Pick<ClubStanding, 'rank'>,
  rows: readonly Pick<ClubStanding, 'total'>[],
): ClubTitle | null {
  const first = rows[0];
  if (!first || rows.every((other) => other.total === first.total)) return null;
  return CLUB_TITLES.find((title) => title.rank === row.rank) ?? null;
}

/** Qui porte ce titre : personne, un membre, ou plusieurs ex æquo. */
export function titleHolders(title: ClubTitle, rows: readonly ClubStanding[]): ClubStanding[] {
  return rows.filter((row) => titleOf(row, rows)?.rank === title.rank);
}
