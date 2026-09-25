import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppRefresh } from '@/hooks/useAppRefresh';
import { useBtcSince, type BtcHistoryState } from '@/hooks/useBtcMarket';
import { accuracyPercent } from '@/lib/accuracy';
import { frameFor, samePath, type Frame, type PricePoint } from '@/lib/chart';
import {
  HORIZONS,
  bandFor,
  horizonOf,
  scheduleFor,
  type BetPhase,
  type HorizonKey,
} from '@/lib/horizons';
import { describeError, supabase } from '@/lib/supabase';
import { MOCK_BETS } from '@/mocks/oracle';
import type { Member } from '@/types/domain';
import {
  BET_COLUMNS,
  DAY_MS,
  betFromRow,
  myOpenBet,
  openBets,
  pathForSave,
  phaseOfBet,
  resolvedBets,
  seriesForBet,
  shiftPath,
  targetOf,
  unshiftPath,
  upsertBet,
  windowFor,
  withdrawable,
  type Bet,
  type BetRow,
  type Window,
} from './betting';
import { useJudgedHistory } from './useJudgedHistory';

/** Un pari, prêt à afficher. */
export interface BetView {
  bet: Bet;
  author: Member;
  phase: BetPhase;
  /** Le prix visé en fin de pari. `null` pour un tracé vide. */
  target: number | null;
  /** Justesse sur la portion écoulée. `null` tant qu'il n'y a rien à comparer. */
  accuracy: number | null;
  /** Le tracé, en jours depuis l'origine du repère affiché. */
  onChart: PricePoint[];
}

export interface HorizonSummary {
  /** Paris en cours sur cet horizon, tous membres confondus. */
  open: number;
  /** L'état de mon pari en cours sur cet horizon, s'il y en a un. */
  mine: BetPhase | null;
}

export interface OracleState {
  now: number;
  window: Window;
  frame: Frame;
  /** Le cours réel, en jours depuis l'origine du repère. */
  btc: PricePoint[];
  /** Le cours n'a pas pu être chargé : ni courbe, ni justesse. */
  btcUnavailable: boolean;
  /** Les paris en cours des autres membres, sur cet horizon. */
  club: BetView[];
  /** Mon pari en cours sur cet horizon. */
  mine: BetView | null;
  /** Mon tracé à l'écran — déposé ou non — en jours depuis l'origine. */
  draft: PricePoint[];
  setDraft: (points: PricePoint[]) => void;
  /** Où le doigt peut tracer, en jours depuis l'origine. `null` : nulle part. */
  drawRange: { from: number; to: number } | null;
  /** Le tracé à l'écran diffère de ce qui est déposé. */
  dirty: boolean;
  saving: boolean;
  /** Dépose le tracé : ouvre un pari, ou met à jour celui qui est révisable. */
  save: () => void;
  /** Revient au tracé déposé. */
  revert: () => void;
  /** Efface le brouillon — ou retire le pari, s'il est encore révisable. */
  clear: () => void;
  /**
   * Mon pari est verrouillé mais peut être retiré : son tracé est vide, ou
   * personne d'autre n'a parié sur cet horizon (`withdrawable`).
   */
  unlockable: boolean;
  /** Retire mon pari verrouillé, pour en déposer un nouveau. */
  unlock: () => void;
  /** Les paris clos, tous horizons confondus, du plus récent au plus ancien. */
  history: BetView[];
  summary: Record<HorizonKey, HorizonSummary>;
  loading: boolean;
  error: string | null;
}

const EMPTY: PricePoint[] = [];

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

function withoutKey<T>(record: Partial<Record<HorizonKey, T>>, key: HorizonKey) {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * L'heure, rafraîchie à la minute — et pile au moment où un pari bascule.
 *
 * Une minute suffit pour placer le trait « aujourd'hui ». Mais un pari qui se
 * verrouille doit se verrouiller **à l'heure** : sans le second minuteur, le
 * bouton resterait actif jusqu'à une minute après la fermeture, et la base
 * refuserait un dépôt que l'écran proposait encore.
 */
function useClock(bets: readonly Bet[]): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const upcoming = bets
      .flatMap((bet) => [bet.lockedAt, bet.resolvesAt])
      .filter((instant) => instant > now);
    const next = upcoming.length > 0 ? Math.min(...upcoming) : Number.POSITIVE_INFINITY;
    // 250 ms de marge : se réveiller juste **avant** la bascule ne servirait à rien.
    const delay = Math.min(60_000, Math.max(250, next - now + 250));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [bets, now]);

  return now;
}

