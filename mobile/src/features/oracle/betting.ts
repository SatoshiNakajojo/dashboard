/**
 * Les paris de l'Oracle : lesquels sont en cours, lesquels sont clos, et
 * comment les poser ensemble sur un même repère.
 *
 * Avec la saison unique, tout le monde partait le même jour : le jour zéro
 * était commun et les courbes se superposaient d'elles-mêmes. Avec des paris
 * ouverts quand chacun le décide, ce n'est plus vrai. Le repère devient donc
 * **calendaire** : son origine est la plus ancienne ouverture en vue, et chaque
 * tracé y est décalé de l'écart entre son ouverture et cette origine.
 *
 * Un tracé est stocké **relativement à sa propre ouverture** (`[jour, prix]`,
 * jour 0 = l'instant du dépôt). C'est ce qui le rend indépendant de tout
 * affichage ; le décalage n'existe qu'à l'écran.
 *
 * Module pur, testable sans réseau ni rendu.
 */

import type { PricePoint } from '@/lib/chart';
import {
  horizonOf,
  isHorizonKey,
  lookbackDays,
  phaseOf,
  type BetPhase,
  type HorizonKey,
} from '@/lib/horizons';
import type { MarketPoint } from '@/types/domain';

export const DAY_MS = 86_400_000;

/** Un pari, tel que la base le décrit. */
export interface Bet {
  id: string;
  userId: string;
  horizon: HorizonKey;
  /** Instants en millisecondes — fixés par le serveur, jamais par l'app. */
  openedAt: number;
  lockedAt: number;
  resolvesAt: number;
  /** `[jour depuis l'ouverture, prix]`. */
  path: PricePoint[];
  hash: string | null;
}

export function phaseOfBet(bet: Bet, now: number): BetPhase {
  return phaseOf(
    { openedAt: bet.openedAt, locksAt: bet.lockedAt, resolvesAt: bet.resolvesAt },
    now,
  );
}

/** Les paris encore en cours pour cet horizon, tous membres confondus. */
export function openBets(bets: readonly Bet[], horizon: HorizonKey, now: number): Bet[] {
  return bets.filter((bet) => bet.horizon === horizon && bet.resolvesAt > now);
}

/** Mon pari en cours pour cet horizon — il y en a au plus un, la base y veille. */
export function myOpenBet(
  bets: readonly Bet[],
  userId: string | null,
  horizon: HorizonKey,
  now: number,
): Bet | null {
  if (!userId) return null;
  return openBets(bets, horizon, now).find((bet) => bet.userId === userId) ?? null;
}

/**
 * L'historique : les paris clos, du plus récent au plus ancien.
 *
 * Tous horizons confondus — c'est l'endroit où l'on relit qui avait vu juste,
 * et un pari d'une semaine gagné vaut d'être lu à côté d'un pari d'un an perdu.
 */
export function resolvedBets(bets: readonly Bet[], now: number): Bet[] {
  return bets
    .filter((bet) => bet.resolvesAt <= now)
    .sort((a, b) => b.resolvesAt - a.resolvesAt);
}

export interface Window {
  /** Origine du repère : la plus ancienne ouverture en vue, ou un peu avant maintenant. */
  origin: number;
  /** Fin du repère : la plus lointaine résolution en vue. */
  end: number;
  /** Durée couverte, en jours. */
  days: number;
  /** Position de « maintenant » sur l'axe, en jours depuis l'origine. */
  today: number;
}

/**
 * La fenêtre de temps à afficher pour cet horizon.
 *
 * Elle couvre tous les paris en cours **et** le pari qu'on s'apprêterait à
 * ouvrir maintenant. Sans ce second terme, un membre qui n'a pas encore parié
 * verrait un repère qui s'arrête avant la fin de son propre futur pari.
 *
 * Elle commence un peu **avant** aujourd'hui (`lookbackDays`) : on ne
 * prolonge pas une courbe qu'on ne voit pas.
 */
export function windowFor(open: readonly Bet[], horizon: HorizonKey, now: number): Window {
  const span = horizonOf(horizon).days * DAY_MS;
  const origin = Math.min(
    now - lookbackDays(horizon) * DAY_MS,
    ...open.map((bet) => bet.openedAt),
  );
  const end = Math.max(now + span, ...open.map((bet) => bet.resolvesAt));
  return {
    origin,
    end,
    days: (end - origin) / DAY_MS,
    today: (now - origin) / DAY_MS,
  };
}

/** Un tracé, décalé de son ouverture vers l'origine du repère. */
export function shiftPath(
  path: readonly PricePoint[],
  openedAt: number,
  origin: number,
): PricePoint[] {
  const offset = (openedAt - origin) / DAY_MS;
  return path.map(([day, price]) => [day + offset, price] as PricePoint);
}

/** L'inverse : un tracé du repère, ramené à sa propre ouverture. */
export function unshiftPath(
  path: readonly PricePoint[],
  openedAt: number,
  origin: number,
): PricePoint[] {
  const offset = (openedAt - origin) / DAY_MS;
  return path.map(([day, price]) => [day - offset, price] as PricePoint);
}

/**
 * Le cours réel, vu depuis l'ouverture d'un pari.
 *
 * La série est chargée une fois, depuis l'origine du repère. Chaque pari s'y
 * compare dans **sa** base de temps : on décale, et on écarte ce qui précède
 * son ouverture — un pari ne se juge pas sur ce qui s'est passé avant lui.
 */
