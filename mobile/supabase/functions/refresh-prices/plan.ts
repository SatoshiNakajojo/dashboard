/**
 * Décide ce qui sera écrit en base — la seule partie du rafraîchissement où un
 * bug corromprait silencieusement des prix.
 *
 * Volontairement pur : ni Deno, ni réseau, ni client Supabase. C'est ce qui
 * permet de la tester depuis le lanceur de tests du projet.
 */

export interface PricedTicker {
  id: string;
  coingecko_id: string;
  current_price: number | null;
}

export interface PriceUpdate {
  id: string;
  price: number;
}

export interface RefreshPlan {
  updates: PriceUpdate[];
  /** Actifs laissés tels quels : absents de la réponse, ou prix inchangé. */
  skipped: number;
  /** Identifiants CoinGecko à demander, dédoublonnés. */
  ids: string[];
}

/** En deçà, on considère que le prix n'a pas bougé. */
const EPSILON = 1e-8;

/**
 * Un prix absent de la réponse **n'efface jamais** le prix connu : mieux vaut
 * un cours daté par `price_updated_at` qu'un cours effacé.
 *
 * Un prix inchangé n'est pas réécrit non plus : chaque `UPDATE` sur `tickers`
 * est diffusé en Realtime à tous les membres connectés.
 */
export function planUpdates(
  rows: readonly PricedTicker[],
  prices: Readonly<Record<string, number>>,
): RefreshPlan {
  const updates: PriceUpdate[] = [];
  let skipped = 0;

  for (const row of rows) {
    const price = prices[row.coingecko_id];

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

  return { updates, skipped, ids: [...new Set(rows.map((row) => row.coingecko_id))] };
}

/** Découpe en lots : CoinGecko tolère mal les très longues listes. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('La taille de lot doit être positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
