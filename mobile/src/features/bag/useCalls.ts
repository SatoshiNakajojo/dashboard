import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { checkEntryDate, clubDateToIso, clubIsoDay, entryDayOf } from '@/lib/btcAtDate';
import { fetchBtcOn, resolveCoingeckoId } from '@/lib/coingecko';
import { providerFor, toYahooSymbol } from '@/lib/quotes';
import { performancePercent, vsBitcoinPercent } from '@/lib/performance';
import { entryBtcFor, liveBtc, mergeQuotes } from './quoteRefresh';
import { useLiveQuotes } from './useLiveQuotes';
import { describeError, supabase } from '@/lib/supabase';
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
  /**
   * Jour de l'entrée, `JJ/MM/AAAA` à l'heure du club. Vide : aujourd'hui.
   *
   * C'est lui qui fixe le référentiel vs ₿ : le bitcoin se compare depuis le
   * même jour que le titre, pas depuis la publication.
   */
  entryDate?: string;
}

/** Ce qu'un auteur corrige sur son call. */
export interface EditInput {
  entryPrice: number;
  /** `JJ/MM/AAAA`. */
  entryDate: string;
  thesis: string;
}

export interface CallsState {
  calls: CallView[];
  loading: boolean;
  error: string | null;
  /** Un seul vote par membre et par call ; re-tap = annulation. */
  vote: (tickerId: string, side: Vote) => void;
  /** Publie un call. Résout l'erreur en `false` plutôt que de lever. */
  publish: (input: PublishInput) => Promise<boolean>;
  /** Corrige un de mes calls. `false` et un message en cas d'échec. */
  edit: (tickerId: string, input: EditInput) => Promise<boolean>;
  /** Supprime un de mes calls. */
  remove: (tickerId: string) => Promise<boolean>;
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
  avatarUrl: null,
  links: [],
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

  /**
   * Le jour d'entrée saisi, et le cours du bitcoin ce jour-là.
   *
   * Le référentiel vs ₿ est le cours du bitcoin **le jour de l'entrée**. Pris à
   * la publication, il ne couvrait que quelques minutes, et un prix d'achat
   * vieux de six mois se comparait à un bitcoin immobile.
   *
   * Renvoie un message plutôt qu'un cours quand il faut s'arrêter : sans ce
   * cours, la colonne « vs ₿ » serait vide pour toujours.
   */
  const resolveEntry = useCallback(
    async (
      assetClass: PublishInput['assetClass'],
      entryPrice: number,
      entryDate: string,
    ): Promise<{ enteredOn: string; btcAtEntry: number | null } | { problem: string }> => {
      const when = checkEntryDate(entryDate);
      if (when.kind === 'invalid')
        return { problem: 'Date d’entrée illisible — format JJ/MM/AAAA.' };
      if (when.kind === 'future') {
        return { problem: 'La date d’entrée ne peut pas être dans le futur.' };
      }
      const enteredOn =
        when.kind === 'today' ? clubIsoDay(Date.now()) : clubDateToIso(entryDate)!;

      // Un call BTC est son propre référentiel : lui demander le spot serait
      // un aller-retour pour redécouvrir son propre prix.
      if (assetClass === 'BTC') {
        return { enteredOn, btcAtEntry: entryBtcFor(assetClass, entryPrice, null) };
      }

      const btc =
        (when.kind === 'today'
          ? (liveBtc(spot) ?? (await fetchBtcOn(Date.now())))
          : await fetchBtcOn(when.ms)) ??
        // Mode démo, sans réseau : le cours de repli fait l'affaire, rien
        // n'est enregistré nulle part.
        (supabase ? null : spot.usd);
      if (btc === null) {
        return {
          problem:
            when.kind === 'today'
              ? 'Cours du bitcoin indisponible pour l’instant — réessayez dans un moment.'
              : `Cours du bitcoin au ${entryDate} introuvable — réessayez dans un moment.`,
        };
      }
      return { enteredOn, btcAtEntry: entryBtcFor(assetClass, entryPrice, btc) };
    },
    [spot],
  );

  const publish = useCallback(
    async (input: PublishInput): Promise<boolean> => {
      if (!currentUserId || publishing) return false;
      setPublishing(true);

      try {
        const entry = await resolveEntry(
          input.assetClass,
          input.entryPrice,
          input.entryDate ?? '',
        );
        if ('problem' in entry) {
          setError(entry.problem);
          return false;
        }

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
            btcSpot: entry.btcAtEntry,
            enteredOn: entry.enteredOn,
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
    [currentUserId, publishing, source, resolveEntry],
  );

  /**
   * Corrige un de mes calls : prix, jour d'entrée, thèse.
   *
   * Le référentiel BTC n'est recalculé que si le jour d'entrée change — ou si
   * c'est un call BTC, dont le référentiel **est** le prix d'entrée. Corriger
   * une faute dans la thèse ne doit pas déplacer la colonne « vs ₿ ».
   */
  const edit = useCallback(
    async (tickerId: string, input: EditInput): Promise<boolean> => {
      const ticker = tickers.find((row) => row.id === tickerId);
      if (!ticker || ticker.userId !== currentUserId || publishing) return false;
      setPublishing(true);

      try {
        const sameDay = input.entryDate.trim() === entryDayOf(ticker);
        let enteredOn = ticker.enteredOn ?? clubDateToIso(entryDayOf(ticker))!;
        let entryBtcPrice = ticker.entryBtcPrice;

        if (!sameDay || ticker.assetClass === 'BTC') {
          const entry = await resolveEntry(
            ticker.assetClass,
            input.entryPrice,
            input.entryDate,
          );
          if ('problem' in entry) {
            setError(entry.problem);
            return false;
          }
          enteredOn = entry.enteredOn;
          entryBtcPrice = entry.btcAtEntry;
        }

        const next = await source.update(tickerId, {
          entryPrice: input.entryPrice,
          entryBtcPrice,
          enteredOn,
          thesis: input.thesis,
        });
        setTickers((rows) => rows.map((row) => (row.id === tickerId ? next : row)));
        setError(null);
        return true;
      } catch (cause) {
        setError(describeError(cause));
        return false;
      } finally {
        setPublishing(false);
      }
    },
    [tickers, currentUserId, publishing, source, resolveEntry],
  );

  /** Supprime un de mes calls. Ses votes partent avec lui (`on delete cascade`). */
  const remove = useCallback(
    async (tickerId: string): Promise<boolean> => {
      const ticker = tickers.find((row) => row.id === tickerId);
      if (!ticker || ticker.userId !== currentUserId) return false;
      try {
        await source.remove(tickerId);
        setTickers((rows) => rows.filter((row) => row.id !== tickerId));
        setVotes((rows) => rows.filter((row) => row.tickerId !== tickerId));
        setError(null);
        return true;
      } catch (cause) {
        setError(describeError(cause));
        return false;
      }
    },
    [tickers, currentUserId, source],
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
                  // Le cours de repli n'est pas un cours : « — » plutôt qu'un
                  // bitcoin figé qui ferait recopier la perf. En mode démo,
                  // il est le seul cours du monde fictif.
                  supabase ? liveBtc(spot) : spot.usd,
                ),
          bull: displayed.bull,
          bear: displayed.bear,
          myVote: mine,
        };
      }),
    [priced, tallies, votes, pendingVote, currentUserId, membersById, spot],
  );

  return { calls, loading: !loaded, error, vote, publish, edit, remove, publishing };
}
