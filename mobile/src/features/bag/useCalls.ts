import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { resolveCoingeckoId } from '@/lib/coingecko';
import { providerFor, toYahooSymbol } from '@/lib/quotes';
import { performancePercent, vsBitcoinPercent } from '@/lib/performance';
import { entryBtcFor, mergeQuotes } from './quoteRefresh';
import { useLiveQuotes } from './useLiveQuotes';
import { describeError } from '@/lib/supabase';
import type { CallView, Member, Ticker, Vote } from '@/types/domain';
import { getCallsSource, type CallDraftInput, type VoteRow } from './source';

export interface PublishInput {
  assetClass: CallDraftInput['assetClass'];
  symbol: string;
  entryPrice: number;
  thesis: string;
  /** Place de cotation, pour suffixer le symbole Yahoo d'un titre non américain. */
  exchange?: string | null;
  /** Jeton choisi dans le composer ; à défaut, on résout le ticker nous-mêmes. */
  coingeckoId?: string | null;
}

export interface CallsState {
  calls: CallView[];
  loading: boolean;
  error: string | null;
  /** Un seul vote par membre et par call ; re-tap = annulation. */
  vote: (tickerId: string, side: Vote) => void;
  /** Publie un call. Résout l'erreur en `false` plutôt que de lever. */
  publish: (input: PublishInput) => Promise<boolean>;
  /** Publication en cours — le bouton du composer s'en sert. */
  publishing: boolean;
}

interface VoteTally {
  bull: number;
  bear: number;
}

const UNKNOWN_MEMBER: Omit<Member, 'id'> = {
  displayName: 'Membre',
  initials: '··',
  color: '#8C7F68',
};

/**
 * Fil des calls, avec les perfs recalculées à chaque rafraîchissement du spot.
 *
 * La perf en dollars est aussi une colonne générée côté base ; on la recalcule
 * ici parce que la perf **vs ₿** dépend du cours BTC courant, qui n'est pas en
 * base. Les deux chemins utilisent la même fonction, `performancePercent`.
 */
