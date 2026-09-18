/**
 * Accès Yahoo Finance — cotations des actions et ETF.
 *
 * Même contrat que `coingecko.ts` : cache à TTL, retry exponentiel,
 * `AbortController`, et repli silencieux sur la dernière valeur connue.
 *
 * ## Deux chemins, selon la plateforme
 *
 * Yahoo ne pose pas d'en-tête CORS. Sur iOS et Android, aucune importance : une
 * app native n'a pas de politique d'origine et appelle Yahoo directement.
 *
 * Dans la PWA, le navigateur refuserait la réponse. On passe alors par la
 * fonction Edge `quote`, hébergée sur le projet Supabase du club — plutôt que
 * par un proxy public anonyme comme le fait le dashboard JCGI. Pas de tiers
 * dans le chemin des données, et une seule autorité à qui faire confiance.
 *
 * Sans Supabase configuré, la PWA n'a pas de relais : elle ne propose alors
 * aucun cours, et le membre saisit son prix d'entrée.
 */

import { Platform } from 'react-native';

import { withCache } from './cache';
import { supabase } from './supabase';
import { getJson } from './http';
import { fxSymbol } from './quotes';
import {
  neededRates,
  parseYahooQuote,
  toUsd,
  type YahooChartResponse,
  type YahooQuote,
} from './yahooParse';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** TTL d'une cotation. Une action bouge moins vite qu'un jeton. */
const QUOTE_TTL_MS = 120_000;
/** TTL d'un taux de change : une paire majeure ne dérive pas en une minute. */
const FX_TTL_MS = 15 * 60_000;

/**
 * Yahoo renvoie 403 aux clients sans `User-Agent` crédible — la cause la plus
 * fréquente d'un échec autrement inexplicable.
 */
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

function chartUrl(symbol: string, range = '5d'): string {
  return `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
}

export interface StockQuote extends YahooQuote {
  /** Prix converti en dollars. `null` si le taux de change manque. */
  usd: number | null;
  /** Vrai si la valeur vient du cache alors que le réseau a échoué. */
  stale: boolean;
}

/** Cotation brute, dans sa devise de cotation. */
export async function fetchYahooQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<YahooQuote & { stale: boolean }> {
  const result = await withCache(`yahoo.quote.${symbol}`, QUOTE_TTL_MS, async () => {
    const payload = await getJson<YahooChartResponse>(chartUrl(symbol), {
      signal,
      headers: HEADERS,
    });
    return parseYahooQuote(payload);
  });

  return { ...result.value, stale: result.stale };
}

/** Taux de change vers le dollar, pour une liste de devises. */
export async function fetchRates(
  currencies: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const rates: Record<string, number> = {};

  await Promise.all(
    currencies.map(async (currency) => {
      try {
        const result = await withCache(`yahoo.fx.${currency}`, FX_TTL_MS, async () => {
          const payload = await getJson<YahooChartResponse>(chartUrl(fxSymbol(currency), '1d'), {
            signal,
            attempts: 2,
            headers: HEADERS,
          });
          return parseYahooQuote(payload).price;
        });
        rates[currency.toUpperCase()] = result.value;
      } catch {
        // Un taux manquant laisse `toUsd` renvoyer `null` : on préfère ne pas
        // afficher de prix qu'en afficher un faux.
      }
    }),
  );

  return rates;
}

/**
 * Relais Supabase, utilisé par la PWA. `null` si le backend n'est pas configuré.
 *
 * L'annulation est portée par le `signal` passé à `invoke` : `functions-js`
 * l'accepte et coupe la requête si le membre change de ticker entre-temps.
 */
async function fetchViaEdge(symbol: string, signal?: AbortSignal): Promise<StockQuote | null> {
  const client = supabase;
  if (!client) return null;

  const { data, error } = await client.functions.invoke<{
    price?: number;
    currency?: string;
    changePercent?: number | null;
    usd?: number | null;
    symbol?: string;
    error?: string;
  }>(`quote?symbol=${encodeURIComponent(symbol)}`, { method: 'GET', signal });

  if (error || !data || data.error || typeof data.price !== 'number') return null;

  return {
    price: data.price,
    currency: data.currency ?? 'USD',
    changePercent: data.changePercent ?? null,
    symbol: data.symbol ?? symbol,
    usd: data.usd ?? null,
    stale: false,
  };
}

/**
 * Cotation prête à l'emploi, convertie en dollars.
 *
 * Ne lève jamais : une suggestion de prix absente est un désagrément, pas une
 * panne — le membre saisit son prix.
 */
export async function fetchStockQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote | null> {
  // Dans un navigateur, l'appel direct serait bloqué par CORS : on passe par
  // la fonction Edge, qui est un serveur.
  if (Platform.OS === 'web') {
    try {
      return await fetchViaEdge(symbol, signal);
    } catch {
      return null;
    }
  }

  try {
    const quote = await fetchYahooQuote(symbol, signal);
    const rates = await fetchRates(neededRates([quote]), signal);
    return { ...quote, usd: toUsd(quote, rates) };
  } catch {
    return null;
  }
}
