/**
 * L'Oracle sans serveur — DONNEES_FICTIVES §Oracle.
 *
 * Un monde cohérent avec lui-même : un cours du bitcoin défini pour **tout
 * instant**, et des paris ouverts à des dates différentes qui s'y comparent.
 * C'est ce qui permet de vérifier l'alignement calendaire des courbes à
 * l'écran — avec une seule date d'ouverture commune, un défaut de décalage
 * serait invisible.
 */

import type { Bet } from '@/features/oracle/betting';
import type { PricePoint } from '@/lib/chart';
import { scheduleFor, type HorizonKey } from '@/lib/horizons';
import type { MarketPoint } from '@/types/domain';
import { MEMBERS } from './members';

const DAY = 86_400_000;

/**
 * L'ancre du monde fictif : minuit, il y a 34 jours.
 *
 * Calculée une fois au chargement, pour que tous les paris et la série du
 * cours voient la même histoire pendant toute la session.
 */
const TODAY = Math.floor(Date.now() / DAY) * DAY;
const ANCHOR = TODAY - 34 * DAY;

/** Le cours fictif du jour : celui du bandeau, pour que les deux se répondent. */
const SPOT_TODAY = 120_911;

/**
 * Le cours fictif à un instant donné — lisse, haussier, avec du relief.
 *
 * Tendance **exponentielle**, ancrée sur aujourd'hui : une tendance linéaire
 * passait sous zéro un an en arrière, ce que le repère à dix ans montre.
 */
export function mockBtcAt(ms: number): number {
  const d = (ms - TODAY) / DAY;
  const a = (ms - ANCHOR) / DAY;
  return SPOT_TODAY * Math.exp(0.0016 * d) * (1 + 0.028 * Math.sin(a * 0.37) + 0.012 * Math.cos(a * 1.1));
}

/**
 * La série « réelle » depuis une origine, jusqu'à maintenant.
 *
 * Un point toutes les six heures : assez fin pour qu'un pari d'une semaine ait
 * une courbe, pas assez pour alourdir le rendu.
 */
export function mockBtcSince(originMs: number, now: number = Date.now()): MarketPoint[] {
  const out: MarketPoint[] = [];
  const step = DAY / 4;
  for (let t = originMs; t <= now; t += step) {
    out.push({ day: (t - originMs) / DAY, price: mockBtcAt(t) });
  }
  return out;
}

/**
 * Un tracé plausible pour un membre : il part du cours du jour d'ouverture et
 * dérive selon son tempérament. Stocké **relativement à son ouverture**.
 */
function mockPath(openedAt: number, days: number, drift: number, seed: number): PricePoint[] {
  const start = mockBtcAt(openedAt);
  const step = Math.max(1, days / 15);
  const out: PricePoint[] = [];
  for (let day = 0; day <= days + 1e-9; day += step) {
    const t = day / days;
    out.push([day, start * (1 + drift * t + 0.035 * Math.sin(day / (days / 7) + seed * 1.9))]);
  }
  return out;
}

let sequence = 0;
function mockBet(userId: string, horizon: HorizonKey, openedAt: number, drift: number): Bet {
  sequence += 1;
  const schedule = scheduleFor(horizon, openedAt);
  const days = (schedule.resolvesAt - schedule.openedAt) / DAY;
  return {
    id: `55555555-5555-4555-8555-${String(sequence).padStart(12, '0')}`,
    userId,
    horizon,
    openedAt: schedule.openedAt,
    lockedAt: schedule.locksAt,
    resolvesAt: schedule.resolvesAt,
    path: mockPath(openedAt, days, drift, sequence),
    // Un pari verrouillé a son empreinte ; les autres aussi, puisqu'elle suit
    // le tracé — la base la recalcule à chaque écriture.
    hash: ['8F2A', '3C71', 'B04E', '19DD', '7A5F', 'E2C8', '5B90', 'D4A6'][sequence % 8]!,
  };
}

/**
 * Les paris du club.
 *
 * Chaque état d'un pari est représenté, pour qu'on puisse tous les voir sans
 * attendre des jours :
 *
 *   • trois mois — six membres, ouverts à des dates différentes, ce qui
 *     exerce l'alignement ; le mien (« Toi ») est **verrouillé** ;
 *   • une semaine — un pari en cours chez Léa, deux clos pour l'historique, et
 *     aucun à moi : c'est là qu'on essaie d'en déposer un ;
 *   • un an — le mien, ouvert il y a cinq jours, encore **révisable** ;
 *   • cinq ans — le mien, verrouillé, et **seul** sur l'horizon : c'est le cas
 *     où l'on peut le débloquer ;
 *   • six mois et dix ans — vides, comme au premier jour ;
 *   • des paris résolus sur plusieurs mois, et deux de l'an dernier, pour que
 *     le classement des oracles ait de quoi départager.
 */
export const MOCK_BETS: Bet[] = [
  mockBet(MEMBERS.me!.id, '3m', ANCHOR - 2 * DAY, 0.3),
  mockBet(MEMBERS.john!.id, '3m', ANCHOR, 0.42),
  mockBet(MEMBERS.alex!.id, '3m', ANCHOR + 3 * DAY, -0.22),
  mockBet(MEMBERS.marco!.id, '3m', ANCHOR + 6 * DAY, 0.78),
  mockBet(MEMBERS.sofia!.id, '3m', ANCHOR + 12 * DAY, 0.12),
  mockBet(MEMBERS.rayan!.id, '3m', ANCHOR + 20 * DAY, -0.38),
  mockBet(MEMBERS.lea!.id, '1w', TODAY - 2 * DAY, 0.06),
  mockBet(MEMBERS.alex!.id, '1w', TODAY - 20 * DAY, 0.09),
  mockBet(MEMBERS.marco!.id, '1w', TODAY - 11 * DAY, -0.04),
  mockBet(MEMBERS.me!.id, '12m', TODAY - 5 * DAY, 0.9),
  mockBet(MEMBERS.me!.id, '1m', TODAY - 1 * DAY, 1.06),
  // Des paris résolus, pour le classement : des semaines, un trimestre, et
  // deux de l'an dernier que seul « depuis toujours » compte.
  mockBet(MEMBERS.john!.id, '1w', TODAY - 30 * DAY, 0.05),
  mockBet(MEMBERS.lea!.id, '1w', TODAY - 30 * DAY, 0.02),
  mockBet(MEMBERS.sofia!.id, '1w', TODAY - 45 * DAY, -0.06),
  mockBet(MEMBERS.me!.id, '1w', TODAY - 45 * DAY, 0.03),
  mockBet(MEMBERS.rayan!.id, '3m', TODAY - 150 * DAY, 0.35),
  mockBet(MEMBERS.john!.id, '3m', TODAY - 140 * DAY, 0.2),
  mockBet(MEMBERS.lea!.id, '3m', TODAY - 130 * DAY, 0.1),
  mockBet(MEMBERS.marco!.id, '1w', TODAY - 320 * DAY, 0.1),
  mockBet(MEMBERS.alex!.id, '1w', TODAY - 330 * DAY, 0.01),
];
