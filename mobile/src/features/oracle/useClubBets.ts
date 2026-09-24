import { useEffect, useMemo, useState } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import { MOCK_BETS } from '@/mocks/oracle';
import type { Member } from '@/types/domain';
import { BET_COLUMNS, betFromRow, resolvedBets, type Bet, type BetRow } from './betting';
import { useJudgedHistory } from './useJudgedHistory';
import type { BetView } from './useOracle';

export interface ClubBets {
  /** Tous les paris du club, en cours et clos. */
  bets: Bet[];
  /** Les paris résolus, jugés comme dans l'onglet Oracle. */
  history: BetView[];
  /** L'instant de référence du chargement. */
  now: number;
  loading: boolean;
  error: string | null;
}

/**
 * Les paris du club, lus une fois — pour la page d'un membre.
 *
 * Pas de temps réel ici : l'onglet Oracle a déjà son canal `predictions`, et
 * `supabase.channel()` rend le **même** canal à un second abonné — l'y
 * rebrancher casserait celui de l'onglet. Une page de profil n'a pas besoin de
 * voir un pari arriver à la seconde.
 */
export function useClubBets(membersById: Map<string, Member>): ClubBets {
  const [bets, setBets] = useState<Bet[]>(() => (supabase ? [] : MOCK_BETS));
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const controller = new AbortController();

    (async () => {
      const { data, error: cause } = await client
        .from('predictions')
        .select(BET_COLUMNS)
        .order('opened_at')
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (cause) setError(describeError(cause));
      else {
        setBets(
          (data ?? [])
            .map((row) => betFromRow(row as BetRow))
            .filter((bet): bet is Bet => bet !== null),
        );
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, []);

  const resolved = useMemo(() => resolvedBets(bets, now), [bets, now]);
  const history = useJudgedHistory(resolved, membersById, now);

  return { bets, history, now, loading, error };
}
