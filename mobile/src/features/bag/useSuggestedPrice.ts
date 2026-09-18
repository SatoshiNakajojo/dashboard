import { useEffect, useState } from 'react';

import { useBtcSpot } from '@/hooks/useBtcMarket';
import { providerFor, toYahooSymbol } from '@/lib/quotes';
import { fetchStockQuote } from '@/lib/yahoo';
import type { AssetClass } from '@/theme/tokens';

export interface SuggestedPrice {
  /** Cours proposé comme prix d'entrée, en dollars. `null` si introuvable. */
  price: number | null;
  /** D'où il vient, pour le dire à l'écran. */
  source: 'btc' | 'yahoo' | null;
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
 * Les alts ne sont pas couverts : résoudre un symbole CoinGecko demande un
 * aller-retour de recherche par frappe, ce qui épuiserait le quota. Ils sont
 * résolus à la publication, une seule fois.
 */
export function useSuggestedPrice(assetClass: AssetClass, symbol: string): SuggestedPrice {
  const { spot } = useBtcSpot();
  const [quote, setQuote] = useState<{ price: number; symbol: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const isStock = providerFor(assetClass) === 'yahoo';
  const yahooSymbol = isStock ? toYahooSymbol(symbol) : null;

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

  if (assetClass === 'BTC') {
    return { price: spot.usd, source: 'btc', loading: false };
  }
  if (isStock && quote?.symbol === yahooSymbol) {
    return { price: quote.price, source: 'yahoo', loading };
  }
  return { price: null, source: null, loading: isStock && loading };
}
