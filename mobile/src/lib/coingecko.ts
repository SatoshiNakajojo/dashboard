/**
 * Accès CoinGecko — README §9.
 *
 * Contrat de ce module : **il ne lève jamais pour une panne réseau** dès lors
 * qu'une valeur a déjà été vue. Il renvoie la dernière connue avec
 * `stale: true`, et l'UI bascule sur `HORS LIGNE`. Un écran d'erreur bloquant
 * est un bug, pas un cas limite.
 */

import { getJson } from './http';
import { withCache } from './cache';
import { MOCK_TODAY_INDEX } from '@/mocks/oracle';
import type { BtcSpot, MarketPoint } from '@/types/domain';
import { DAYS } from './chart';

const BASE = 'https://api.coingecko.com/api/v3';

/** TTL du spot : 60 s (README §9). */
const SPOT_TTL_MS = 60_000;
/** TTL de l'historique : 6 h. */
const HISTORY_TTL_MS = 6 * 3_600_000;

/**
 * Clé API optionnelle (plan Demo). Sans elle l'API publique reste utilisable,
 * avec un quota plus bas — d'où le cache et le repli.
 */
const API_KEY = process.env.EXPO_PUBLIC_COINGECKO_API_KEY;

function url(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  if (API_KEY) query.set('x_cg_demo_api_key', API_KEY);
  return `${BASE}${path}?${query.toString()}`;
}

interface SimplePriceResponse {
  bitcoin?: { usd?: number; usd_24h_change?: number };
}

/** Cours spot du BTC, pour le bandeau : prix + variation 24 h. */
export async function fetchBtcSpot(signal?: AbortSignal): Promise<BtcSpot> {
  const result = await withCache('coingecko.btc.spot', SPOT_TTL_MS, async () => {
    const payload = await getJson<SimplePriceResponse>(
      url('/simple/price', {
        ids: 'bitcoin',
        vs_currencies: 'usd',
        include_24hr_change: 'true',
      }),
      { signal },
    );
    const usd = payload.bitcoin?.usd;
    if (typeof usd !== 'number' || !Number.isFinite(usd)) {
      throw new Error('Réponse CoinGecko inexploitable : prix BTC absent');
    }
    return { usd, change24h: payload.bitcoin?.usd_24h_change ?? 0 };
  });

  return {
    usd: result.value.usd,
    change24h: result.value.change24h,
    fetchedAt: result.storedAt,
    stale: result.stale,
  };
}

interface MarketChartResponse {
  prices?: [timestampMs: number, price: number][];
}

export interface BtcHistory {
  points: MarketPoint[];
  stale: boolean;
}

/**
 * Historique 90 jours, projeté dans le repère de l'Oracle.
 *
 * CoinGecko renvoie des couples `[timestamp, prix]` ; on les convertit en
 * `{ day, price }` où `day` est l'index dans la fenêtre de 90 jours, puis on
 * tronque au jour courant — la courbe réelle s'arrête à aujourd'hui.
 */
export async function fetchBtcHistory(signal?: AbortSignal): Promise<BtcHistory> {
  const result = await withCache('coingecko.btc.history90', HISTORY_TTL_MS, async () => {
    const payload = await getJson<MarketChartResponse>(
      url('/coins/bitcoin/market_chart', {
        vs_currency: 'usd',
        days: String(DAYS),
        interval: 'daily',
      }),
      { signal, timeoutMs: 12_000 },
    );

    const prices = payload.prices ?? [];
    if (prices.length === 0) {
      throw new Error('Réponse CoinGecko inexploitable : historique vide');
    }

    const firstTs = prices[0]![0];
    return prices.map(([timestamp, price]) => ({
      day: Math.round((timestamp - firstTs) / 86_400_000),
      price,
    }));
  });

  const points = result.value
    .filter((p) => p.day >= 0 && p.day <= DAYS && Number.isFinite(p.price))
    .sort((a, b) => a.day - b.day);

  return { points, stale: result.stale };
}

/**
 * Hauteur de bloc — purement décorative, hors CoinGecko (mempool.space).
 * Renvoie `null` en cas d'échec : le bandeau masque alors la mention.
 */
export async function fetchBlockHeight(signal?: AbortSignal): Promise<number | null> {
  try {
    const result = await withCache('mempool.tip', 5 * 60_000, async () => {
      const height = await getJson<number>('https://mempool.space/api/blocks/tip/height', {
        signal,
        attempts: 2,
      });
      if (typeof height !== 'number' || !Number.isFinite(height)) {
        throw new Error('Hauteur de bloc inexploitable');
      }
      return height;
    });
    return result.value;
  } catch {
    return null;
  }
}

interface SearchResponse {
  coins?: { id: string; symbol: string; market_cap_rank: number | null }[];
}

/**
 * Résout un ticker (`$ETH`) vers un identifiant CoinGecko (`ethereum`).
 *
 * Renvoie `null` quand l'actif n'y est pas coté — le cas normal pour une action
 * ou un ETF. Le call est alors publié sans identifiant, et son prix courant
 * devra être saisi à la main jusqu'à ce qu'un second fournisseur soit branché.
 *
 * Le classement par capitalisation départage les homonymes : `$SOL` doit donner
 * Solana, pas un jeton obscur portant le même symbole.
 */
export async function resolveCoingeckoId(
  symbol: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const clean = symbol.replace(/^\$/, '').trim().toLowerCase();
  if (!clean) return null;

  try {
    const result = await withCache(`coingecko.resolve.${clean}`, 30 * 86_400_000, async () => {
      const payload = await getJson<SearchResponse>(url('/search', { query: clean }), {
        signal,
        attempts: 2,
      });
      const exact = (payload.coins ?? []).filter((coin) => coin.symbol.toLowerCase() === clean);
      if (exact.length === 0) return { id: null };

      exact.sort(
        (a, b) => (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) - (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER),
      );
      return { id: exact[0]!.id };
    });
    return result.value.id;
  } catch {
    // Une résolution ratée ne doit pas empêcher de publier un call.
    return null;
  }
}

/**
 * Index du jour courant dans la fenêtre de 90 jours.
 * Dérivé de l'historique quand il est disponible, sinon du mock.
 */
export function todayIndex(points: readonly MarketPoint[]): number {
  const last = points[points.length - 1];
  return last ? last.day : MOCK_TODAY_INDEX;
}
