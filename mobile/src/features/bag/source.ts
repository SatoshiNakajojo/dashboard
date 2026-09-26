/**
 * Source de données du Bag — calls et votes.
 *
 * Même contrat que `features/potluck/source.ts` : une interface, deux
 * implémentations. Le magasin mock est mutable et vit à l'échelle du module,
 * pour qu'un call publié survive à un changement d'onglet.
 */

import { supabase } from '@/lib/supabase';
import { MOCK_TICKERS, MOCK_VOTE_ROWS } from '@/mocks/calls';
import { MOCK_CURRENT_USER_ID } from '@/mocks/members';
import type { AssetClass } from '@/theme/tokens';
import type { Ticker, Vote } from '@/types/domain';

/** Ce qu'un membre saisit dans le composer, avant tout enrichissement. */
export interface CallDraftInput {
  assetClass: AssetClass;
  symbol: string;
  entryPrice: number;
  thesis: string;
  /**
   * Cours BTC au moment de la publication — fige le référentiel vs ₿.
   *
   * Nullable comme la colonne qui le reçoit : si le spot est introuvable, on
   * enregistre l'absence plutôt qu'un zéro, et la carte affiche « — ». C'est
   * la seule valeur du modèle qu'on ne pourra jamais retrouver après coup.
   */
  btcSpot: number | null;
  /** Identifiant CoinGecko, pour une crypto. */
  coingeckoId: string | null;
  /** Symbole Yahoo Finance, pour une action ou un ETF. */
  yahooSymbol: string | null;
  /** Jour de l'entrée, `AAAA-MM-JJ` — aujourd'hui ; la base l'impose. */
  enteredOn: string;
}

/**
 * Ce qu'un auteur peut corriger sur son call : sa thèse.
 *
 * Pas le titre ni la classe — changer de titre, c'est un autre call. Pas non
 * plus le prix ni le jour d'entrée (v1.01) : ce sont ceux du marché à la
 * publication. La base le refuse aussi (`tickers_live_entry`).
 */
export interface CallPatch {
  thesis: string;
}

/** La sortie d'une position : ce qui la clôture. */
export interface CallExit {
  exitPrice: number;
  /** Cours du BTC le jour de la sortie. `null` s'il est introuvable. */
  exitBtcPrice: number | null;
  /** `AAAA-MM-JJ`. */
  closedOn: string;
}

export interface VoteRow {
  tickerId: string;
  userId: string;
  side: Vote;
  /** La phrase du vote. `null` pour les votes d'avant la règle. */
  reason: string | null;
  createdAt: string;
  /** Changement de camp — une fois au plus par call. `null` : jamais. */
  changedAt: string | null;
}

/**
 * Une exception au cours live, accordée par le club (migration
 * `20261009090000_entry_waivers`) : ce membre publie **un** call sur ce titre
 * au prix et au jour où il est entré, au plus `maxDaysBack` jours en arrière.
 */
export interface EntryWaiver {
  symbol: string;
  maxDaysBack: number;
}

export interface CallsSource {
  list(signal?: AbortSignal): Promise<Ticker[]>;
  /** Mes exceptions encore ouvertes. */
  listMyWaivers(userId: string, signal?: AbortSignal): Promise<EntryWaiver[]>;
  listVotes(signal?: AbortSignal): Promise<VoteRow[]>;
  /**
   * Les calls sur lesquels ce membre a retiré son vote — c'est définitif.
   * Information d'affichage : la base, elle, refuse le revote d'elle-même.
   */
  listMyWithdrawals(userId: string, signal?: AbortSignal): Promise<string[]>;
  /** Publie un call. Le ticker renvoyé porte l'identifiant définitif. */
  publish(draft: CallDraftInput, userId: string): Promise<Ticker>;
  /**
   * Pose ou change un vote, avec sa phrase ; `null` le retire. Renvoie la
   * ligne telle que la base l'a écrite (heure comprise), ou `null` si retiré.
   */
  setVote(
    tickerId: string,
    userId: string,
    vote: { side: Vote; reason: string } | null,
  ): Promise<VoteRow | null>;
  /** Corrige un call. Le ticker renvoyé porte `editedAt`, posé par la base. */
  update(tickerId: string, patch: CallPatch): Promise<Ticker>;
  /** Supprime un call — ses votes partent avec lui. */
  remove(tickerId: string): Promise<void>;
  /**
   * Clôture un call, ou corrige sa sortie. `null` le rouvre. Le ticker renvoyé
   * porte `closedAt` et `editedAt`, posés par la base.
   */
  setExit(tickerId: string, exit: CallExit | null): Promise<Ticker>;
}

// ---------------------------------------------------------------------------