export function useCalls(
  currentUserId: string | null,
  membersById: Map<string, Member>,
): CallsState {
  const { spot } = useBtcSpot();
  const source = useMemo(() => getCallsSource(), []);

  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  /** Mon vote à l'écran, éventuellement en avance sur le serveur. */
  const [pendingVote, setPendingVote] = useState<Record<string, Vote | null>>({});

  // --- Chargement ----------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([source.list(controller.signal), source.listVotes(controller.signal)])
      .then(([rows, voteRows]) => {
        if (!active || controller.signal.aborted) return;
        setTickers(rows);
        setVotes(voteRows);
        setError(null);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(describeError(cause));
        setLoaded(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [source]);

  // --- Votes ---------------------------------------------------------------

  const serverVote = useCallback(
    (tickerId: string): Vote | null =>
      votes.find((v) => v.tickerId === tickerId && v.userId === currentUserId)?.side ?? null,
    [votes, currentUserId],
  );

  const vote = useCallback(
    (tickerId: string, side: Vote) => {
      if (!currentUserId) return;

      const current = tickerId in pendingVote ? pendingVote[tickerId]! : serverVote(tickerId);
      const next = current === side ? null : side;

      setPendingVote((state) => ({ ...state, [tickerId]: next }));

      source
        .setVote(tickerId, currentUserId, next)
        .then(() => {
          // On aligne la vérité serveur, puis on retire la surcouche : sans cet
          // ordre, le compteur clignote le temps d'un rendu.
          setVotes((rows) => {
            const without = rows.filter(
              (v) => !(v.tickerId === tickerId && v.userId === currentUserId),
            );
            return next
              ? [...without, { tickerId, userId: currentUserId, side: next }]
              : without;
          });
          setPendingVote((state) => {
            const copy = { ...state };
            delete copy[tickerId];
            return copy;
          });
        })
        .catch((cause: unknown) => {
          setPendingVote((state) => {
            const copy = { ...state };
            delete copy[tickerId];
            return copy;
          });
          setError(describeError(cause));
        });
    },
    [currentUserId, pendingVote, serverVote, source],
  );

  // --- Publication ---------------------------------------------------------

  const publish = useCallback(
    async (input: PublishInput): Promise<boolean> => {
      if (!currentUserId || publishing) return false;
      setPublishing(true);

      try {
        // Un actif a un fournisseur, pas deux (contrainte
        // `tickers_one_quote_source`) : la classe d'actif décide, et la
        // résolution du symbole suit.
        const yahoo = providerFor(input.assetClass) === 'yahoo';

        // Côté Yahoo le symbole se déduit ; côté CoinGecko il faut demander.
        // Les deux peuvent échouer sans empêcher la publication — le call
        // partira sans fournisseur, et son cours restera à saisir.
        const yahooSymbol = yahoo ? toYahooSymbol(input.symbol, input.exchange) : null;

        // Un jeton choisi dans la liste fait foi : le re-résoudre reviendrait à
        // remplacer la décision du membre par un classement de capitalisation,
        // ce qu'il venait précisément de contredire.
        const coingeckoId = yahoo
          ? null
          : (input.coingeckoId ?? (await resolveCoingeckoId(input.symbol)));

        const ticker = await source.publish(
          {
            ...input,
            // Un call BTC est son propre référentiel : lui demander le spot
            // serait un aller-retour pour redécouvrir son propre prix.
            btcSpot: entryBtcFor(input.assetClass, input.entryPrice, spot.usd),
            coingeckoId,
            yahooSymbol,
          },
          currentUserId,
        );

        setTickers((rows) => [ticker, ...rows]);
        setError(null);
        return true;
      } catch (cause) {
        setError(describeError(cause));
        return false;
      } finally {
        setPublishing(false);
      }
    },
    [currentUserId, publishing, source, spot.usd],
  );

  // --- Projection d'affichage ----------------------------------------------

  const tallies = useMemo(() => {
    const out: Record<string, VoteTally> = {};
    for (const row of votes) {
      const tally = out[row.tickerId] ?? { bull: 0, bear: 0 };
      tally[row.side] += 1;
      out[row.tickerId] = tally;
    }
    return out;
  }, [votes]);

  /**
   * Les cours frais, recollés avant tout calcul.
   *
   * Sans ça, `current_price` reste le prix d'entrée écrit à la publication —
   * et toutes les cartes affichent 0 %, ce qui est le défaut qu'on corrige ici.
   */
  const quotes = useLiveQuotes(tickers);
  const priced = useMemo(() => mergeQuotes(tickers, quotes), [tickers, quotes]);

  const calls = useMemo<CallView[]>(
    () =>
      priced.map((ticker) => {
        const tally = tallies[ticker.id] ?? { bull: 0, bear: 0 };
        const confirmed =
          votes.find((v) => v.tickerId === ticker.id && v.userId === currentUserId)?.side ??
          null;
        const mine = ticker.id in pendingVote ? pendingVote[ticker.id]! : confirmed;

        // Le total serveur inclut déjà ma voix. Tant que l'écriture est en vol,
        // on corrige l'écart entre ce que le serveur sait et ce que je viens de
        // taper — sans jamais compter ma voix deux fois.
        const displayed = { bull: tally.bull, bear: tally.bear };
        if (confirmed !== mine) {
          if (confirmed) displayed[confirmed] = Math.max(0, displayed[confirmed] - 1);
          if (mine) displayed[mine] += 1;
        }

        return {
          ...ticker,
          author: membersById.get(ticker.userId) ?? { id: ticker.userId, ...UNKNOWN_MEMBER },
          performancePercent: performancePercent(ticker.entryPrice, ticker.currentPrice),
          // Un call BTC est le référentiel : il n'a pas de perf vs ₿.
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
    [priced, tallies, votes, pendingVote, currentUserId, membersById, spot.usd],
  );

  return { calls, loading: !loaded, error, vote, publish, publishing };
}
