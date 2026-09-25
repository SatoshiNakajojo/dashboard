/**
 * Le cours live d'un actif, au moment de publier un call (v1.01).
 *
 * Un call se publie au prix du marché, jamais à un prix saisi : sinon on
 * attendrait de voir un actif monter pour publier « le call d'il y a deux
 * semaines » à son prix d'alors. Le composer affiche ce cours sans le laisser
 * modifier, et la publication le relit ici, frais.
 *
 * Ce n'est qu'un prix provisoire : `refresh-prices` le remplace, au relevé
 * suivant, par le cours que le serveur lit lui-même — une app bricolée ne
 * choisit donc pas son prix non plus (`20261002090000_live_entry_price`).
 */

import { fetchBtcSpot, fetchCoinPrices } from '@/lib/coingecko';
import { fetchStockQuote } from '@/lib/yahoo';
import type { AssetClass } from '@/theme/tokens';

export interface LiveTarget {
  assetClass: AssetClass;
  /** Symbole Yahoo, pour une action ou un ETF. */
  yahooSymbol: string | null;
  /** Identifiant CoinGecko, pour un jeton. */
  coingeckoId: string | null;
}

/** Un prix exploitable, ou `null`. */
export function usablePrice(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Au-delà, on renonce : mieux vaut un message qu'un bouton bloqué. */
export const LIVE_PRICE_TIMEOUT_MS = 8_000;

/** Le cours de cet instant, en dollars ; `null` s'il est introuvable à temps. */
export async function fetchLivePrice(target: LiveTarget): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_PRICE_TIMEOUT_MS);
  const signal = controller.signal;
  const timeout = new Promise<null>((resolve) =>
    signal.addEventListener('abort', () => resolve(null)),
  );
  try {
    return await Promise.race([read(target, signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function read(target: LiveTarget, signal: AbortSignal): Promise<number | null> {
  try {
    if (target.assetClass === 'BTC') {
      return usablePrice((await fetchBtcSpot(signal)).usd);
    }
    if (target.yahooSymbol) {
      return usablePrice((await fetchStockQuote(target.yahooSymbol, signal))?.usd);
    }
    if (target.coingeckoId) {
      return usablePrice(
        (await fetchCoinPrices([target.coingeckoId], signal))[target.coingeckoId],
      );
    }
  } catch {
    // Réseau absent, fournisseur en panne : on ne publie pas sans cours.
  }
  return null;
}
