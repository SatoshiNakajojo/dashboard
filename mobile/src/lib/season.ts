/**
 * Saisons du club.
 *
 * Une saison dure 90 jours — la fenêtre de l'Oracle. Elle donne deux choses :
 * l'étiquette écrite dans `predictions.season`, et surtout **l'ancrage** de la
 * courbe, c'est-à-dire la date à laquelle correspond le jour 0 du repère.
 *
 * Sans cet ancrage, l'historique BTC était demandé sur « les 90 derniers
 * jours », ce qui plaçait aujourd'hui au jour 90 sur 90 : la courbe réelle
 * occupait toute la toile et il ne restait rien à prédire. Le défaut était
 * invisible sur les mocks, qui fixent aujourd'hui au jour 34.
 *
 * Module **pur** : pas d'horloge implicite, `now` se passe en argument. C'est
 * ce qui permet de tester un changement de saison sans attendre 90 jours.
 */

import { DAYS } from './chart';
import { toRoman } from './format';

/**
 * Minuit à Nouméa le jour de l'ouverture du club — `2026-09-19T00:00+11:00`.
 *
 * **C'est la seule ligne à changer pour décaler les saisons**, et elle ne se
 * change pas à la légère : `predictions.season` en dérive, et des tracés déjà
 * déposés se retrouveraient orphelins d'une saison qui n'existe plus.
 *
 * Le décalage compte : le club est en Nouvelle-Calédonie, une saison doit
 * tourner à minuit ici, pas à midi.
 */
export const SEASON_EPOCH = Date.UTC(2026, 8, 18, 13, 0, 0);

/** Durée d'une saison, en jours. Identique à la largeur du repère. */
export const SEASON_DAYS = DAYS;

const DAY_MS = 86_400_000;

export interface Season {
  /** Étiquette stockée — `2026-S1`. Année de début, puis rang depuis l'ouverture. */
  code: string;
  /** 1, 2, 3… depuis l'ouverture du club. */
  ordinal: number;
  /** « I », « II », « III » — pour les titres d'écran. */
  roman: string;
  /** Instant du début de saison, en millisecondes. Jour 0 du repère. */
  startedAt: number;
  /** Jour courant dans la fenêtre, de 0 à 89. */
  day: number;
}

/**
 * La saison en cours à un instant donné.
 *
 * Avant l'ouverture — horloge d'un téléphone mal réglée, ou date d'époque
 * déplacée vers l'avenir — on renvoie la saison I à son jour 0 plutôt qu'un
 * rang négatif. Un écran qui s'affiche mal vaut mieux qu'un rang qui devient
 * une clé de ligne.
 */
export function seasonAt(now: number = Date.now()): Season {
  const span = SEASON_DAYS * DAY_MS;
  const elapsed = Math.max(0, now - SEASON_EPOCH);
  const index = Math.floor(elapsed / span);
  const startedAt = SEASON_EPOCH + index * span;
  const ordinal = index + 1;

  return {
    code: `${new Date(startedAt).getUTCFullYear()}-S${ordinal}`,
    ordinal,
    roman: toRoman(ordinal),
    startedAt,
    // Le reste de `elapsed`, déjà borné à zéro : le jour tombe dans 0..89 sans
    // qu'on ait à le rattraper aux deux bouts.
    day: Math.floor((elapsed % span) / DAY_MS),
  };
}

/**
 * Nombre de jours d'historique à demander pour couvrir la saison en cours.
 *
 * Au moins 1 : CoinGecko refuse une fenêtre vide, et le premier jour d'une
 * saison doit tout de même afficher un point.
 */
export function historyDays(season: Season, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((now - season.startedAt) / DAY_MS));
}
