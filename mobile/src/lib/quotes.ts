/**
 * Qui cote quoi.
 *
 * Deux fournisseurs, un seul critère : la classe d'actif. CoinGecko ne connaît
 * pas `$MSTR` ; Yahoo ne cote pas correctement les jetons illiquides. Le
 * routage est une fonction pure, testée, plutôt qu'une suite de `if` répartis
 * dans les appelants.
 */

import type { AssetClass } from '@/theme/tokens';

export type QuoteProvider = 'coingecko' | 'yahoo';

/**
 * `BTC`, `ALT` et `DEGEN` sont des cryptos : CoinGecko.
 * `ACTION` et `ETF` sont des titres : Yahoo Finance, comme le dashboard JCGI.
 */
export function providerFor(assetClass: AssetClass): QuoteProvider {
  return assetClass === 'ACTION' || assetClass === 'ETF' ? 'yahoo' : 'coingecko';
}

/**
 * Suffixes Yahoo des places où le club a des positions.
 *
 * Yahoo suffixe tout ce qui n'est pas américain : `AI.PA` pour Air Liquide à
 * Paris, `AVIO.MI` pour Milan. Un titre américain n'a pas de suffixe.
 */
export const EXCHANGE_SUFFIX: Record<string, string> = {
  paris: '.PA',
  amsterdam: '.AS',
  bruxelles: '.BR',
  milan: '.MI',
  francfort: '.DE',
  xetra: '.DE',
  madrid: '.MC',
  londres: '.L',
  suisse: '.SW',
  stockholm: '.ST',
  toronto: '.TO',
};

/**
 * Symbole du club (`$MSTR`) vers symbole Yahoo (`MSTR`).
 *
 * Le `$` est une convention d'affichage du club, pas une partie du ticker. Un
 * suffixe de place déjà présent est conservé tel quel : `$AI.PA` reste `AI.PA`.
 */
export function toYahooSymbol(clubSymbol: string, exchange?: string | null): string | null {
  const bare = clubSymbol.trim().replace(/^\$/, '').toUpperCase();
  if (!bare) return null;

  // Un suffixe déjà écrit fait foi — on ne le remplace pas.
  if (bare.includes('.')) return bare;

  const suffix = exchange ? EXCHANGE_SUFFIX[exchange.trim().toLowerCase()] : undefined;
  return suffix ? `${bare}${suffix}` : bare;
}

/** Paire Yahoo d'un taux de change vers le dollar : `EUR` → `EURUSD=X`. */
export function fxSymbol(currency: string): string {
  return `${currency.trim().toUpperCase()}USD=X`;
}
