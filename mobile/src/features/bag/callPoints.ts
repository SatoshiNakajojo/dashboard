/**
 * Les points des calls.
 *
 * Une seule règle, lisible par tous : **celui qui fait le call prend 100 % des
 * points, ceux qui se positionnent dessus en prennent 50 %.**
 *
 * L'auteur est noté sur la perf de son call, palier par palier, à la hausse
 * comme à la baisse (`GAIN_TIERS`, `LOSS_TIERS`). Un votant prend la moitié de
 * ces points, arrondie vers zéro pour éviter les demi-points (12,5 → 12) : un
 * bull gagne quand le call monte et perd quand il baisse ; un bear, l'inverse.
 *
 * La perf retenue est celle des classements du fil (`fameScore`) : en dollars
 * aujourd'hui, selon `LEADERBOARD.reference`. Un call en cours est noté sur son
 * cours du moment — ses points sont **en jeu** et bougent avec le marché ; un
 * call clôturé l'est sur sa sortie, et ses points sont **acquis**. Sans cela,
 * il suffirait de ne jamais clôturer un call perdant pour ne jamais perdre.
 *
 * Module pur.
 */

import { CLUB_OFFSET_MINUTES } from '@/lib/clubTime';
import { fameScore } from '@/lib/performance';
import type { CallView, Vote } from '@/types/domain';

/** Paliers de hausse, du plus haut au plus bas : le premier atteint l'emporte. */
export const GAIN_TIERS = [
  { from: 100, to: null, points: 500 },
  { from: 50, to: 100, points: 300 },
  { from: 30, to: 50, points: 200 },
  { from: 20, to: 30, points: 100 },
  { from: 10, to: 20, points: 50 },
  { from: 5, to: 10, points: 25 },
  { from: 0, to: 5, points: 10 },
] as const;

/** Paliers de baisse, sur la perte (en valeur absolue), du plus lourd au plus léger. */
export const LOSS_TIERS = [
  { from: 50, to: 100, points: -300 },
  { from: 30, to: 50, points: -200 },
  { from: 20, to: 30, points: -100 },
  { from: 10, to: 20, points: -50 },
  { from: 5, to: 10, points: -25 },
  { from: 0, to: 5, points: -10 },
] as const;

/** Ce que prend un votant, rapporté aux points de l'auteur. */
export const VOTER_SHARE = 0.5;

/**
 * Les points de l'auteur pour une perf donnée.
 *
 * Une perf nulle — un call qui vient de paraître, à son prix d'entrée — ou
 * inconnue ne rapporte rien : il ne s'est encore rien passé.
 */
export function authorPoints(perf: number | null): number {
  if (perf === null || !Number.isFinite(perf) || perf === 0) return 0;
  if (perf > 0) return GAIN_TIERS.find((tier) => perf >= tier.from)!.points;
  const loss = -perf;
  return LOSS_TIERS.find((tier) => loss >= tier.from)!.points;
}

/** La part d'un votant : la moitié, arrondie vers zéro (12,5 → 12, −12,5 → −12). */
export function voterShare(author: number): number {
  return Math.trunc(author * VOTER_SHARE) + 0;
}

/** Les points d'un votant : la moitié de ceux de l'auteur, dans le sens de son vote. */
export function voterPoints(side: Vote, perf: number | null): number {
  const share = voterShare(authorPoints(perf));
  // `+ 0` : un bear sur un call neutre vaut 0, pas « −0 ».
  return (side === 'bull' ? share : -share) + 0;
}

/** Une ligne du barème, telle qu'on l'affiche. */
export interface ScoreRow {
  /** `+50 à +100 %`, `0 à −5 %`… */
  label: string;
  author: number;
  bull: number;
  bear: number;
}

const pct = (value: number, sign: '+' | '−') => (value === 0 ? '0' : `${sign}${value}`);

/** Le barème complet, de la plus belle hausse à la pire baisse — pour l'écran. */
export const SCORE_TABLE: readonly ScoreRow[] = [
  ...GAIN_TIERS.map((tier) => ({
    label:
      tier.to === null
        ? `${pct(tier.from, '+')} % et plus`
        : `${pct(tier.from, '+')} à ${pct(tier.to, '+')} %`,
    author: tier.points,
    bull: voterShare(tier.points),
    bear: -voterShare(tier.points),
  })),
  ...[...LOSS_TIERS].reverse().map((tier) => ({
    label: `${pct(tier.from, '−')} à ${pct(tier.to, '−')} %`,
    author: tier.points,
    bull: voterShare(tier.points),
    bear: -voterShare(tier.points),
  })),
];

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
