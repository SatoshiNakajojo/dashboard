/**
 * Accès Yahoo Finance — cotations des actions et ETF.
 *
 * Même contrat que `coingecko.ts` : cache à TTL, retry exponentiel,
 * `AbortController`, et repli silencieux sur la dernière valeur connue.
 *
 * ## Pourquoi pas de proxy CORS ici
 *
 * Le dashboard JCGI passe par `api.allorigins.win` / `corsproxy.io` parce que
 * c'est une page de navigateur et que Yahoo ne pose pas d'en-tête CORS. Une
 * application React Native n'a pas de politique d'origine : elle appelle Yahoo
 * directement, sans tiers dans le chemin des données.
 *
 * La build web fait exception et échouera sur CORS. Ce n'est pas grave : sur le
 * web les prix viennent de la base, alimentée par la fonction Edge — qui, étant
 * serveur, n'a pas ce problème non plus. Seule la pré-saisie du composer perd
 * sa suggestion, et le membre tape le prix.
 */

import { Platform } from 'react-native';

import { withCache } from './cache';
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
 * Cotation prête à l'emploi, convertie en dollars.
 *
 * Sur le web, renvoie `null` sans tenter l'appel : la requête serait bloquée
 * par CORS et l'échec coûterait trois tentatives et huit secondes.
 */
export async function fetchStockQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote | null> {
  if (Platform.OS === 'web') return null;

  try {
    const quote = await fetchYahooQuote(symbol, signal);
    const rates = await fetchRates(neededRates([quote]), signal);
    return { ...quote, usd: toUsd(quote, rates) };
  } catch {
    return null;
  }
}