/**
 * `*` plutôt qu'une liste : l'app publiée doit fonctionner avant comme après
 * une migration qui ajoute une colonne (`entry_confirmed_at`, v1.01) — le
 * déploiement automatique peut précéder le `db push`.
 */
const COLUMNS = '*';

interface Row {
  id: string;
  user_id: string;
  symbol: string;
  asset_class: AssetClass;
  entry_price: number | string;
  current_price: number | string | null;
  entry_btc_price: number | string | null;
  size_usd: number | string | null;
  thesis: string;
  coingecko_id: string | null;
  yahoo_symbol: string | null;
  price_updated_at: string | null;
  created_at: string;
  entered_on: string | null;
  edited_at: string | null;
  exit_price: number | string | null;
  exit_btc_price: number | string | null;
  closed_on: string | null;
  closed_at: string | null;
  votes_close_at: string | null;
  /** Absent avant la migration `20261002090000_live_entry_price`. */
  entry_confirmed_at?: string | null;
  /** Absent avant la migration `20261007090000_live_exit_price`. */
  exit_confirmed_at?: string | null;
}

/** `numeric` revient en chaîne depuis PostgREST : on ne suppose jamais un nombre. */
const num = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function fromRow(row: Row): Ticker {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    entryPrice: num(row.entry_price) ?? 0,
    currentPrice: num(row.current_price),
    entryBtcPrice: num(row.entry_btc_price),
    sizeUsd: num(row.size_usd),
    thesis: row.thesis,
    coingeckoId: row.coingecko_id,
    yahooSymbol: row.yahoo_symbol,
    priceUpdatedAt: row.price_updated_at,
    createdAt: row.created_at,
    enteredOn: row.entered_on,
    editedAt: row.edited_at,
    exitPrice: num(row.exit_price),
    exitBtcPrice: num(row.exit_btc_price),
    closedOn: row.closed_on,
    closedAt: row.closed_at,
    // Avant la migration des votes argumentés, la colonne n'existe pas : la
    // fenêtre se déduit alors de la publication, comme le ferait la base.
    votesCloseAt: row.votes_close_at ?? votesCloseFor(row.created_at),
    // Sans la colonne, la base est d'avant la règle : tout prix y est tenu
    // pour confirmé, comme la migration le fera.
    entryConfirmedAt:
      row.entry_confirmed_at === undefined ? row.created_at : row.entry_confirmed_at,
    exitConfirmedAt:
      row.exit_confirmed_at === undefined ? row.closed_at : row.exit_confirmed_at,
  };
}

/** La fenêtre de vote d'un call publié à `createdAt` — la règle de la base. */
export const VOTE_WINDOW_MS = 72 * 3_600_000;

export function votesCloseFor(createdAt: string): string {
  const published = Date.parse(createdAt);
  return new Date(
    (Number.isFinite(published) ? published : Date.now()) + VOTE_WINDOW_MS,
  ).toISOString();
}

function voteFromRow(row: {
  ticker_id: string;
  user_id: string;
  side: Vote;
  reason: string | null;
  created_at: string;
  changed_at?: string | null;
}): VoteRow {
  return {
    tickerId: row.ticker_id,
    userId: row.user_id,
    side: row.side,
    reason: row.reason,
    createdAt: row.created_at,
    changedAt: row.changed_at ?? null,
  };
}

/**
 * Les colonnes d'un vote : `*` plutôt qu'une liste, pour que l'app publiée
 * fonctionne avant comme après la migration qui ajoute `changed_at` — le
 * déploiement automatique peut précéder le `db push`.
 */
const VOTE_COLUMNS = '*';

