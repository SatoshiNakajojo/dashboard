import { DAYS, PMAX, PMIN, x, y, type Point } from '@/lib/chart';
import type { MarketPoint, Prediction } from '@/types/domain';
import { MEMBERS } from './members';

/** Saison courante de l'Oracle. */
export const MOCK_SEASON = '2026-S3';

/** Jour courant dans la fenêtre de 90 jours — `JOUR 34 / 90`. */
export const MOCK_TODAY_INDEX = 34;

/**
 * Courbe BTC « réelle » simulée — DONNEES_FICTIVES §Générateurs.
 * Remplacée en production par `market_chart?days=90&interval=daily`,
 * tronquée au jour courant.
 */
export function mockBtcSeries(): MarketPoint[] {
  const out: MarketPoint[] = [];
  let price = 104_000;
  for (let day = 0; day <= MOCK_TODAY_INDEX; day++) {
    price *= 1 + 0.0042 + 0.011 * Math.sin(day * 1.7) + 0.006 * Math.cos(day * 0.53);
    out.push({ day, price });
  }
  return out;
}

/**
 * Courbes des membres — un point tous les 6 jours, bornées dans le repère.
 * Remplacées en production par `predictions.path_data`.
 */
const DRIFTS = [0.62, -0.28, 1.05, 0.18, -0.55];

function mockMemberCurve(index: number): Point[] {
  const drift = DRIFTS[index] ?? 0;
  const points: Point[] = [];
  for (let day = 0; day <= DAYS; day += 6) {
    const raw =
      118_000 * (1 + drift * (day / DAYS) * 0.55 + 0.045 * Math.sin(day / 11 + index * 1.9));
    const price = Math.max(PMIN + 3_000, Math.min(PMAX - 3_000, raw));
    points.push([x(day), y(price)]);
  }
  return points;
}

const CURVE_MEMBERS = [MEMBERS.john!, MEMBERS.alex!, MEMBERS.marco!, MEMBERS.sofia!, MEMBERS.rayan!];

/** Prédictions déposées par les autres membres (5 sur 7). */
export const MOCK_PREDICTIONS: Prediction[] = CURVE_MEMBERS.map((member, index) => ({
  id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
  userId: member.id,
  season: MOCK_SEASON,
  pathData: mockMemberCurve(index),
  lockedAt: null,
  hash: null,
}));

/**
 * Courbe pré-tracée du prototype. **Non utilisée par défaut** : en production
 * l'écran démarre vide avec son placeholder. Gardée pour les captures d'écran
 * et les tests de rendu.
 */
export const MOCK_MY_PATH: Point[] = [
  [34, 168], [78, 150], [122, 158], [166, 120], [210, 96], [254, 84], [298, 62], [352, 44],
];

/** Verrouillage initial : `2j 07:41:00` — DONNEES_FICTIVES §Oracle. */
export const MOCK_LOCK_DELAY_MS = (2 * 86_400 + 7 * 3_600 + 41 * 60) * 1_000;

/** Empreinte affichée après verrouillage. */
export const MOCK_HASH = '8F2A';

/** Date de résolution affichée sur la carte verrouillée. */
export const MOCK_RESOLUTION_LABEL = '03 déc · J+56';
