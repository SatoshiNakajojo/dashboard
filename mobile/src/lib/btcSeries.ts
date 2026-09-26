/**
 * Les séries du cours du bitcoin — la partie sans réseau.
 *
 * Chaque écran de l'Oracle demandait **sa** série, depuis l'origine de son
 * repère : une origine qui glisse d'heure en heure. D'où une requête
 * CoinGecko neuve à chaque heure et pour chaque horizon, que l'API publique
 * finissait par refuser (« COURS INDISPONIBLE »), et une entrée de cache
 * neuve à chaque fois, jamais effacée, jusqu'à remplir le stockage de l'app.
 *
 * Désormais, deux séries seulement, communes à tous les écrans :
 *
 *   • **horaire**, sur 90 jours — tout ce qui tient dans 90 jours, dont la
 *     série fine qui juge les paris (`judging.ts`) ;
 *   • **journalière**, sur un an — au-delà.
 *
 * Chaque écran y découpe ce qui le concerne (`sinceOrigin`).
 */

import type { MarketPoint } from '@/types/domain';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Profondeur de la série horaire : CoinGecko rend des points horaires jusqu'à 90 jours. */
export const HOURLY_DAYS = 90;
/** Profondeur de la série journalière : l'historique de l'API publique. */
export const DAILY_DAYS = 365;

export interface SeriesSpec {
  daily: boolean;
  days: number;
}

/** La série qui couvre `neededDays` jours : l'horaire si elle suffit. */
export function seriesFor(neededDays: number): SeriesSpec {
  return neededDays <= HOURLY_DAYS
    ? { daily: false, days: HOURLY_DAYS }
    : { daily: true, days: DAILY_DAYS };
}

/** Clé de cache d'une série : fixe, donc réutilisée d'une heure à l'autre. */
export function seriesKey(spec: SeriesSpec): string {
  return spec.daily ? 'btc.history.daily' : 'btc.history.hourly';
}

export interface RawPoint {
  timestamp: number;
  price: number;
}

/** Les points depuis `originMs`, en jours écoulés depuis elle. */
export function sinceOrigin(raw: readonly RawPoint[], originMs: number): MarketPoint[] {
  return raw
    .map(({ timestamp, price }) => ({ day: (timestamp - originMs) / DAY_MS, price }))
    .filter((point) => point.day >= 0 && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.day - b.day);
}

// ---------------------------------------------------------------------------
// Binance, en secours
// ---------------------------------------------------------------------------

/**
 * Le point d'accès public de Binance réservé aux cours : sans clé, sans
 * restriction géographique, et bien plus généreux que CoinGecko.
 */
export const BINANCE_KLINES = 'https://data-api.binance.vision/api/v3/klines';
/** Bougies par requête, au plus. */
export const BINANCE_LIMIT = 1000;

/** Les requêtes à faire pour couvrir la série : 3 pour 90 jours horaires, 1 pour l'année. */
export function binanceRequests(spec: SeriesSpec, now: number): string[] {
  const step = spec.daily ? DAY_MS : HOUR_MS;
  const interval = spec.daily ? '1d' : '1h';
  const urls: string[] = [];
  for (let start = now - spec.days * DAY_MS; start < now; start += BINANCE_LIMIT * step) {
    const query = new URLSearchParams({
      symbol: 'BTCUSDT',
      interval,
      startTime: String(Math.floor(start)),
      limit: String(BINANCE_LIMIT),
    });
    urls.push(`${BINANCE_KLINES}?${query.toString()}`);
  }
  return urls;
}

/**
 * Bougies Binance → points : le cours de clôture, daté de la fin de la bougie.
 * La bougie en cours se date de maintenant. Une ligne illisible est écartée.
 */
export function parseBinanceKlines(payload: unknown, now: number): RawPoint[] {
  if (!Array.isArray(payload)) return [];
  const points: RawPoint[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const closeTime = Number(row[6]);
    const price = Number(row[4]);
    if (!Number.isFinite(closeTime) || !Number.isFinite(price) || price <= 0) continue;
    points.push({ timestamp: Math.min(closeTime + 1, now), price });
  }
  return points;
}

/** Plusieurs pages de bougies → une série, sans doublon, dans l'ordre. */
export function mergePages(pages: readonly RawPoint[][]): RawPoint[] {
  const byTime = new Map<number, RawPoint>();
  for (const page of pages) for (const point of page) byTime.set(point.timestamp, point);
  return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Supabase (Yahoo Finance), en secours
// ---------------------------------------------------------------------------

/** La série demandée à la fonction `quote` : `BTC-USD`, horaire ou journalière. */
export function edgeSeriesPath(spec: SeriesSpec): string {
  return `quote?symbol=BTC-USD&series=${spec.daily ? '1d' : '1h'}`;
}

/** La réponse de la fonction → points. Illisible (ancienne version) : liste vide. */
export function parseEdgeSeries(payload: unknown): RawPoint[] {
  const points = (payload as { points?: unknown } | null)?.points;
  if (!Array.isArray(points)) return [];
  const out: RawPoint[] = [];
  for (const point of points) {
    if (!Array.isArray(point)) continue;
    const [timestamp, price] = point as unknown[];
    if (typeof timestamp === 'number' && typeof price === 'number' && price > 0) {
      out.push({ timestamp, price });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ce qu'ont répondu les sources — pour le panneau « À propos »
// ---------------------------------------------------------------------------

export type SourceName = 'coingecko' | 'supabase' | 'binance';

/** `OK`, un statut HTTP (`429`), `RÉSEAU`, `VIDE`, ou absent si pas interrogée. */
export type HistoryProbe = Partial<Record<SourceName, string>>;

/** La raison courte d'un échec : un statut, ou le réseau. */
export function failureReason(cause: unknown): string {
  const status = (cause as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return String(status);
  if (cause instanceof TypeError) return 'RÉSEAU';
  return 'VIDE';
}

/** `COURS BTC · COINGECKO 429 · SUPABASE OK · BINANCE —`. */
export function describeHistory(probe: HistoryProbe): string {
  const label = (name: SourceName, title: string) => `${title} ${probe[name] ?? '—'}`;
  return [
    'COURS BTC',
    label('coingecko', 'COINGECKO'),
    label('supabase', 'SUPABASE'),
    label('binance', 'BINANCE'),
  ].join(' · ');
}
