/**
 * Source de données du Bag — calls et votes.
 *
 * Même contrat que `features/potluck/source.ts` : une interface, deux
 * implémentations. Le magasin mock est mutable et vit à l'échelle du module,
 * pour qu'un call publié survive à un changement d'onglet.
 */

import { supabase } from '@/lib/supabase';
import { MOCK_MY_VOTES, MOCK_TICKERS, MOCK_VOTES } from '@/mocks/calls';
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
  /** Jour de l'entrée, `AAAA-MM-JJ`. */
  enteredOn: string;
}

/**
 * Ce qu'un auteur peut corriger sur son call.
 *
 * Pas le titre, ni la classe : changer de titre, c'est un autre call. La base
 * le refuse aussi (`tickers_freeze_call`).
 */
export interface CallPatch {
  entryPrice: number;
  /** Recalculé seulement si le jour d'entrée change ; sinon on renvoie l'ancien. */
  entryBtcPrice: number | null;
  enteredOn: string;
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
}

export interface CallsSource {
  list(signal?: AbortSignal): Promise<Ticker[]>;
  listVotes(signal?: AbortSignal): Promise<VoteRow[]>;
  /** Publie un call. Le ticker renvoyé porte l'identifiant définitif. */
  publish(draft: CallDraftInput, userId: string): Promise<Ticker>;
  /** `null` retire le vote. */
  setVote(tickerId: string, userId: string, side: Vote | null): Promise<void>;
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

const COLUMNS =
  'id, user_id, symbol, asset_class, entry_price, current_price, entry_btc_price, size_usd, thesis, coingecko_id, yahoo_symbol, price_updated_at, created_at, entered_on, edited_at, exit_price, exit_btc_price, closed_on, closed_at';

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
  };
}

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
      let query = client.from('ticker_votes').select('ticker_id, user_id, side');
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => ({
        tickerId: row.ticker_id,
        userId: row.user_id,
        side: row.side,
      }));
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
        .update({
          entry_price: patch.entryPrice,
          entry_btc_price: patch.entryBtcPrice,
          entered_on: patch.enteredOn,
          thesis: patch.thesis,
        })
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

    async setVote(tickerId, userId, side) {
      const { error } = side
        ? await client
            .from('ticker_votes')
            .upsert(
              { ticker_id: tickerId, user_id: userId, side },
              { onConflict: 'ticker_id,user_id' },
            )
        : await client
            .from('ticker_votes')
            .delete()
            .eq('ticker_id', tickerId)
            .eq('user_id', userId);

      if (error) throw error;
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

  // Les fixtures donnent des totaux ; on les redéploie en lignes de vote pour
  // que le mock et le serveur exposent exactement la même forme.
  const votes: VoteRow[] = [];
  for (const [tickerId, tally] of Object.entries(MOCK_VOTES)) {
    const mine = MOCK_MY_VOTES[tickerId];
    for (let i = 0; i < tally.bull; i++) {
      votes.push({ tickerId, userId: `mock-bull-${tickerId}-${i}`, side: 'bull' });
    }
    for (let i = 0; i < tally.bear; i++) {
      votes.push({ tickerId, userId: `mock-bear-${tickerId}-${i}`, side: 'bear' });
    }
    // La dernière voix du bon côté devient la mienne : le total ne bouge pas,
    // et le bouton s'affiche déjà sélectionné comme dans le prototype.
    if (mine) {
      const last = votes.filter((v) => v.tickerId === tickerId && v.side === mine).pop();
      if (last) last.userId = MOCK_CURRENT_USER_ID;
    }
  }

  return {
    async list() {
      await delay(MOCK_LATENCY_MS);
      return tickers.map((t) => ({ ...t }));
    },

    async listVotes() {
      await delay(MOCK_LATENCY_MS);
      return votes.map((v) => ({ ...v }));
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
      };
      tickers.unshift(ticker);
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
      // Les mêmes règles que `tickers_freeze_call` : clôturer n'est pas
      // corriger ; corriger une sortie ou rouvrir, si.
      const next: Ticker = exit
        ? {
            ...before,
            ...exit,
            exitBtcPrice: before.assetClass === 'BTC' ? exit.exitPrice : exit.exitBtcPrice,
            currentPrice: exit.exitPrice,
            closedAt: before.closedAt ?? now,
            editedAt: before.closedOn ? now : before.editedAt,
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

    async setVote(tickerId, userId, side) {
      await delay(MOCK_LATENCY_MS);
      const index = votes.findIndex((v) => v.tickerId === tickerId && v.userId === userId);
      if (index >= 0) votes.splice(index, 1);
      if (side) votes.push({ tickerId, userId, side });
    },
  };
}

const mockSource = createMockSource();

export function getCallsSource(): CallsSource {
  return supabase ? createSupabaseSource(supabase) : mockSource;
}
