/**
 * Sur quel cours juger un pari résolu.
 *
 * La justesse d'un pari dépend du grain de la série qui le juge : un pari
 * d'une semaine lu sur huit points journaliers n'a pas le même score que sur
 * cent soixante points horaires. Tant qu'elle ne servait qu'à l'historique,
 * c'était un détail. Avec un classement, c'est une question d'équité : le même
 * pari doit rapporter les **mêmes** points partout — dans l'onglet Oracle quel
 * que soit l'horizon affiché, et sur la page du membre.
 *
 * D'où deux séries canoniques, aux origines fixées par la date et par les paris
 * eux-mêmes, jamais par l'écran :
 *
 *   • **fine** — horaire, depuis 88 jours. CoinGecko rend des points horaires
 *     jusqu'à 90 jours de profondeur (`fetchBtcSince` en demande un de plus
 *     que l'écart) ;
 *   • **large** — journalière, depuis l'ouverture du plus ancien pari résolu,
 *     dans la limite de l'historique public (`MAX_HISTORY_DAYS`).
 *
 * Un pari ouvert dans la fenêtre fine est jugé sur elle, les autres sur la
 * large. Les origines sont calées sur le début du jour : elles ne bougent
 * qu'une fois par jour, et le cache sert les deux écrans.
 */

import { MAX_HISTORY_DAYS } from '@/lib/coingecko';
import { DAY_MS, type Bet } from './betting';

/** Profondeur de la série horaire, en jours. */
export const FINE_DAYS = 88;

export interface JudgingOrigins {
  /** Origine de la série horaire, ou `null` si aucun pari n'en a besoin. */
  fine: number | null;
  /** Origine de la série journalière, ou `null` si aucun pari n'en a besoin. */
  coarse: number | null;
}

const startOfDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

export function fineOrigin(now: number): number {
  return startOfDay(now) - FINE_DAYS * DAY_MS;
}

/** Les séries à charger pour juger ces paris résolus. */
export function judgingOrigins(resolved: readonly Bet[], now: number): JudgingOrigins {
  if (resolved.length === 0) return { fine: null, coarse: null };
  const fine = fineOrigin(now);
  const oldest = Math.min(...resolved.map((bet) => bet.openedAt));
  const floor = startOfDay(now) - (MAX_HISTORY_DAYS - 1) * DAY_MS;
  return {
    fine: resolved.some((bet) => bet.openedAt >= fine) ? fine : null,
    coarse: oldest < fine ? startOfDay(Math.max(oldest, floor)) : null,
  };
}

/** La série qui juge ce pari. */
export function judgingSeries(bet: Pick<Bet, 'openedAt'>, now: number): 'fine' | 'coarse' {
  return bet.openedAt >= fineOrigin(now) ? 'fine' : 'coarse';
}
