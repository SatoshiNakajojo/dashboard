/**
 * Lecture d'une réponse Yahoo Finance `v8/finance/chart`.
 *
 * Module pur : ni réseau, ni cache, ni Deno. L'application mobile et la
 * fonction Edge l'utilisent toutes deux, ce qui garantit qu'un prix lu à
 * l'écran et un prix écrit en base sortent du même code.
 *
 * La stratégie d'extraction reprend celle du dashboard JCGI : le prix « live »
 * de `meta.regularMarketPrice` quand il existe, sinon la dernière clôture non
 * nulle. Un marché fermé ne renvoie pas toujours de prix live, mais la clôture
 * de la veille reste la bonne réponse.
 */

export interface YahooQuote {
  /** Prix dans la devise de cotation. */
  price: number;
  /** Devise de cotation — `USD`, `EUR`, `GBp`… */
  currency: string;
  /** Variation sur la séance, en %. `null` si Yahoo ne la donne pas. */
  changePercent: number | null;
  /** Symbole tel que Yahoo le renvoie, qui peut différer de celui demandé. */
  symbol: string | null;
}

/** Forme de la réponse, réduite à ce qu'on lit. */
export interface YahooChartResponse {
  chart?: {
    result?:
      | {
          meta?: {
            symbol?: string;
            currency?: string;
            regularMarketPrice?: number | null;
            chartPreviousClose?: number | null;
            previousClose?: number | null;
          };
          indicators?: {
            quote?: { close?: (number | null)[] | null }[] | null;
          } | null;
        }[]
      | null;
    error?: { code?: string; description?: string } | null;
  };
}

export class YahooError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YahooError';
  }
}

function isUsablePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Extrait la cotation, ou lève.
 *
 * Lève plutôt que de renvoyer `null` : l'appelant distingue ainsi « Yahoo ne
 * connaît pas ce symbole » d'un prix légitimement absent, et peut retomber sur
 * le dernier prix connu plutôt que d'en effacer un.
 */
export function parseYahooQuote(payload: YahooChartResponse): YahooQuote {
  if (payload?.chart?.error) {
    const { code, description } = payload.chart.error;
    throw new YahooError(description ?? code ?? 'Erreur Yahoo inconnue');
  }

  const result = payload?.chart?.result?.[0];
  if (!result) throw new YahooError('Réponse Yahoo sans résultat');

  const meta = result.meta ?? {};

  // Le prix de séance d'abord ; à défaut la dernière clôture connue, comme le
  // fait le dashboard JCGI — un marché fermé n'a pas toujours de prix live.
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(isUsablePrice);
  const lastClose = closes.length > 0 ? closes[closes.length - 1]! : null;
  const price = isUsablePrice(meta.regularMarketPrice) ? meta.regularMarketPrice : lastClose;

  if (!isUsablePrice(price)) throw new YahooError('Aucun prix exploitable dans la réponse');

  const previous = isUsablePrice(meta.chartPreviousClose)
    ? meta.chartPreviousClose
    : isUsablePrice(meta.previousClose)
      ? meta.previousClose
      : null;

  return {
    price,
    // Sans devise déclarée on suppose le dollar : c'est le cas de toutes les
    // places américaines, et l'inverse — supposer l'euro — fausserait tout.
    currency: (meta.currency ?? 'USD').trim() || 'USD',
    changePercent: previous === null ? null : ((price - previous) / previous) * 100,
    symbol: meta.symbol ?? null,
  };
}

/**
 * Ramène une cotation en dollars.
 *
 * `GBp` (pence) est le piège classique de Londres : Yahoo y cote en centièmes
 * de livre, et l'oublier multiplie une position par cent.
 */
export function toUsd(quote: YahooQuote, rates: Readonly<Record<string, number>>): number | null {
  const currency = quote.currency.toUpperCase();

  if (currency === 'USD') return quote.price;

  if (quote.currency === 'GBp' || currency === 'GBX') {
    const gbp = rates.GBP;
    return typeof gbp === 'number' && gbp > 0 ? (quote.price / 100) * gbp : null;
  }

  const rate = rates[currency];
  return typeof rate === 'number' && rate > 0 ? quote.price * rate : null;
}

/** Devises à convertir, dédoublonnées, pour un lot de cotations. */
export function neededRates(quotes: readonly YahooQuote[]): string[] {
  const out = new Set<string>();
  for (const quote of quotes) {
    const currency = quote.currency.toUpperCase();
    if (currency === 'USD') continue;
    out.add(quote.currency === 'GBp' || currency === 'GBX' ? 'GBP' : currency);
  }
  return [...out].sort();
}
