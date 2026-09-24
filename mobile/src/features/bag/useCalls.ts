import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { checkEntryDate, clubDateToIso, clubIsoDay, entryDayOf } from '@/lib/btcAtDate';
import { fetchBtcOn, resolveCoingeckoId } from '@/lib/coingecko';
import { providerFor, toYahooSymbol } from '@/lib/quotes';
import { callPerformance } from '@/lib/performance';
import { entryBtcFor, liveBtc, mergeQuotes } from './quoteRefresh';
import { useLiveQuotes } from './useLiveQuotes';
import { describeError, supabase } from '@/lib/supabase';
import type { CallView, Member, Ticker, Vote, VoteView } from '@/types/domain';
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

/** La sortie d'une position, telle que saisie. */
export interface CloseInput {
  exitPrice: number;
  /** `JJ/MM/AAAA`. Vide : aujourd'hui. */
  exitDate: string;
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
  /**
   * Vote bull ou bear sur le call d'un autre, avec la phrase qui l'explique ;
   * `null` retire mon vote. `false` et un message en cas de refus — fenêtre
   * fermée, call clos, phrase manquante.
   */
  vote: (tickerId: string, vote: { side: Vote; reason: string } | null) => Promise<boolean>;
  /** Un vote en cours d'écriture. */
  voting: boolean;
  /** Publie un call. Résout l'erreur en `false` plutôt que de lever. */
  publish: (input: PublishInput) => Promise<boolean>;
  /** Corrige un de mes calls. `false` et un message en cas d'échec. */
  edit: (tickerId: string, input: EditInput) => Promise<boolean>;
  /** Supprime un de mes calls. */
  remove: (tickerId: string) => Promise<boolean>;
  /** Clôture un de mes calls, ou corrige sa sortie. */
  close: (tickerId: string, input: CloseInput) => Promise<boolean>;
  /** Rouvre un de mes calls clos. */
  reopen: (tickerId: string) => Promise<boolean>;
  /** Publication en cours — le bouton du composer s'en sert. */
  publishing: boolean;
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
  const [voting, setVoting] = useState(false);

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

  /**
   * Pas d'écriture optimiste ici : un vote porte une phrase et des points, et
   * la base peut le refuser (fenêtre fermée, call clos). Mieux vaut une demi-
   * seconde d'attente qu'un vote affiché puis retiré.
   */
  const vote = useCallback(
    async (tickerId: string, next: { side: Vote; reason: string } | null): Promise<boolean> => {
      if (!currentUserId || voting) return false;
      setVoting(true);
      try {
        const row = await source.setVote(tickerId, currentUserId, next);
        setVotes((rows) => {
          const without = rows.filter(
            (v) => !(v.tickerId === tickerId && v.userId === currentUserId),
          );
          return row ? [...without, row] : without;
        });
        setError(null);
        return true;
      } catch (cause) {
        setError(describeError(cause));
        return false;
      } finally {
        setVoting(false);
      }
    },
    [currentUserId, voting, source],
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
      /** Le même calcul sert à la sortie : seul le mot change. */
      word: 'entrée' | 'sortie' = 'entrée',
    ): Promise<{ enteredOn: string; btcAtEntry: number | null } | { problem: string }> => {
      const when = checkEntryDate(entryDate);
      if (when.kind === 'invalid')
        return { problem: `Date de ${word} illisible — format JJ/MM/AAAA.` };
      if (when.kind === 'future') {
        return { problem: `La date de ${word} ne peut pas être dans le futur.` };
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

  /**
   * Clôture un de mes calls — ou corrige la sortie d'un call déjà clos.
   *
   * Le référentiel vs ₿ s'arrête le jour de la sortie : on va chercher le cours
   * du bitcoin ce jour-là, comme pour l'entrée. Sans lui, la perf vs ₿ d'une
   * position close continuerait de bouger avec le bitcoin d'aujourd'hui.
   */
  const close = useCallback(
    async (tickerId: string, input: CloseInput): Promise<boolean> => {
      const ticker = tickers.find((row) => row.id === tickerId);
      if (!ticker || ticker.userId !== currentUserId || publishing) return false;
      if (!(Number.isFinite(input.exitPrice) && input.exitPrice > 0)) {
        setError('Indiquez le prix de sortie.');
        return false;
      }
      setPublishing(true);

      try {
        const exit = await resolveEntry(
          ticker.assetClass,
          input.exitPrice,
          input.exitDate,
          'sortie',
        );
        if ('problem' in exit) {
          setError(exit.problem);
          return false;
        }
        const entryIso = ticker.enteredOn ?? clubDateToIso(entryDayOf(ticker))!;
        if (exit.enteredOn < entryIso) {
          setError(`La sortie ne peut pas précéder l’entrée (${entryDayOf(ticker)}).`);
          return false;
        }

        const next = await source.setExit(tickerId, {
          exitPrice: input.exitPrice,
          exitBtcPrice: exit.btcAtEntry,
          closedOn: exit.enteredOn,
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

  /** Rouvre un de mes calls clos : il reprend son cours, et la carte le dit. */
  const reopen = useCallback(
    async (tickerId: string): Promise<boolean> => {
      const ticker = tickers.find((row) => row.id === tickerId);
      if (!ticker || ticker.userId !== currentUserId || ticker.closedOn === null) return false;
      try {
        const next = await source.setExit(tickerId, null);
        setTickers((rows) => rows.map((row) => (row.id === tickerId ? next : row)));
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

  /** Les votes de chaque call, du plus ancien au plus récent. */
  const votesByCall = useMemo(() => {
    const out = new Map<string, VoteView[]>();
    const sorted = [...votes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const row of sorted) {
      const list = out.get(row.tickerId) ?? [];
      list.push({
        userId: row.userId,
        side: row.side,
        reason: row.reason,
        createdAt: row.createdAt,
      });
      out.set(row.tickerId, list);
    }
    return out;
  }, [votes]);

  // L'heure, pour savoir si une fenêtre de vote est encore ouverte. Relue à
  // chaque changement des votes ou des cours : assez souvent pour une fenêtre
  // de trois jours.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
        const voters = votesByCall.get(ticker.id) ?? [];
        const mine = voters.find((v) => v.userId === currentUserId)?.side ?? null;

        return {
          ...ticker,
          author: membersById.get(ticker.userId) ?? { id: ticker.userId, ...UNKNOWN_MEMBER },
          // Le cours de repli n'est pas un cours : « — » plutôt qu'un bitcoin
          // figé qui ferait recopier la perf. En mode démo, il est le seul
          // cours du monde fictif.
          ...callPerformance(ticker, supabase ? liveBtc(spot) : spot.usd),
          bull: voters.filter((v) => v.side === 'bull').length,
          bear: voters.filter((v) => v.side === 'bear').length,
          myVote: mine,
          voters,
          votesOpen: ticker.closedOn === null && now <= Date.parse(ticker.votesCloseAt),
          votesLeftMs: Date.parse(ticker.votesCloseAt) - now,
        };
      }),
    [priced, votesByCall, currentUserId, membersById, spot, now],
  );

  return {
    calls,
    loading: !loaded,
    error,
    vote,
    voting,
    publish,
    edit,
    remove,
    close,
    reopen,
    publishing,
  };
}
