/**
 * Les points des calls.
 *
 * Un call qui s'avère très rentable rapporte à son auteur ; un call qui
 * s'effondre lui coûte. Entre les deux, rien : un +12 % n'est pas un exploit,
 * un −8 % pas une faute.
 *
 * Les votants sont notés sur le même call, à moitié : un bull gagne quand
 * l'auteur gagne et perd quand il perd ; un bear, l'inverse. Sans cette perte,
 * voter bull sur tout serait un billet de loterie gratuit — le classement
 * mesurerait la participation, pas le jugement.
 *
 * La perf retenue est celle des classements du fil (`fameScore`) : en dollars
 * aujourd'hui, selon `LEADERBOARD.reference`. Un call en cours est noté sur son
 * cours du moment — ses points sont **latents** et bougent avec le marché ; un
 * call clôturé l'est sur sa sortie, et ses points sont **acquis**. Sans la note
 * latente, il suffirait de ne jamais clôturer un call perdant pour ne jamais
 * perdre de points.
 *
 * Module pur.
 */

import { CLUB_OFFSET_MINUTES } from '@/lib/clubTime';
import { fameScore } from '@/lib/performance';
import type { CallView, Vote } from '@/types/domain';

/**
 * Le barème de l'auteur, du palier le plus haut au plus bas. Le premier palier
 * atteint l'emporte.
 */
export const CALL_TIERS = [
  { atLeast: 100, points: 300 },
  { atLeast: 50, points: 200 },
  { atLeast: 30, points: 100 },
  { atMost: -50, points: -200 },
  { atMost: -20, points: -100 },
] as const;

/** Ce que pèse un vote, rapporté aux points de l'auteur. */
export const VOTER_SHARE = 0.5;

/** Les points de l'auteur pour une perf donnée. 0 si elle est inconnue. */
export function authorPoints(perf: number | null): number {
  if (perf === null || !Number.isFinite(perf)) return 0;
  for (const tier of CALL_TIERS) {
    if ('atLeast' in tier && perf >= tier.atLeast) return tier.points;
    if ('atMost' in tier && perf <= tier.atMost) return tier.points;
  }
  return 0;
}

/** Les points d'un votant : la moitié de ceux de l'auteur, dans le sens de son vote. */
export function voterPoints(side: Vote, perf: number | null): number {
  const author = authorPoints(perf) * VOTER_SHARE;
  // `+ 0` : un bear sur un call neutre vaut 0, pas « −0 ».
  return (side === 'bull' ? author : -author) + 0;
}

export type PointRole = 'author' | 'bull' | 'bear';

export interface PointLine {
  memberId: string;
  callId: string;
  symbol: string;
  role: PointRole;
  points: number;
  /** Acquis (call clôturé) ou latent (call en cours, noté au cours du moment). */
  settled: boolean;
  /** L'année où ces points comptent : celle de la sortie, ou l'année en cours. */
  year: number;
}

function clubYear(ms: number): number {
  return new Date(ms + CLUB_OFFSET_MINUTES * 60_000).getUTCFullYear();
}

/**
 * Toutes les lignes de points des calls : une pour l'auteur, une par votant.
 *
 * Le vote d'un auteur sur son propre call — possible avant la règle — ne
 * compte pas : il est déjà noté comme auteur.
 */
export function pointLines(calls: readonly CallView[], now: number): PointLine[] {
  const lines: PointLine[] = [];
  for (const call of calls) {
    const perf = fameScore(call);
    const settled = call.closed;
    const year =
      settled && call.closedOn
        ? clubYear(Date.parse(`${call.closedOn}T12:00:00+11:00`))
        : clubYear(now);
    const base = { callId: call.id, symbol: call.symbol, settled, year };

    lines.push({ ...base, memberId: call.userId, role: 'author', points: authorPoints(perf) });
    for (const voter of call.voters) {
      if (voter.userId === call.userId) continue;
      lines.push({
        ...base,
        memberId: voter.userId,
        role: voter.side,
        points: voterPoints(voter.side, perf),
      });
    }
  }
  return lines;
}

export interface MemberCallPoints {
  total: number;
  /** Dont acquis (calls clôturés). */
  settled: number;
  /** Dont latents (calls en cours). */
  latent: number;
  asAuthor: number;
  asVoter: number;
}

/** Le total d'un membre, sur une année ou depuis toujours (`year` nul). */
export function memberCallPoints(
  lines: readonly PointLine[],
  memberId: string,
  year: number | null,
): MemberCallPoints {
  const out: MemberCallPoints = { total: 0, settled: 0, latent: 0, asAuthor: 0, asVoter: 0 };
  for (const line of lines) {
    if (line.memberId !== memberId) continue;
    if (year !== null && line.year !== year) continue;
    out.total += line.points;
    if (line.settled) out.settled += line.points;
    else out.latent += line.points;
    if (line.role === 'author') out.asAuthor += line.points;
    else out.asVoter += line.points;
  }
  return out;
}

/** Ce que rapporte un call, rôle par rôle — pour l'afficher sur sa carte. */
export function callStakes(
  call: Pick<CallView, 'performancePercent' | 'vsBtcPercent' | 'assetClass'>,
): {
  author: number;
  bull: number;
  bear: number;
} {
  const perf = fameScore(call as CallView);
  return {
    author: authorPoints(perf),
    bull: voterPoints('bull', perf),
    bear: voterPoints('bear', perf),
  };
}
