import { useEffect, useState } from 'react';

import { fetchCoinPrices } from '@/lib/coingecko';
import { fetchStockQuote } from '@/lib/yahoo';
import type { Ticker } from '@/types/domain';

import { EMPTY_QUOTES, quoteTargets, type QuoteMap } from './quoteRefresh';

/**
 * Les cours frais des calls affichés.
 *
 * Ce hook existe parce que le rafraîchissement planifié n'a jamais tourné chez
 * le club : `refresh-prices` demande un planificateur que personne n'avait
 * branché, et toutes les cartes affichaient donc 0 % — leur prix d'entrée,
 * écrit tel quel à la publication. Aucune erreur, aucune trace : juste des
 * chiffres faux.
 *
 * L'app interroge maintenant les mêmes sources elle-même. Elle sait déjà le
 * faire pour le bandeau BTC ; rien de nouveau, sinon qu'on le fait aussi pour
 * les calls.
 *
 * Il ne lève jamais et ne bloque rien : sans réponse, les cartes gardent le
 * dernier cours connu de la base.
 */
export function useLiveQuotes(tickers: readonly Ticker[]): QuoteMap {
  const [quotes, setQuotes] = useState<QuoteMap>(EMPTY_QUOTES);

  // La liste des cibles sert de dépendance : c'est elle qui décide s'il faut
  // redemander quelque chose. Deux rendus qui affichent les mêmes actifs ne
  // relancent aucune requête, même si les objets `Ticker` ont changé.
  const { coingeckoIds, yahooSymbols } = quoteTargets(tickers);
  const cgKey = coingeckoIds.join(',');
  const yhKey = yahooSymbols.join(',');

  useEffect(() => {
    const ids = cgKey ? cgKey.split(',') : [];
    const symbols = yhKey ? yhKey.split(',') : [];
    if (ids.length === 0 && symbols.length === 0) return;

    const controller = new AbortController();
    let active = true;

    (async () => {
      // Les deux fournisseurs en parallèle : Yahoo passe par une fonction Edge
      // et peut être lent, CoinGecko n'a pas à l'attendre.
      const [coingecko, yahooPairs] = await Promise.all([
        fetchCoinPrices(ids, controller.signal),
        // Une requête par symbole — Yahoo n'a pas d'équivalent groupé côté
        // fonction Edge, et le club a peu de calls actions.
        Promise.all(
          symbols.map(async (symbol) => {
            const quote = await fetchStockQuote(symbol, controller.signal);
            return [symbol, quote?.usd ?? null] as const;
          }),
        ),
      ]);

      if (!active) return;

      const yahoo: Record<string, number> = {};
      for (const [symbol, usd] of yahooPairs) {
        if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) yahoo[symbol] = usd;
      }

      setQuotes({ coingecko, yahoo });
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [cgKey, yhKey]);

  return quotes;
}
