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
 * Les places de cotation proposées au composer, dans cet ordre.
 *
 * Yahoo suffixe tout ce qui n'est pas américain : `AI.PA` pour Air Liquide à
 * Paris, `AVIO.MI` pour Milan. Un titre américain n'a pas de suffixe — d'où le
 * suffixe vide en tête, qui est aussi le défaut.
 *
 * Sans cette information, `$AI` se fait coter comme C3.ai à New York : un autre
 * titre, un autre prix, et rien à l'écran pour le dire. C'est la raison d'être
 * de cette liste.
 */
export const EXCHANGES = [
  { key: 'us', label: 'US', suffix: '' },
  { key: 'paris', label: 'Paris', suffix: '.PA' },
  { key: 'amsterdam', label: 'Amsterdam', suffix: '.AS' },
  { key: 'bruxelles', label: 'Bruxelles', suffix: '.BR' },
  { key: 'francfort', label: 'Francfort', suffix: '.DE' },
  { key: 'milan', label: 'Milan', suffix: '.MI' },
  { key: 'madrid', label: 'Madrid', suffix: '.MC' },
  { key: 'londres', label: 'Londres', suffix: '.L' },
  { key: 'suisse', label: 'Suisse', suffix: '.SW' },
  { key: 'stockholm', label: 'Stockholm', suffix: '.ST' },
  { key: 'toronto', label: 'Toronto', suffix: '.TO' },
  { key: 'sydney', label: 'Sydney', suffix: '.AX' },
] as const;

export type ExchangeKey = (typeof EXCHANGES)[number]['key'];

/** La place par défaut : celle de `$MSTR`, `$COIN` et `$IBIT`. */
export const DEFAULT_EXCHANGE: ExchangeKey = 'us';

/**
 * Suffixes Yahoo, par nom de place.
 *
 * Dérivé de `EXCHANGES` pour qu'il n'y ait qu'une liste à tenir, plus les
 * quelques noms alternatifs qu'un membre peut écrire à la main.
 */
export const EXCHANGE_SUFFIX: Record<string, string> = {
  ...Object.fromEntries(EXCHANGES.map(({ key, suffix }) => [key, suffix])),
  xetra: '.DE',
  frankfurt: '.DE',
  london: '.L',
  zurich: '.SW',
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
