import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { performancePercent, vsBitcoinPercent } from '@/lib/performance';
import { describeError, supabase } from '@/lib/supabase';
import { MOCK_MY_VOTES, MOCK_TICKERS, MOCK_VOTES } from '@/mocks/calls';
import type { CallView, Member, Ticker, Vote } from '@/types/domain';

export interface CallsState {
  calls: CallView[];
  loading: boolean;
  error: string | null;
  /** Un seul vote par membre et par call ; re-tap = annulation. */
  vote: (tickerId: string, side: Vote) => void;
}

interface VoteTally {
  bull: number;
  bear: number;
}

/**
 * Fil des calls, avec les perfs recalculées à chaque rafraîchissement du spot.
 *
 * La perf en dollars est aussi une colonne générée côté base ; on la recalcule
 * ici parce que la perf **vs ₿** dépend du cours BTC courant, qui n'est pas en
 * base. Les deux chemins utilisent la même fonction, `performancePercent`.
 */
export function useCalls(currentUserId: string | null, membersById: Map<string, Member>): CallsState {
  const { spot } = useBtcSpot();

  const [tickers, setTickers] = useState<Ticker[]>(supabase ? [] : MOCK_TICKERS);
  const [tallies, setTallies] = useState<Record<string, VoteTally>>(supabase ? {} : MOCK_VOTES);
  /** Ce que le serveur sait de mon vote — sert à corriger le total affiché. */
  const [serverVotes, setServerVotes] = useState<Record<string, Vote>>(
    supabase ? {} : MOCK_MY_VOTES,
  );
  /** Mon vote à l'écran, éventuellement en avance sur le serveur. */
  const [myVotes, setMyVotes] = useState<Record<string, Vote>>(supabase ? {} : MOCK_MY_VOTES);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const [callsResult, votesResult] = await Promise.all([
        client
          .from('tickers')
          .select(
            'id, user_id, symbol, asset_class, entry_price, current_price, entry_btc_price, size_usd, thesis, created_at',
          )
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal),
        client.from('ticker_votes').select('ticker_id, user_id, side').abortSignal(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      if (callsResult.error) {
        setError(describeError(callsResult.error));
        setLoading(false);
        return;
      }

      setTickers(
        (callsResult.data ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          symbol: row.symbol,
          assetClass: row.asset_class,
          entryPrice: Number(row.entry_price),
          currentPrice: row.current_price === null ? null : Number(row.current_price),
          entryBtcPrice: row.entry_btc_price === null ? null : Number(row.entry_btc_price),
          sizeUsd: row.size_usd === null ? null : Number(row.size_usd),
          thesis: row.thesis,
          createdAt: row.created_at,
        })),
      );

      const nextTallies: Record<string, VoteTally> = {};
      const nextMine: Record<string, Vote> = {};
      for (const row of votesResult.data ?? []) {
        const tally = nextTallies[row.ticker_id] ?? { bull: 0, bear: 0 };
        tally[row.side] += 1;
        nextTallies[row.ticker_id] = tally;
        if (row.user_id === currentUserId) nextMine[row.ticker_id] = row.side;
      }
      setTallies(nextTallies);
      setServerVotes(nextMine);
      setMyVotes(nextMine);
      setLoading(false);
    })();

    return () => controller.abort();
  }, [currentUserId]);

  const vote = useCallback(
    (tickerId: string, side: Vote) => {
      if (!currentUserId) return;

      const previous = myVotes[tickerId];
      const next = previous === side ? undefined : side;

      setMyVotes((current) => {
        const copy = { ...current };
        if (next) copy[tickerId] = next;
        else delete copy[tickerId];
        return copy;
      });

      const client = supabase;
      if (!client) return;

      const revert = () => {
        setMyVotes((current) => {
          const copy = { ...current };
          if (previous) copy[tickerId] = previous;
          else delete copy[tickerId];
          return copy;
        });
      };

      const write = next
        ? client
            .from('ticker_votes')
            .upsert(
              { ticker_id: tickerId, user_id: currentUserId, side: next },
              { onConflict: 'ticker_id,user_id' },
            )
        : client
            .from('ticker_votes')
            .delete()
            .eq('ticker_id', tickerId)
            .eq('user_id', currentUserId);

      void write.then(({ error: cause }) => {
        if (cause) {
          revert();
          setError(describeError(cause));
          return;
        }
        // Le serveur a pris le vote : on aligne le total de référence, sinon
        // le prochain rendu compterait ma voix deux fois.
        setTallies((current) => {
          const tally = current[tickerId] ?? { bull: 0, bear: 0 };
          const updated = { ...tally };
          if (previous) updated[previous] = Math.max(0, updated[previous] - 1);
          if (next) updated[next] += 1;
          return { ...current, [tickerId]: updated };
        });
        setServerVotes((current) => {
          const copy = { ...current };
          if (next) copy[tickerId] = next;
          else delete copy[tickerId];
          return copy;
        });
      });
    },
    [currentUserId, myVotes],
  );

  const calls = useMemo<CallView[]>(
    () =>
      tickers.map((ticker) => {
        const tally = tallies[ticker.id] ?? { bull: 0, bear: 0 };
        const mine = myVotes[ticker.id] ?? null;
        const author = membersById.get(ticker.userId);

        // Le total serveur inclut déjà ma voix. Tant que l'écriture est en
        // vol, on corrige l'écart entre ce que le serveur sait et ce que je
        // viens de taper — sans jamais compter ma voix deux fois.
        const confirmed = serverVotes[ticker.id] ?? null;
        const displayed = { bull: tally.bull, bear: tally.bear };
        if (confirmed !== mine) {
          if (confirmed) displayed[confirmed] = Math.max(0, displayed[confirmed] - 1);
          if (mine) displayed[mine] += 1;
        }

        return {
          ...ticker,
          author: author ?? {
            id: ticker.userId,
            displayName: 'Membre',
            initials: '··',
            color: '#8C7F68',
          },
          performancePercent: performancePercent(ticker.entryPrice, ticker.currentPrice),
          vsBtcPercent:
            ticker.assetClass === 'BTC'
              ? null
              : vsBitcoinPercent(
                  ticker.entryPrice,
                  ticker.currentPrice,
                  ticker.entryBtcPrice,
                  spot.usd,
                ),
          bull: displayed.bull,
          bear: displayed.bear,
          myVote: mine,
        };
      }),
    [tickers, tallies, myVotes, serverVotes, membersById, spot.usd],
  );

  return { calls, loading, error, vote };
}
