import { useMemo } from 'react';

import { useBtcSince } from '@/hooks/useBtcMarket';
import { accuracyPercent } from '@/lib/accuracy';
import { supabase } from '@/lib/supabase';
import type { Member } from '@/types/domain';
import { seriesForBet, targetOf, type Bet } from './betting';
import { judgingOrigins, judgingSeries } from './judging';
import type { BetView } from './useOracle';

/** Un membre qu'on ne connaît pas (encore) : on affiche quand même son pari. */
function unknownMember(id: string): Member {
  return {
    id,
    displayName: 'Membre',
    initials: '··',
    color: '#8C7F68',
    avatarUrl: null,
    links: [],
  };
}

/**
 * Les paris résolus, jugés sur les séries canoniques (`judging.ts`).
 *
 * Partagé par l'onglet Oracle et la page d'un membre : c'est ce qui garantit
 * qu'un pari rapporte les mêmes points aux deux endroits.
 *
 * `resolved` doit être trié comme l'historique doit s'afficher.
 */
export function useJudgedHistory(
  resolved: readonly Bet[],
  membersById: Map<string, Member>,
  now: number,
): BetView[] {
  const origins = useMemo(() => judgingOrigins(resolved, now), [resolved, now]);
  const fine = useBtcSince(origins.fine);
  const coarse = useBtcSince(origins.coarse);

  return useMemo(() => {
    /**
     * Avec un backend, la série de démonstration n'est jamais le cours : juger
     * un pari dessus, ce serait inventer un gagnant. Sans backend, c'est le
     * mode démo, et elle est là pour ça.
     */
    const usable = (series: typeof fine) =>
      series.origin !== null && series.points.length > 0 && !(series.simulated && supabase)
        ? series
        : null;
    const sources = { fine: usable(fine), coarse: usable(coarse) };

    return resolved.map((bet) => {
      const source = sources[judgingSeries(bet, now)];
      return {
        bet,
        author: membersById.get(bet.userId) ?? unknownMember(bet.userId),
        phase: 'resolved' as const,
        target: targetOf(bet.path),
        accuracy: source
          ? accuracyPercent(bet.path, seriesForBet(source.points, source.origin!, bet.openedAt))
          : null,
        // L'historique ne se trace pas sur le repère : il n'a pas de position.
        onChart: [],
      };
    });
  }, [resolved, membersById, now, fine, coarse]);
}
