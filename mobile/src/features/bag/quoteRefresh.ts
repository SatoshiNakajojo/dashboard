/**
 * Quels cours redemander, et comment les recoller aux calls.
 *
 * À la publication, `current_price` est écrit **égal** au prix d'entrée : la
 * carte s'ouvre honnêtement à 0 %, sans perf inventée. La suite devait venir de
 * `refresh-prices`, une fonction Edge appelée par un planificateur — que
 * personne n'avait branché. Résultat : toutes les cartes restaient à 0 %, pour
 * toujours, et aucune erreur nulle part.
 *
 * L'app sait pourtant interroger les mêmes sources : elle affiche déjà le spot
 * BTC. Elle redemande donc les cours elle-même à l'ouverture de l'onglet. Le
 * rafraîchissement planifié garde son intérêt — il alimente la base pour qui
 * ouvre l'app hors ligne — mais il n'est plus la seule voie.
 *
 * Module pur : c'est le regroupement des demandes et le recollage qui ont des
 * cas limites, pas le réseau.
 */

import { providerFor } from '@/lib/quotes';
import type { Ticker } from '@/types/domain';

export interface QuoteTargets {
  /** Identifiants CoinGecko, dédupliqués — une seule requête pour tous. */
  coingeckoIds: string[];
  /** Symboles Yahoo, dédupliqués — une requête chacun, via la fonction Edge. */
  yahooSymbols: string[];
}

/** Cours frais, indexés par la clé qui a servi à les demander. */
export interface QuoteMap {
  coingecko: Readonly<Record<string, number>>;
  yahoo: Readonly<Record<string, number>>;
}

export const EMPTY_QUOTES: QuoteMap = { coingecko: {}, yahoo: {} };

/**
 * Ce qu'il faut demander pour cette liste de calls.
 *
 * Deux membres qui suivent `$BTC` ne font qu'une demande : CoinGecko facture à
 * la requête, pas à l'identifiant, et `/simple/price` en accepte plusieurs.
 *
 * Un call sans identifiant de cotation n'est pas une anomalie : les positions
 * closes n'en ont pas, et un call publié pendant une panne de résolution non
 * plus. On ne demande rien pour lui, et il garde le dernier cours connu.
 */
export function quoteTargets(tickers: readonly Ticker[]): QuoteTargets {
  const coingecko = new Set<string>();
  const yahoo = new Set<string>();

  for (const ticker of tickers) {
    if (providerFor(ticker.assetClass) === 'yahoo') {
      if (ticker.yahooSymbol) yahoo.add(ticker.yahooSymbol);
    } else if (ticker.coingeckoId) {
      coingecko.add(ticker.coingeckoId);
    }
  }

  return { coingeckoIds: [...coingecko], yahooSymbols: [...yahoo] };
}

/**
 * Le cours frais d'un call, ou `null` si on n'en a pas.
 *
 * `null` ne veut pas dire « inchangé » : l'appelant retombe alors sur ce que la
 * base connaît. Distinguer les deux évite qu'une panne CoinGecko efface un prix
 * déjà stocké.
 */
export function freshPrice(ticker: Ticker, quotes: QuoteMap): number | null {
  const key =
    providerFor(ticker.assetClass) === 'yahoo' ? ticker.yahooSymbol : ticker.coingeckoId;
  if (!key) return null;

  const table = providerFor(ticker.assetClass) === 'yahoo' ? quotes.yahoo : quotes.coingecko;
  const price = table[key];
  // Un cours à zéro ou négatif n'est pas un cours : il ferait afficher -100 %.
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Recolle les cours frais sur les calls.
 *
 * Renvoie la liste d'origine, à l'identique, quand rien n'a changé — l'appelant
 * la passe à des `useMemo`, et une nouvelle référence à chaque rendu relancerait
 * tous les calculs en aval pour rien.
 */
export function mergeQuotes(tickers: readonly Ticker[], quotes: QuoteMap): readonly Ticker[] {
  let changed = false;

  const merged = tickers.map((ticker) => {
    const price = freshPrice(ticker, quotes);
    if (price === null || price === ticker.currentPrice) return ticker;
    changed = true;
    return { ...ticker, currentPrice: price };
  });

  return changed ? merged : tickers;
}

/**
 * Le prix du BTC à inscrire au moment d'une publication.
 *
 * Sans lui, `vsBitcoinPercent` ne peut rien calculer et la carte affiche « — »
 * pour toujours : la valeur n'est jamais recalculable a posteriori, puisqu'elle
 * date de l'instant de l'entrée.
 *
 * Deux cas se distinguent, et les confondre est précisément ce qui laissait des
 * colonnes vides :
 *
 *   • un call **BTC est son propre référentiel** — le spot n'a pas à être
 *     demandé, c'est le prix d'entrée lui-même ;
 *   • pour tout le reste, il faut le spot. `null` seulement si on ne l'a
 *     vraiment pas : mieux vaut un « — » honnête qu'un chiffre inventé.
 */
export function entryBtcFor(
  assetClass: Ticker['assetClass'],
  entryPrice: number,
  btcSpot: number | null | undefined,
): number | null {
  if (assetClass === 'BTC')
    return Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : null;
  return typeof btcSpot === 'number' && Number.isFinite(btcSpot) && btcSpot > 0
    ? btcSpot
    : null;
}
