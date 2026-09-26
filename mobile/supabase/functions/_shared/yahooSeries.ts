/**
 * Une série de cours Yahoo Finance — pour l'historique du bitcoin de l'Oracle,
 * servi par la fonction `quote` quand CoinGecko refuse.
 *
 * Yahoo rend des horodatages en secondes et des clôtures, dont certaines
 * nulles (une bougie sans échange) : on les écarte plutôt que d'inventer.
 */

/** Pas de la série et profondeur demandée à Yahoo. */
export const SERIES_RANGES = { '1h': '3mo', '1d': '1y' } as const;
export type SeriesInterval = keyof typeof SERIES_RANGES;

export function isSeriesInterval(value: string | null): value is SeriesInterval {
  return value === '1h' || value === '1d';
}

/** `[instant en ms, clôture]`, dans l'ordre. Réponse illisible : liste vide. */
export function parseYahooSeries(payload: unknown): [number, number][] {
  const result = (payload as { chart?: { result?: unknown[] } } | null)?.chart?.result?.[0] as
    { timestamp?: unknown; indicators?: { quote?: { close?: unknown }[] } } | undefined;
  const times = Array.isArray(result?.timestamp) ? (result.timestamp as unknown[]) : [];
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return [];
  const points: [number, number][] = [];
  times.forEach((time, index) => {
    const price = closes[index];
    if (
      typeof time === 'number' &&
      typeof price === 'number' &&
      Number.isFinite(price) &&
      price > 0
    ) {
      points.push([time * 1000, price]);
    }
  });
  return points.sort((a, b) => a[0] - b[0]);
}