/** La série à utiliser pour juger un pari : celle qui le couvre, au grain le plus fin. */
function seriesCovering(
  openedAt: number,
  sources: readonly { origin: number; points: BtcHistoryState['points'] }[],
) {
  const usable = sources.filter((source) => source.points.length > 0);
  const covering = usable.filter((source) => source.origin <= openedAt);
  if (covering.length > 0) {
    // L'origine la plus récente est la série la plus courte, donc la plus fine.
    return covering.reduce((best, source) => (source.origin > best.origin ? source : best));
  }
  return usable.reduce<(typeof usable)[number] | null>(
    (best, source) => (!best || source.origin < best.origin ? source : best),
    null,
  );
}

/**
 * L'Oracle : les paris du club, sur un horizon, et le mien.
 *
 * Remplace `usePredictions`, qui ne connaissait qu'une saison. Ce qui change :
 *
 *   • on charge **tous** les paris une fois, puis on suit le temps réel : sept
 *     membres, quelques paris chacun, c'est quelques kilo-octets ;
 *   • le calendrier de chaque pari vient de la base, jamais de l'app ;
 *   • mon tracé est gardé par horizon — passer de « 1 SEM » à « 5 ANS » ne
 *     jette pas le brouillon qu'on était en train de dessiner.
 */
