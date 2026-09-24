/**
 * Types de la base — miroir de `supabase/migrations/*_init.sql`.
 *
 * En production, régénérer plutôt que d'éditer à la main :
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 * Le fichier est écrit ici pour que l'app typecheck avant même qu'un projet
 * Supabase existe.
 */

export type AssetClassRow = 'BTC' | 'ALT' | 'ACTION' | 'ETF' | 'DEGEN';
export type VoteSide = 'bull' | 'bear';

export type ProfileRow = {
  id: string;
  display_name: string;
  initials: string;
  color: string;
  /** Photo de profil, dans le bucket `avatars`. */
  avatar_url: string | null;
  /** `[{"label":"GitHub","url":"https://…"}]` — relu par `parseLinks`. */
  links: unknown;
  created_at: string;
};

export type EventRow = {
  id: string;
  starts_at: string;
  title: string;
  location: string;
  /** Crypto Night, Stock Night… une soirée peut en porter plusieurs. */
  themes: string[];
  created_by: string;
  created_at: string;
};

export type EventAttendeeRow = {
  event_id: string;
  user_id: string;
  created_at: string;
};

export type PotluckItemRow = {
  id: string;
  event_id: string;
  item_name: string;
  assigned_user_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TickerRow = {
  id: string;
  user_id: string;
  symbol: string;
  asset_class: AssetClassRow;
  entry_price: number;
  current_price: number | null;
  entry_btc_price: number | null;
  size_usd: number | null;
  thesis: string;
  coingecko_id: string | null;
  yahoo_symbol: string | null;
  price_updated_at: string | null;
  created_at: string;
  /** Jour de l'entrée (`AAAA-MM-JJ`). */
  entered_on: string | null;
  /** Posée par le déclencheur `tickers_freeze`, jamais par le client. */
  edited_at: string | null;
  /** La sortie : les trois ensemble, ou aucune (`tickers_exit_complete`). */
  exit_price: number | null;
  exit_btc_price: number | null;
  closed_on: string | null;
  /** Posée par le déclencheur `tickers_freeze`, jamais par le client. */
  closed_at: string | null;
  /** Colonne générée : jamais écrite par le client. */
  performance_percentage: number | null;
};

export type TickerVoteRow = {
  ticker_id: string;
  user_id: string;
  side: VoteSide;
  created_at: string;
};

export type PredictionRow = {
  id: string;
  user_id: string;
  /** Ancienne saison de 90 jours. `null` pour les paris ouverts depuis. */
  season: string | null;
  /** `1w`, `3m`, `6m`, `12m`, `5y`, `10y` — voir `src/lib/horizons.ts`. */
  horizon: string;
  /** Couples `[jour depuis l'ouverture, prix en dollars]`. */
  path_data: [number, number][];
  /** Les trois instants du calendrier, fixés par la base à l'insertion. */
  opened_at: string;
  locked_at: string;
  resolves_at: string;
  hash: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Les lignes sont des **alias de type**, jamais des interfaces : une interface
 * n'obtient pas de signature d'index implicite et ne satisfait donc pas
 * `Record<string, unknown>`, la contrainte que `GenericSchema` impose à
 * `createClient`. C'est aussi pour cela que les types générés par la CLI
 * Supabase n'utilisent que des `type`.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      events: Table<EventRow>;
      event_attendees: Table<EventAttendeeRow>;
      potluck_items: Table<PotluckItemRow>;
      tickers: Table<TickerRow, Omit<Partial<TickerRow>, 'performance_percentage'>>;
      ticker_votes: Table<TickerVoteRow>;
      predictions: Table<PredictionRow>;
    };
    Views: Record<never, never>;
    Functions: {
      is_member: { Args: Record<string, never>; Returns: boolean };
      is_valid_path: { Args: { path: unknown }; Returns: boolean };
      is_valid_price_path: { Args: { path: unknown }; Returns: boolean };
      taken_profile_colors: { Args: Record<string, never>; Returns: string[] };
    };
    Enums: {
      asset_class: AssetClassRow;
      vote_side: VoteSide;
    };
    CompositeTypes: Record<never, never>;
  };
};
