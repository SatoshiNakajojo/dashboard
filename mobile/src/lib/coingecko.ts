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
import {
  bestCoin,
  normalizeTicker,
  rankCoins,
  type CoinMatch,
  type RawCoin,
} from './coinSearch';
import type { BtcSpot, MarketPoint } from '@/types/domain';

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

/**
 * Cours de plusieurs jetons en une seule requête.
 *
 * `/simple/price` accepte une liste d'identifiants : sept membres qui suivent
 * cinq jetons font **une** demande, pas cinq. CoinGecko facture à la requête,
 * et le quota gratuit est vite atteint autrement.
 *
 * Ne lève jamais pour une panne réseau : un cours absent laisse la carte sur
 * son dernier prix connu, ce que `mergeQuotes` sait interpréter.
 */
export async function fetchCoinPrices(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};

  // La clé de cache dépend de la liste demandée : deux listes différentes ne
  // doivent pas se recouvrir, et l'ordre ne doit pas créer deux entrées.
  const sorted = [...ids].sort();
  const key = `coingecko.prices.${sorted.join(',')}`;

  try {
    const result = await withCache(key, SPOT_TTL_MS, async () => {
      const payload = await getJson<Record<string, { usd?: number }>>(
        url('/simple/price', { ids: sorted.join(','), vs_currencies: 'usd' }),
        { signal },
      );
      const out: Record<string, number> = {};
      for (const [id, value] of Object.entries(payload)) {
        if (typeof value?.usd === 'number' && Number.isFinite(value.usd)) out[id] = value.usd;
      }
      return out;
    });
    return result.value;
  } catch {
    return {};
  }
}

interface MarketChartResponse {
  prices?: [timestampMs: number, price: number][];
}

export interface BtcHistory {
  /** `day` = jours écoulés depuis l'origine demandée. */
  points: MarketPoint[];
  stale: boolean;
}

/**
 * L'API publique de CoinGecko ne rend pas plus d'un an d'historique : au-delà,
 * elle répond 401 et on n'aurait **rien**. Un pari à cinq ans ouvert il y a
 * deux ans se juge donc sur sa dernière année — la justesse ne compare que ce
 * qui se recoupe (`meanAbsoluteGap`), elle ne s'invente pas le reste.
 */
export const MAX_HISTORY_DAYS = 365;

/**
 * Le cours du bitcoin depuis un instant donné.
 *
 * Elle était ancrée sur la saison : 90 jours, comptés depuis une époque fixe.
 * Les paris ont désormais chacun leur ouverture, d'une semaine à dix ans ; on
 * demande donc la série **depuis l'origine du repère affiché**, et chaque pari
 * s'y compare dans sa propre base de temps (`seriesForBet`).
 *
 * La granularité suit la durée, et c'est voulu : sur une semaine, des points
 * journaliers ne feraient que huit points et une justesse grossière. CoinGecko
 * rend des points horaires jusqu'à 90 jours si on ne force pas `daily`.
 */
export async function fetchBtcSince(originMs: number, signal?: AbortSignal): Promise<BtcHistory> {
  const now = Date.now();
  const elapsed = Math.max(0, now - originMs) / 86_400_000;
  // Au moins deux jours : en deçà, la réponse est vide ou d'une granularité
  // de cinq minutes, qui n'apporte rien à un tracé au doigt.
  const days = Math.min(MAX_HISTORY_DAYS, Math.max(2, Math.ceil(elapsed) + 1));
  const daily = days > 90;

  // L'origine est arrondie à l'heure : sans ça, chaque rendu produirait une
  // clé neuve et le cache ne servirait jamais.
  const hour = Math.floor(originMs / 3_600_000);
  const key = `coingecko.btc.since.${hour}.${days}`;
  const ttl = daily ? HISTORY_TTL_MS : SPOT_TTL_MS * 30;

  const result = await withCache(key, ttl, async () => {
    const params: Record<string, string> = { vs_currency: 'usd', days: String(days) };
    if (daily) params.interval = 'daily';

    const payload = await getJson<MarketChartResponse>(
      url('/coins/bitcoin/market_chart', params),
      { signal, timeoutMs: 12_000 },
    );

    const prices = payload.prices ?? [];
    if (prices.length === 0) {
      throw new Error('Réponse CoinGecko inexploitable : historique vide');
    }
    return prices.map(([timestamp, price]) => ({ timestamp, price }));
  });

  const points = result.value
    .map(({ timestamp, price }) => ({ day: (timestamp - originMs) / 86_400_000, price }))
    .filter((p) => p.day >= 0 && Number.isFinite(p.price) && p.price > 0)
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
  coins?: RawCoin[];
}

/** Une recherche vaut pour la session : les jetons ne changent pas d'identifiant. */
const SEARCH_TTL_MS = 30 * 86_400_000;

/** Un seul appel réseau, deux usages : proposer et résoudre. */
async function searchRaw(query: string, signal?: AbortSignal): Promise<RawCoin[]> {
  const result = await withCache(`coingecko.search.${query}`, SEARCH_TTL_MS, async () => {
    const payload = await getJson<SearchResponse>(url('/search', { query }), {
      signal,
      attempts: 2,
    });
    return payload.coins ?? [];
  });
  return result.value;
}

/**
 * Jetons proposés au composer pour une saisie partielle.
 *
 * Ne lève jamais : sans réseau, la liste est vide et le membre tape son ticker
 * comme avant. Une autocomplétion est une commodité, pas une condition.
 */
export async function searchCoins(query: string, signal?: AbortSignal): Promise<CoinMatch[]> {
  const clean = normalizeTicker(query);
  if (clean.length < 2) return [];
  try {
    return rankCoins(await searchRaw(clean, signal), clean);
  } catch {
    return [];
  }
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
  const clean = normalizeTicker(symbol);
  if (!clean) return null;

  try {
    // Même requête, même cache que `searchCoins` : ouvrir le composer a déjà
    // payé l'aller-retour que la publication aurait fait.
    return bestCoin(await searchRaw(clean, signal), clean)?.id ?? null;
  } catch {
    // Une résolution ratée ne doit pas empêcher de publier un call.
    return null;
  }
}
