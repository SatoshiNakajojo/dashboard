/**
 * Le parcours d'un membre : ses calls, ses paris, ses soirées.
 *
 * Module pur : la page de profil lui passe ce que les hooks ont chargé, et il
 * en tire les chiffres. Rien n'est recalculé autrement qu'ailleurs dans l'app —
 * les perfs sont celles des cartes, les points ceux du classement de l'Oracle.
 */

import { phaseOfBet, type Bet } from '@/features/oracle/betting';
import { clubYear, standings, type Standing } from '@/features/oracle/standings';
import type { BetView } from '@/features/oracle/useOracle';
import type { EventWithAttendance } from '@/features/nights/useEvents';
import { HORIZONS, type HorizonKey } from '@/lib/horizons';
import { fameScore } from '@/lib/performance';
import type { CallView } from '@/types/domain';

export interface CallsRecord {
  /** Ses calls : en cours d'abord, puis clos, chacun du plus récent au plus ancien. */
  calls: CallView[];
  open: number;
  closed: number;
  /** Perf moyenne en dollars, sur les calls qui ont un cours. */
  averagePerf: number | null;
  /** Perf moyenne vs ₿, sur les calls qui en ont une (pas les calls BTC). */
  averageVsBtc: number | null;
  /** Son meilleur call, au critère du Hall of Fame. */
  best: CallView | null;
}

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

export function callsRecord(all: readonly CallView[], memberId: string): CallsRecord {
  const mine = all
    .filter((call) => call.userId === memberId)
    .sort(
      (a, b) =>
        Number(a.closed) - Number(b.closed) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );

  let best: CallView | null = null;
  for (const call of mine) {
    const score = fameScore(call);
    if (score === null) continue;
    if (best === null || score > (fameScore(best) ?? -Infinity)) best = call;
  }

  return {
    calls: mine,
    open: mine.filter((call) => !call.closed).length,
    closed: mine.filter((call) => call.closed).length,
    averagePerf: average(
      mine.flatMap((call) =>
        call.performancePercent === null ? [] : [call.performancePercent],
      ),
    ),
    averageVsBtc: average(
      mine.flatMap((call) => (call.vsBtcPercent === null ? [] : [call.vsBtcPercent])),
    ),
    best,
  };
}

export interface OracleRecord {
  /** Sa ligne au classement de l'année en cours, rang compris. */
  year: Standing | null;
  /** Sa ligne au classement depuis toujours. */
  allTime: Standing | null;
  /** Nombre de membres classés cette année. */
  rankedThisYear: number;
  /** Les horizons où il a un pari en cours, du plus court au plus long. */
  running: HorizonKey[];
}

export function oracleRecord(
  history: readonly BetView[],
  bets: readonly Bet[],
  memberId: string,
  now: number,
): OracleRecord {
  const thisYear = standings(history, clubYear(now));
  const allTime = standings(history, null);
  const running = new Set(
    bets
      .filter((bet) => bet.userId === memberId && phaseOfBet(bet, now) !== 'resolved')
      .map((bet) => bet.horizon),
  );

  return {
    year: thisYear.find((row) => row.member.id === memberId) ?? null,
    allTime: allTime.find((row) => row.member.id === memberId) ?? null,
    rankedThisYear: thisYear.length,
    running: HORIZONS.map((h) => h.key).filter((key) => running.has(key)),
  };
}

export interface NightsRecord {
  /** Soirées passées où il était inscrit. */
  attended: number;
  /** Soirées passées, au total. */
  past: number;
  /** La prochaine soirée où il est inscrit. */
  next: EventWithAttendance | null;
}

export function nightsRecord(
  events: readonly EventWithAttendance[],
  memberId: string,
  now: number,
): NightsRecord {
  const past = events.filter((event) => Date.parse(event.startsAt) < now);
  const next =
    events
      .filter(
        (event) => Date.parse(event.startsAt) >= now && event.attendeeIds.includes(memberId),
      )
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;

  return {
    attended: past.filter((event) => event.attendeeIds.includes(memberId)).length,
    past: past.length,
    next,
  };
}