export function seriesForBet(
  series: readonly MarketPoint[],
  seriesOrigin: number,
  betOpenedAt: number,
): PricePoint[] {
  const offset = (betOpenedAt - seriesOrigin) / DAY_MS;
  return series
    .map(({ day, price }) => [day - offset, price] as PricePoint)
    .filter(([day]) => day >= 0);
}

/**
 * Ce que vise un tracé : le prix de son dernier point.
 *
 * `null` pour un tracé vide — zéro se lirait comme une prédiction d'effondrement.
 */
export function targetOf(path: readonly PricePoint[]): number | null {
  const last = path[path.length - 1];
  return last && Number.isFinite(last[1]) ? last[1] : null;
}

/** Une ligne de `predictions`, telle que la sélection de l'Oracle la rapporte. */
export interface BetRow {
  id: string;
  user_id: string;
  horizon: string;
  opened_at: string;
  locked_at: string;
  resolves_at: string;
  path_data: unknown;
  hash: string | null;
}

/** Les colonnes à demander pour construire un `Bet`. */
export const BET_COLUMNS =
  'id, user_id, horizon, opened_at, locked_at, resolves_at, path_data, hash';

function isPricePoint(value: unknown): value is PricePoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    (value[1] as number) > 0
  );
}

/**
 * Une ligne de la base, devenue un pari — ou `null` si elle est inexploitable.
 *
 * Un horizon inconnu est **écarté**, pas ramené à celui par défaut : une ligne
 * écrite par une version plus récente de l'app (un pari à vingt ans, disons)
 * s'afficherait sinon sur l'axe des trois mois, avec un calendrier faux.
 */
export function betFromRow(row: BetRow): Bet | null {
  if (!isHorizonKey(row.horizon)) return null;
  const openedAt = Date.parse(row.opened_at);
  const lockedAt = Date.parse(row.locked_at);
  const resolvesAt = Date.parse(row.resolves_at);
  if (![openedAt, lockedAt, resolvesAt].every(Number.isFinite)) return null;

  return {
    id: row.id,
    userId: row.user_id,
    horizon: row.horizon,
    openedAt,
    lockedAt,
    resolvesAt,
    path: Array.isArray(row.path_data) ? row.path_data.filter(isPricePoint) : [],
    hash: row.hash,
  };
}

/** La base refuse au-delà (`is_valid_price_path`). */
export const MAX_PATH_POINTS = 400;

/**
 * Un tracé prêt à partir : dans les bornes que la base impose, et léger.
 *
 *   • le jour est ramené dans `[0, maxDay]` — un pari ne commence pas avant
 *     son ouverture, ni ne se prolonge après sa résolution ;
 *   • les jours restent strictement croissants après ce bornage, sinon deux
 *     points au jour 0 feraient un trait vertical ;
 *   • on arrondit au millième de jour (1,4 min) et au dollar près : le doigt
 *     n'est pas plus précis, et le JSON s'en trouve trois fois plus court.
 */
export function pathForSave(path: readonly PricePoint[], maxDay: number): PricePoint[] {
  const out: PricePoint[] = [];
  for (const point of path) {
    if (!isPricePoint(point)) continue;
    const day = Math.round(Math.min(maxDay, Math.max(0, point[0])) * 1000) / 1000;
    const price = Math.max(1, Math.round(point[1]));
    const last = out[out.length - 1];
    if (last && day <= last[0]) continue;
    out.push([day, price]);
    if (out.length === MAX_PATH_POINTS) break;
  }
  return out;
}

/**
 * Le pari ajouté, ou remplacé s'il est déjà là.
 *
 * L'écho temps réel de sa propre écriture arrive après la réponse de la
 * requête : il doit retomber sur un état déjà à jour sans dupliquer la ligne.
 */
export function upsertBet(bets: readonly Bet[], bet: Bet): Bet[] {
  const index = bets.findIndex((candidate) => candidate.id === bet.id);
  if (index === -1) return [...bets, bet];
  const next = bets.slice();
  next[index] = bet;
  return next;
}

/** Un tracé d'au moins deux points : en deçà, ce n'est pas un pari. */
export function hasPath(bet: Pick<Bet, 'path'>): boolean {
  return bet.path.length >= 2;
}

/**
 * Ce pari peut-il être retiré par son auteur ?
 *
 *   • **révisable** — toujours : c'est le retrait ordinaire ;
 *   • **verrouillé** — seulement s'il ne lèse personne : son tracé est vide
 *     (un reste de l'ancienne saison, qui bloquait l'horizon pour rien), ou
 *     personne d'autre n'a parié sur cet horizon. Le verrou protège la
 *     sincérité du pari **face aux autres** ; seul sur l'horizon, il n'y a
 *     personne à protéger, et il ne faisait que bloquer un nouveau pari ;
 *   • **résolu** — jamais : il appartient à l'historique du club.
 *
 * La base applique la même règle (`prediction_withdrawable`) : ceci ne sert
 * qu'à montrer ou non le bouton.
 */
export function withdrawable(bet: Bet, bets: readonly Bet[], now: number): boolean {
  const phase = phaseOfBet(bet, now);
  if (phase === 'resolved') return false;
  if (phase === 'open') return true;
  if (!hasPath(bet)) return true;
  return !bets.some(
    (other) =>
      other.horizon === bet.horizon &&
      other.userId !== bet.userId &&
      other.resolvesAt > now &&
      hasPath(other),
  );
}
