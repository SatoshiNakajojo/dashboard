import { useEffect, useState } from 'react';

import { searchCoins } from '@/lib/coingecko';
import { normalizeTicker, type CoinMatch } from '@/lib/coinSearch';
import { providerFor } from '@/lib/quotes';
import type { AssetClass } from '@/theme/tokens';

export interface CoinSearch {
  matches: CoinMatch[];
  loading: boolean;
  /** `true` quand la recherche a abouti et n'a rien trouvé. */
  empty: boolean;
}

/** Laisse le membre finir de taper — même cadence que la suggestion de prix. */
const DEBOUNCE_MS = 450;

/** En dessous, toute recherche rapporterait la moitié du marché. */
const MIN_LENGTH = 2;

const IDLE: CoinSearch = { matches: [], loading: false, empty: false };

/**
 * Jetons proposés pendant la saisie du ticker.
 *
 * Ne concerne que les cryptos hors bitcoin : `$BTC` n'a pas d'homonyme, et une
 * action relève de Yahoo, où c'est la place de cotation qui lève l'ambiguïté.
 *
 * L'intérêt n'est pas le confort de frappe. Sans ce choix, un alt dont le
 * ticker ne correspond exactement à aucun jeton est publié **sans
 * fournisseur** : sa carte reste figée au prix d'entrée, indéfiniment, sans que
 * rien ne l'explique. Ici, le membre le voit avant de publier.
 */
export function useCoinSearch(assetClass: AssetClass, symbol: string): CoinSearch {
  const [state, setState] = useState<{ query: string; matches: CoinMatch[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const applies = providerFor(assetClass) === 'coingecko' && assetClass !== 'BTC';
  const query = applies ? normalizeTicker(symbol) : '';
  const active = query.length >= MIN_LENGTH;

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    let alive = true;

    const timer = setTimeout(async () => {
      setLoading(true);
      const matches = await searchCoins(query, controller.signal);
      if (!alive || controller.signal.aborted) return;
      // La requête est identifiée par sa propre clé : le rendu compare
      // `state.query` à `query`, donc un résultat périmé est ignoré sans qu'on
      // ait à vider l'état ici.
      setState({ query, matches });
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  if (!active) return IDLE;
  if (state?.query !== query) return { matches: [], loading: true, empty: false };
  return { matches: state.matches, loading, empty: state.matches.length === 0 };
}