function createSupabaseSource(client: NonNullable<typeof supabase>): CallsSource {
  return {
    async list(signal) {
      let query = client
        .from('tickers')
        .select(COLUMNS)
        .order('created_at', { ascending: false });
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => fromRow(row as unknown as Row));
    },

    async listVotes(signal) {
      let query = client.from('ticker_votes').select(VOTE_COLUMNS).order('created_at');
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => voteFromRow(row as Parameters<typeof voteFromRow>[0]));
    },

    async listMyWaivers(userId, signal) {
      let query = client
        .from('entry_waivers')
        .select('symbol, max_days_back')
        .eq('user_id', userId)
        .is('used_at', null);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      // Avant la migration, la table n'existe pas : aucune exception.
      if (error) return [];
      return (data ?? []).map((row) => ({
        symbol: String(row.symbol),
        maxDaysBack: Number(row.max_days_back),
      }));
    },

    async listMyWithdrawals(userId, signal) {
      let query = client
        .from('ticker_vote_withdrawals')
        .select('ticker_id')
        .eq('user_id', userId);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      // Avant la migration, la table n'existe pas : rien de retiré, et rien ne
      // doit casser. La règle, elle, vit dans la base.
      if (error) return [];
      return (data ?? []).map((row) => row.ticker_id);
    },

    async publish(draft, userId) {
      const { data, error } = await client
        .from('tickers')
        .insert({
          user_id: userId,
          symbol: draft.symbol,
          asset_class: draft.assetClass,
          entry_price: draft.entryPrice,
          // À la publication, le prix courant **est** le prix d'entrée : la
          // carte s'ouvre à 0 %, pas sur une perf inventée.
          current_price: draft.entryPrice,
          entry_btc_price: draft.btcSpot,
          thesis: draft.thesis,
          // Un actif a un fournisseur, pas deux : la contrainte
          // `tickers_one_quote_source` le vérifie côté base.
          coingecko_id: draft.coingeckoId,
          yahoo_symbol: draft.yahooSymbol,
          entered_on: draft.enteredOn,
        })
        .select(COLUMNS)
        .single();

      if (error) throw error;
      return fromRow(data as unknown as Row);
    },

    async update(tickerId, patch) {
      const { data, error } = await client
        .from('tickers')
        .update({ thesis: patch.thesis })
        .eq('id', tickerId)
        .select(COLUMNS)
        .single();

      if (error) throw error;
      return fromRow(data as unknown as Row);
    },

    async remove(tickerId) {
      // `select` pour savoir si la ligne est partie : la RLS ne lève pas sur
      // le call d'un autre, elle n'en supprime aucun.
      const { data, error } = await client
        .from('tickers')
        .delete()
        .eq('id', tickerId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Ce call ne peut pas être supprimé.');
    },

    async setExit(tickerId, exit) {
      const { data, error } = await client
        .from('tickers')
        .update({
          exit_price: exit?.exitPrice ?? null,
          exit_btc_price: exit?.exitBtcPrice ?? null,
          closed_on: exit?.closedOn ?? null,
        })
        .eq('id', tickerId)
        .select(COLUMNS)
        .single();

      if (error) throw error;
      return fromRow(data as unknown as Row);
    },

    async setVote(tickerId, userId, vote) {
      if (!vote) {
        const { error } = await client
          .from('ticker_votes')
          .delete()
          .eq('ticker_id', tickerId)
          .eq('user_id', userId);
        if (error) throw error;
        return null;
      }
      // La base vérifie la fenêtre, l'auteur et la phrase (`ticker_votes_guard`).
      const { data, error } = await client
        .from('ticker_votes')
        .upsert(
          { ticker_id: tickerId, user_id: userId, side: vote.side, reason: vote.reason },
          { onConflict: 'ticker_id,user_id' },
        )
        .select(VOTE_COLUMNS)
        .single();
      if (error) throw error;
      return voteFromRow(data as Parameters<typeof voteFromRow>[0]);
    },
  };
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const MOCK_LATENCY_MS = 260;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function createMockSource(): CallsSource {
  const tickers: Ticker[] = MOCK_TICKERS.map((t) => ({ ...t }));

  const votes: VoteRow[] = MOCK_VOTE_ROWS.map((v) => ({ ...v }));
  /** Les retraits, `tickerId:userId` — définitifs, comme dans la base. */
  const withdrawals = new Set<string>();
  /** Démo : une exception sur $VIAV, pour voir la feuille qui l'accueille. */
  const waivers = new Map<string, EntryWaiver[]>([
    [MOCK_CURRENT_USER_ID, [{ symbol: '$VIAV', maxDaysBack: 7 }]],
  ]);

  return {
    async list() {
      await delay(MOCK_LATENCY_MS);
      return tickers.map((t) => ({ ...t }));
    },

    async listVotes() {
      await delay(MOCK_LATENCY_MS);
      return votes.map((v) => ({ ...v }));
    },

    async listMyWaivers(userId) {
      return (waivers.get(userId) ?? []).map((waiver) => ({ ...waiver }));
    },

    async listMyWithdrawals(userId) {
      return [...withdrawals]
        .filter((key) => key.endsWith(`:${userId}`))
        .map((key) => key.split(':')[0]!);
    },

    async publish(draft, userId) {
      await delay(MOCK_LATENCY_MS);
      const ticker: Ticker = {
        id: `mock-${Date.now().toString(36)}`,
        userId,
        symbol: draft.symbol,
        assetClass: draft.assetClass,
        entryPrice: draft.entryPrice,
        currentPrice: draft.entryPrice,
        entryBtcPrice: draft.btcSpot,
        sizeUsd: null,
        thesis: draft.thesis,
        coingeckoId: draft.coingeckoId,
        yahooSymbol: draft.yahooSymbol,
        priceUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        enteredOn: draft.enteredOn,
        editedAt: null,
        exitPrice: null,
        exitBtcPrice: null,
        closedOn: null,
        closedAt: null,
        votesCloseAt: votesCloseFor(new Date().toISOString()),
        // Démo : pas de serveur pour relire le cours, il est tenu pour confirmé.
        entryConfirmedAt: new Date().toISOString(),
        exitConfirmedAt: null,
      };
      tickers.unshift(ticker);
      // Comme la base : publier sur ce titre consomme l'exception.
      const mine = waivers.get(userId);
      if (mine) {
        waivers.set(
          userId,
          mine.filter((waiver) => waiver.symbol.toUpperCase() !== draft.symbol.toUpperCase()),
        );
      }
      return { ...ticker };
    },

    async update(tickerId, patch) {
      await delay(MOCK_LATENCY_MS);
      const index = tickers.findIndex((t) => t.id === tickerId);
      if (index === -1) throw new Error('Call introuvable');
      const next: Ticker = {
        ...tickers[index]!,
        ...patch,
        editedAt: new Date().toISOString(),
      };
      tickers[index] = next;
      return { ...next };
    },

    async remove(tickerId) {
      await delay(MOCK_LATENCY_MS);
      const index = tickers.findIndex((t) => t.id === tickerId);
      if (index !== -1) tickers.splice(index, 1);
      for (let i = votes.length - 1; i >= 0; i--) {
        if (votes[i]!.tickerId === tickerId) votes.splice(i, 1);
      }
    },

    async setExit(tickerId, exit) {
      await delay(MOCK_LATENCY_MS);
      const index = tickers.findIndex((t) => t.id === tickerId);
      if (index === -1) throw new Error('Call introuvable');
      const before = tickers[index]!;
      const now = new Date().toISOString();
      // Les mêmes règles que la base : clôturer n'est pas corriger, et une
      // clôture est définitive (v1.01). Démo : la sortie est tenue pour
      // confirmée, faute de serveur pour relire le cours.
      if (exit && before.closedOn) throw new Error('Une clôture est définitive.');
      const next: Ticker = exit
        ? {
            ...before,
            ...exit,
            exitBtcPrice: before.assetClass === 'BTC' ? exit.exitPrice : exit.exitBtcPrice,
            currentPrice: exit.exitPrice,
            closedAt: now,
            exitConfirmedAt: now,
          }
        : {
            ...before,
            exitPrice: null,
            exitBtcPrice: null,
            closedOn: null,
            closedAt: null,
            editedAt: before.closedOn ? now : before.editedAt,
          };
      tickers[index] = next;
      return { ...next };
    },

    async setVote(tickerId, userId, vote) {
      await delay(MOCK_LATENCY_MS);
      // Les règles de `ticker_votes_guard`, pour que la démo se comporte
      // comme le serveur.
      const call = tickers.find((t) => t.id === tickerId);
      if (!call) throw new Error('Call introuvable');
      if (call.closedOn) throw new Error('Ce call est clôturé : les votes sont figés');
      if (Date.now() > Date.parse(call.votesCloseAt)) {
        throw new Error('Les votes sur ce call sont clos (72 h après sa publication)');
      }
      const index = votes.findIndex((v) => v.tickerId === tickerId && v.userId === userId);
      const previous = index >= 0 ? votes[index]! : null;
      const key = `${tickerId}:${userId}`;
      if (!vote) {
        // Retirer son vote : c'est son unique changement d'avis, et c'est final.
        if (!previous) return null;
        if (previous.changedAt) {
          throw new Error(
            'Vous avez déjà changé d’avis sur ce call : votre vote est définitif',
          );
        }
        votes.splice(index, 1);
        withdrawals.add(key);
        return null;
      }
      if (call.userId === userId) throw new Error('On ne vote pas sur son propre call');
      if (!previous && withdrawals.has(key)) {
        throw new Error('Vous avez retiré votre vote sur ce call : ce retrait est définitif');
      }
      const reason = vote.reason.trim();
      if (reason.length < 3)
        throw new Error('Un vote s’accompagne d’une phrase qui l’explique');
      const switching = previous !== null && previous.side !== vote.side;
      if (switching && previous.changedAt) {
        throw new Error('Un seul changement d’avis par call : votre vote est définitif');
      }
      const now = new Date().toISOString();
      const row: VoteRow = {
        tickerId,
        userId,
        side: vote.side,
        reason,
        createdAt: previous && !switching ? previous.createdAt : now,
        changedAt: switching ? now : (previous?.changedAt ?? null),
      };
      if (index >= 0) votes.splice(index, 1);
      votes.push(row);
      return { ...row };
    },
  };
}

const mockSource = createMockSource();

export function getCallsSource(): CallsSource {
  return supabase ? createSupabaseSource(supabase) : mockSource;
}
