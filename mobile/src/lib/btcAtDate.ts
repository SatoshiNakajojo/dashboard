/**
 * Le cours du bitcoin **un jour donné** — pour la référence vs ₿ d'un call.
 *
 * La perf « vs ₿ » compare deux évolutions **sur la même période** : celle du
 * titre depuis son prix d'entrée, celle du bitcoin depuis… la même date. Le
 * référentiel était pris au moment de la publication. Un membre qui saisit le
 * prix auquel il a acheté SMR il y a six mois obtenait donc la perf de SMR sur
 * six mois, comparée à celle du bitcoin sur quelques minutes — soit à peu près
 * zéro. La colonne « vs ₿ » recopiait la perf.
 *
 * Un call porte maintenant sa date d'entrée, et le cours du bitcoin de ce
 * jour-là. Deux sources, parce qu'aucune ne suffit seule :
 *
 *   • CoinGecko (`/coins/bitcoin/history`) — mais son API publique ne remonte
 *     pas au-delà d'un an ;
 *   • mempool.space (`/api/v1/historical-price`) — remonte bien plus loin, et
 *     l'app l'interroge déjà pour la hauteur de bloc.
 *
 * Module pur : les formats de réponse et les dates, sans réseau.
 */

import { parseClubDateTime, todayInClub } from './clubTime';

const DAY_MS = 86_400_000;

/** Au-delà, l'API publique de CoinGecko refuse l'historique. */
export const COINGECKO_HISTORY_DAYS = 364;

/**
 * `12/03/2026` → l'instant de midi à Nouméa ce jour-là, ou `null`.
 *
 * Midi plutôt que minuit : à Nouméa (UTC+11), minuit est encore la veille en
 * UTC, et le cours « du jour » viendrait du jour précédent.
 */
export function entryDateMs(input: string): number | null {
  const iso = parseClubDateTime(input, '12:00');
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export type EntryDateCheck =
  { kind: 'today' } | { kind: 'past'; ms: number } | { kind: 'future' } | { kind: 'invalid' };

/** Ce que vaut la date saisie : aujourd'hui, un jour passé, ou rien d'utilisable. */
export function checkEntryDate(input: string, now: number = Date.now()): EntryDateCheck {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === todayInClub(now)) return { kind: 'today' };
  const ms = entryDateMs(trimmed);
  if (ms === null) return { kind: 'invalid' };
  // Comparé en jours du club, pas en instants : « demain » à 23 h est futur.
  const todayMs = entryDateMs(todayInClub(now))!;
  if (ms > todayMs) return { kind: 'future' };
  if (ms === todayMs) return { kind: 'today' };
  return { kind: 'past', ms };
}

/** Le paramètre `date` de CoinGecko : `dd-mm-yyyy`, en UTC. */
export function coingeckoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Vrai si CoinGecko peut encore servir ce jour-là. */
export function coingeckoCovers(ms: number, now: number = Date.now()): boolean {
  return (now - ms) / DAY_MS <= COINGECKO_HISTORY_DAYS;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** `{ market_data: { current_price: { usd } } }` → le cours, ou `null`. */
export function parseCoingeckoHistory(payload: unknown): number | null {
  const usd = (payload as { market_data?: { current_price?: { usd?: unknown } } } | null)
    ?.market_data?.current_price?.usd;
  return positive(usd);
}

/** `{ prices: [{ time, USD }] }` → le cours, ou `null`. */
export function parseMempoolHistory(payload: unknown): number | null {
  const prices = (payload as { prices?: unknown } | null)?.prices;
  if (!Array.isArray(prices) || prices.length === 0) return null;
  return positive((prices[0] as { USD?: unknown } | null)?.USD);
}