export function useOracle(
  userId: string | null,
  membersById: Map<string, Member>,
  horizon: HorizonKey,
): OracleState {
  const [bets, setBets] = useState<Bet[]>(() => (supabase ? [] : MOCK_BETS));
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Ce que j'ai tracé sans l'avoir déposé, par horizon — relatif à l'ouverture
   * du pari (ou à maintenant, s'il n'existe pas encore).
   *
   * Absent : on montre le tracé déposé. C'est ce qui évite de recopier le pari
   * dans un état local à chaque chargement, et d'avoir à les resynchroniser.
   */
  const [drafts, setDrafts] = useState<Partial<Record<HorizonKey, PricePoint[]>>>({});

  const now = useClock(bets);
  /** « Actualiser » : les paris se relisent (`appRefresh.ts`). */
  const refresh = useAppRefresh();
  const loadedOnce = useRef(false);

  // --- Chargement, puis temps réel ------------------------------------------

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
      if (cause) {
        // Une relecture qui échoue garde les paris affichés.
        if (!loadedOnce.current) setError(describeError(cause));
      } else {
        if (loadedOnce.current) setError(null);
        loadedOnce.current = true;
        setBets(
          (data ?? [])
            .map((row) => betFromRow(row as BetRow))
            .filter((bet): bet is Bet => bet !== null),
        );
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, [refresh]);

  /**
   * Un pari déposé par un membre apparaît chez les six autres sans recharger.
   *
   * La ligne poussée suffit : un pari n'a rien d'autre à rapatrier. `upsertBet`
   * absorbe l'écho de ses propres écritures.
   */
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel('predictions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string } | undefined)?.id;
            if (id) setBets((current) => current.filter((bet) => bet.id !== id));
            return;
          }
          const bet = betFromRow(payload.new as BetRow);
          if (bet) setBets((current) => upsertBet(current, bet));
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  // --- Repère -----------------------------------------------------------------

  const open = useMemo(() => openBets(bets, horizon, now), [bets, horizon, now]);
  const range = useMemo(() => windowFor(open, horizon, now), [open, horizon, now]);
  const closed = useMemo(() => resolvedBets(bets, now), [bets, now]);

  // La série du repère, fine, sert au tracé et aux paris en cours. Les paris
  // clos sont jugés à part, sur des séries qui ne dépendent pas de l'horizon
  // affiché (`useJudgedHistory`) : sinon leurs points changeraient d'un onglet
  // à l'autre.
  const market = useBtcSince(range.origin);

  /**
   * Avec un backend, la série de démonstration n'est jamais le cours : juger
   * un pari dessus, ce serait inventer un gagnant. Sans backend, c'est le
   * mode démo, et elle est là pour ça.
   */
  const sources = useMemo(() => {
    const out: { origin: number; points: BtcHistoryState['points'] }[] = [];
    for (const source of [market]) {
      if (source.origin === null) continue;
      if (source.simulated && supabase) continue;
      out.push({ origin: source.origin, points: source.points });
    }
    return out;
  }, [market]);

  const btc = useMemo(() => {
    const source = sources.find((candidate) => candidate.origin === market.origin);
    return source ? seriesForBet(source.points, source.origin, range.origin) : EMPTY;
  }, [sources, market.origin, range.origin]);

  const frame = useMemo(() => {
    // Le repère ne dépend **pas** du brouillon : il se recalculerait sous le
    // doigt, et la courbe glisserait pendant qu'on la trace.
    const prices = [
      ...btc.map(([, price]) => price),
      ...open.flatMap((bet) => bet.path.map(([, price]) => price)),
    ];
    const anchor = btc[btc.length - 1]?.[1] ?? open[0]?.path[0]?.[1] ?? Number.NaN;
    return frameFor(range.days, prices, anchor, bandFor(horizon));
  }, [btc, open, range.days, horizon]);

  // --- Vues -------------------------------------------------------------------

  const view = useCallback(
    (bet: Bet): BetView => {
      const source = seriesCovering(bet.openedAt, sources);
      return {
        bet,
        author: membersById.get(bet.userId) ?? unknownMember(bet.userId),
        phase: phaseOfBet(bet, now),
        target: targetOf(bet.path),
        // La justesse se lit **dès** qu'une portion du cours recoupe le tracé :
        // les tracés sont déjà visibles, rien n'est divulgué en les chiffrant.
        accuracy: source
          ? accuracyPercent(bet.path, seriesForBet(source.points, source.origin, bet.openedAt))
          : null,
        onChart: shiftPath(bet.path, bet.openedAt, range.origin),
      };
    },
    [sources, membersById, now, range.origin],
  );

  const mineBet = useMemo(
    () => myOpenBet(bets, userId, horizon, now),
    [bets, userId, horizon, now],
  );
  const mine = useMemo(() => (mineBet ? view(mineBet) : null), [mineBet, view]);
  const club = useMemo(
    () => open.filter((bet) => bet.userId !== userId).map(view),
    [open, userId, view],
  );
  const history = useJudgedHistory(closed, membersById, now);

  const summary = useMemo(() => {
    const out = {} as Record<HorizonKey, HorizonSummary>;
    for (const { key } of HORIZONS) {
      const mineHere = myOpenBet(bets, userId, key, now);
      out[key] = {
        open: openBets(bets, key, now).length,
        mine: mineHere ? phaseOfBet(mineHere, now) : null,
      };
    }
    return out;
  }, [bets, userId, now]);

  // --- Mon tracé ----------------------------------------------------------------

  /**
   * Je peux tracer : connecté, paris chargés, et sans pari verrouillé sur cet
   * horizon. Avant le chargement, on ne sait pas encore si j'ai un pari en
   * cours — en ouvrir un second, la base le refuserait.
   */
  const editable =
    Boolean(userId) && !loading && (!mineBet || phaseOfBet(mineBet, now) === 'open');
  /** Le jour zéro de mon tracé : l'ouverture de mon pari, ou maintenant. */
  const anchor = mineBet?.openedAt ?? now;
  const saved = mineBet?.path ?? EMPTY;
  /**
   * Un brouillon ne compte que tant qu'on peut encore déposer.
   *
   * Sans cette garde, un brouillon resté en mémoire au moment du verrouillage
   * — une toile vidée pour redessiner, par exemple — masquait le tracé
   * enregistré : le pari figé s'affichait vide.
   */
  const pending = editable ? drafts[horizon] : undefined;
  const current = pending ?? saved;

  const draft = useMemo(
    () => shiftPath(current, anchor, range.origin),
    [current, anchor, range.origin],
  );

  const drawRange = useMemo(() => {
    if (!editable) return null;
    // On trace à partir d'aujourd'hui, jamais avant : le passé est déjà écrit
    // par la courbe réelle, et le recopier gonflerait la justesse à bon compte.
    const from = range.today;
    const to = (anchor - range.origin) / DAY_MS + horizonOf(horizon).days;
    return to > from ? { from, to } : null;
  }, [editable, range.today, range.origin, anchor, horizon]);

  const setDraft = useCallback(
    (points: PricePoint[]) => {
      if (!editable) return;
      setDrafts((all) => ({ ...all, [horizon]: unshiftPath(points, anchor, range.origin) }));
    },
    [editable, horizon, anchor, range.origin],
  );

  const dirty = pending !== undefined && !samePath(pending, saved);

  const settle = useCallback(
    (written: PricePoint[] | undefined) => {
      // Un trait ajouté pendant l'écriture n'est pas perdu : on ne referme le
      // brouillon que s'il est encore celui qu'on vient d'envoyer.
      setDrafts((all) => (all[horizon] === written ? withoutKey(all, horizon) : all));
    },
    [horizon],
  );

  const save = useCallback(() => {
    if (!userId || !editable || saving) return;
    const path = pathForSave(current, horizonOf(horizon).days);
    if (path.length < 2) return;
    const written = pending;
    const client = supabase;

    // Sans backend, « déposé » veut quand même dire quelque chose : le pari
    // apparaît, avec le calendrier qu'aurait fixé la base.
    if (!client) {
      const schedule = scheduleFor(horizon, Date.now());
      const bet: Bet = mineBet
        ? { ...mineBet, path }
        : {
            id: `local-${horizon}-${schedule.openedAt}`,
            userId,
            horizon,
            openedAt: schedule.openedAt,
            lockedAt: schedule.locksAt,
            resolvesAt: schedule.resolvesAt,
            path,
            hash: 'D3M0',
          };
      setBets((all) => upsertBet(all, bet));
      settle(written);
      return;
    }

    setSaving(true);
    void (async () => {
      const pathData = path as [number, number][];
      // Le calendrier n'est pas envoyé : la base le fixe à l'insertion, et
      // refuse qu'on le change ensuite.
      const { data, error: cause } = mineBet
        ? await client
            .from('predictions')
            .update({ path_data: pathData })
            .eq('id', mineBet.id)
            .select(BET_COLUMNS)
            .single()
        : await client
            .from('predictions')
            .insert({ user_id: userId, horizon, path_data: pathData })
            .select(BET_COLUMNS)
            .single();
      setSaving(false);

      if (cause) {
        setError(describeError(cause));
        return;
      }
      const bet = betFromRow(data as BetRow);
      if (bet) setBets((all) => upsertBet(all, bet));
      setError(null);
      settle(written);
    })();
  }, [userId, editable, saving, current, horizon, pending, mineBet, settle]);

  const revert = useCallback(() => {
    setDrafts((all) => withoutKey(all, horizon));
  }, [horizon]);

  /**
   * Retire mon pari de cet horizon — la base décide si c'est permis
   * (`prediction_withdrawable`), l'écran ne fait que proposer.
   */
  const withdraw = useCallback(
    (bet: Bet) => {
      const client = supabase;
      const id = bet.id;
      if (!client) {
        setBets((all) => all.filter((candidate) => candidate.id !== id));
        setDrafts((all) => withoutKey(all, horizon));
        return;
      }

      setSaving(true);
      void (async () => {
        // `select` pour savoir si une ligne est partie : la base ne lève pas
        // d'erreur sur un pari qu'elle refuse de retirer, elle n'en supprime
        // aucun.
        const { data, error: cause } = await client
          .from('predictions')
          .delete()
          .eq('id', id)
          .select('id');
        setSaving(false);

        if (cause) {
          setError(describeError(cause));
          return;
        }
        if (!data || data.length === 0) {
          setError(
            'Ce pari ne peut plus être retiré : un autre membre a parié sur cet horizon.',
          );
          return;
        }
        setError(null);
        setBets((all) => all.filter((candidate) => candidate.id !== id));
        setDrafts((all) => withoutKey(all, horizon));
      })();
    },
    [horizon],
  );

  const clear = useCallback(() => {
    if (!editable || saving) return;
    if (!mineBet) {
      setDrafts((all) => withoutKey(all, horizon));
      return;
    }
    withdraw(mineBet);
  }, [editable, saving, mineBet, horizon, withdraw]);

  /** Mon pari verrouillé peut être retiré : tracé vide, ou seul sur l'horizon. */
  const unlockable = Boolean(
    mineBet && phaseOfBet(mineBet, now) === 'locked' && withdrawable(mineBet, bets, now),
  );

  const unlock = useCallback(() => {
    if (!unlockable || !mineBet || saving) return;
    withdraw(mineBet);
  }, [unlockable, mineBet, saving, withdraw]);

  return {
    now,
    window: range,
    frame,
    btc,
    btcUnavailable: !market.loading && btc.length === 0,
    club,
    mine,
    draft,
    setDraft,
    drawRange,
    dirty,
    saving,
    save,
    revert,
    clear,
    unlockable,
    unlock,
    history,
    summary,
    loading,
    error,
  };
}
