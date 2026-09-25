/**
 * Décide ce qui sera écrit en base — la seule partie du rafraîchissement où un
 * bug corromprait silencieusement des prix.
 *
 * Volontairement pur : ni Deno, ni réseau, ni client Supabase. C'est ce qui
 * permet de la tester depuis le lanceur de tests du projet.
 */

export interface PricedTicker {
  id: string;
  /** Identifiant CoinGecko, pour les cryptos. */
  coingecko_id: string | null;
  /** Symbole Yahoo Finance, pour les actions et ETF. */
  yahoo_symbol: string | null;
  current_price: number | null;
  /** `BTC` : son propre référentiel. Absent des lignes d'avant la v1.01. */
  asset_class?: string | null;
  /**
   * `null` : le prix d'entrée envoyé par l'app est provisoire, et ce relevé
   * doit le remplacer par le cours du serveur (v1.01). Absent : confirmé.
   */
  entry_confirmed_at?: string | null;
}

/** Le prix d'entrée d'un call, confirmé au cours que le serveur vient de lire. */
export interface EntryConfirmation {
  id: string;
  entryPrice: number;
  /** Le cours du bitcoin au même instant — le référentiel « vs ₿ ». */
  entryBtcPrice: number;
}

/** L'identifiant CoinGecko du bitcoin, référentiel de toute entrée. */
export const BITCOIN_ID = 'bitcoin';

export interface PriceUpdate {
  id: string;
  price: number;
}

export interface RefreshPlan {
  updates: PriceUpdate[];
  /** Actifs laissés tels quels : sans cours frais, ou prix inchangé. */
  skipped: number;
}

/** Ce qu'il faut demander à chaque fournisseur. */
export interface QuoteRequests {
  coingecko: string[];
  yahoo: string[];
}

/** En deçà, on considère que le prix n'a pas bougé. */
const EPSILON = 1e-8;

/**
 * Regroupe les identifiants à demander, par fournisseur et dédoublonnés.
 *
 * Une ligne sans fournisseur — une action publiée avant que Yahoo ne soit
 * branché — n'est demandée à personne et gardera son prix.
 */
export function quoteRequests(rows: readonly PricedTicker[]): QuoteRequests {
  const coingecko = new Set<string>();
  const yahoo = new Set<string>();

  for (const row of rows) {
    if (row.coingecko_id) coingecko.add(row.coingecko_id);
    else if (row.yahoo_symbol) yahoo.add(row.yahoo_symbol);
    // Une entrée à confirmer a besoin du bitcoin du même instant.
    if (row.entry_confirmed_at === null && (row.coingecko_id || row.yahoo_symbol)) {
      coingecko.add(BITCOIN_ID);
    }
  }

  return { coingecko: [...coingecko].sort(), yahoo: [...yahoo].sort() };
}

/**
 * Les entrées à confirmer (v1.01), au cours que le serveur vient de lire.
 *
 * Un call se publie au prix que l'app affichait ; ce prix n'engage à rien tant
 * que le serveur ne l'a pas relu. Ici, il le relit : même fournisseur que le
 * suivi du cours, même instant pour le bitcoin. Sans cours frais — ou sans
 * bitcoin pour un call qui n'en est pas —, on attend le relevé suivant plutôt
 * que de confirmer un prix faux.
 */
export function planConfirmations(
  rows: readonly PricedTicker[],
  prices: {
    coingecko?: Readonly<Record<string, number>>;
    yahoo?: Readonly<Record<string, number>>;
  },
): EntryConfirmation[] {
  const valid = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  const btc = prices.coingecko?.[BITCOIN_ID];
  const out: EntryConfirmation[] = [];

  for (const row of rows) {
    if (row.entry_confirmed_at !== null) continue;
    const price = row.coingecko_id
      ? prices.coingecko?.[row.coingecko_id]
      : row.yahoo_symbol
        ? prices.yahoo?.[row.yahoo_symbol]
        : undefined;
    if (!valid(price)) continue;
    const entryBtcPrice = row.asset_class === 'BTC' ? price : btc;
    if (!valid(entryBtcPrice)) continue;
    out.push({ id: row.id, entryPrice: price, entryBtcPrice });
  }

  return out;
}

/**
 * Un prix absent des réponses **n'efface jamais** le prix connu : mieux vaut un
 * cours daté par `price_updated_at` qu'un cours effacé.
 *
 * Un prix inchangé n'est pas réécrit non plus : chaque `UPDATE` sur `tickers`
 * est diffusé en Realtime à tous les membres connectés.
 *
 * Les deux tables de prix sont fournies séparément plutôt que fusionnées : un
 * identifiant CoinGecko et un symbole Yahoo peuvent parfaitement se ressembler
 * (`ETH`), et les confondre donnerait un prix faux sans rien signaler.
 */
export function planUpdates(
  rows: readonly PricedTicker[],
  prices: {
    coingecko?: Readonly<Record<string, number>>;
    yahoo?: Readonly<Record<string, number>>;
  },
): RefreshPlan {
  const updates: PriceUpdate[] = [];
  let skipped = 0;

  for (const row of rows) {
    const price = row.coingecko_id
      ? prices.coingecko?.[row.coingecko_id]
      : row.yahoo_symbol
        ? prices.yahoo?.[row.yahoo_symbol]
        : undefined;

    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      skipped += 1;
      continue;
    }
    if (row.current_price !== null && Math.abs(row.current_price - price) < EPSILON) {
      skipped += 1;
      continue;
    }

    updates.push({ id: row.id, price });
  }

  return { updates, skipped };
}

/** Découpe en lots : CoinGecko tolère mal les très longues listes. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('La taille de lot doit être positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
