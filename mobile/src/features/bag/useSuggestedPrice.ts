import { useEffect, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { fetchCoinPrices } from '@/lib/coingecko';
import { providerFor, toYahooSymbol, type ExchangeKey } from '@/lib/quotes';
import { fetchStockQuote } from '@/lib/yahoo';
import type { AssetClass } from '@/theme/tokens';

export interface SuggestedPrice {
  /** Cours proposé comme prix d'entrée, en dollars. `null` si introuvable. */
  price: number | null;
  /** D'où il vient, pour le dire à l'écran. */
  source: 'btc' | 'yahoo' | 'coingecko' | null;
  /**
   * Le symbole réellement interrogé — `AI.PA`, pas `$AI`.
   *
   * Le composer l'affiche : c'est ce qui transforme une erreur de place en
   * erreur visible, avant publication plutôt qu'au premier relevé de perf.
   */
  symbol: string | null;
  loading: boolean;
}

/** Laisse le membre finir de taper avant d'interroger Yahoo. */
const DEBOUNCE_MS = 550;

/**
 * Cours proposé dans le composer.
 *
 * Pré-remplir un `$MSTR` au cours du bitcoin serait pire que ne rien
 * pré-remplir : le membre validerait un prix d'entrée faux sans le voir. On ne
 * propose donc un cours que lorsqu'on sait le chercher — le spot BTC pour un
 * call bitcoin, Yahoo pour une action ou un ETF — et rien du tout sinon.
 *
 * Un jeton, lui, se cote dès qu'on sait lequel c'est : `coingeckoId` — celui
 * choisi dans la liste, ou à défaut le mieux classé. Pas de recherche par
 * frappe ici : la liste du composer l'a déjà faite.
 *
 * `exchange` compte autant que le ticker : sans lui, `$AI` interroge C3.ai à
 * New York au lieu d'Air Liquide à Paris, et le prix proposé est celui d'une
 * autre société.
 */
export function useSuggestedPrice(
  assetClass: AssetClass,
  symbol: string,
  exchange?: ExchangeKey | null,
  coingeckoId?: string | null,
): SuggestedPrice {
  const { spot } = useBtcSpot();
  const [quote, setQuote] = useState<{ price: number; symbol: string } | null>(null);
  const [coin, setCoin] = useState<{ price: number; id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [coinLoading, setCoinLoading] = useState(false);

  const isStock = providerFor(assetClass) === 'yahoo';
  const yahooSymbol = isStock ? toYahooSymbol(symbol, exchange) : null;

  useEffect(() => {
    // Rien à demander : le rendu lit `quote?.symbol === yahooSymbol`, donc une
    // cotation périmée est déjà ignorée sans avoir à vider l'état ici.
    if (!yahooSymbol) return;

    const controller = new AbortController();
    let active = true;

    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await fetchStockQuote(yahooSymbol, controller.signal);
      if (!active || controller.signal.aborted) return;

      setQuote(result?.usd != null ? { price: result.usd, symbol: yahooSymbol } : null);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [yahooSymbol]);

  const coinId = !isStock && assetClass !== 'BTC' ? (coingeckoId ?? null) : null;

  useEffect(() => {
    if (!coinId) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setCoinLoading(true);
      const prices = await fetchCoinPrices([coinId], controller.signal);
      if (!active || controller.signal.aborted) return;
      const price = prices[coinId];
      setCoin(typeof price === 'number' && price > 0 ? { price, id: coinId } : null);
      setCoinLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [coinId]);

  if (assetClass === 'BTC') {
    return { price: spot.usd, source: 'btc', symbol: 'BTC', loading: false };
  }
  if (coinId) {
    return coin?.id === coinId
      ? { price: coin.price, source: 'coingecko', symbol: coinId, loading: coinLoading }
      : { price: null, source: null, symbol: coinId, loading: true };
  }
  if (isStock && quote?.symbol === yahooSymbol) {
    return { price: quote.price, source: 'yahoo', symbol: yahooSymbol, loading };
  }
  return { price: null, source: null, symbol: yahooSymbol, loading: isStock && loading };
}
