/**
 * Géométrie du repère de l'Oracle — SPEC §5.3.
 *
 * Tout est exprimé dans le **repère logique 360 × 285**, jamais en pixels
 * d'écran : `predictions.path_data` doit rester lisible depuis n'importe quel
 * device. La mise à l'échelle se fait par un facteur unique au rendu.
 */

export const PAD = { l: 34, r: 6, t: 10, b: 33 } as const;
export const W = 360;
export const H = 285;
export const PMIN = 80_000;
export const PMAX = 200_000;
export const DAYS = 90;

/** Ligne de base de l'aire sous la courbe BTC. */
export const BASELINE_Y = 252;

/** Bornes du tracé au doigt (le bas est relevé de 20 pour éviter les étiquettes). */
export const DRAW_BOUNDS = {
  minX: PAD.l,
  maxX: W - PAD.r,
  minY: PAD.t,
  maxY: H - PAD.b - 20,
} as const;

/** Écart minimal en X entre deux points capturés — garantit la monotonie. */
export const MIN_X_STEP = 4;

export type Point = readonly [x: number, y: number];

/** Jour (0 → 90) vers abscisse (34 → 354). */
export function x(day: number): number {
  return PAD.l + (day / DAYS) * (W - PAD.l - PAD.r);
}

/** Prix (80 k → 200 k) vers ordonnée (240 → 10). */
export function y(price: number): number {
  return PAD.t + ((PMAX - price) / (PMAX - PMIN)) * (H - PAD.t - PAD.b - 12);
}

/** Inverse de `y` — sert à lire le prix visé par un tracé au doigt. */
export function priceAt(yValue: number): number {
  return PMAX - ((yValue - PAD.t) / (H - PAD.t - PAD.b - 12)) * (PMAX - PMIN);
}

/** Inverse de `x` — sert à dater un point du tracé. */
export function dayAt(xValue: number): number {
  return ((xValue - PAD.l) / (W - PAD.l - PAD.r)) * DAYS;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ramène un point du geste dans le repère de dessin. */
export function clampToCanvas(px: number, py: number): Point {
  return [
    clampValue(px, DRAW_BOUNDS.minX, DRAW_BOUNDS.maxX),
    clampValue(py, DRAW_BOUNDS.minY, DRAW_BOUNDS.maxY),
  ];
}

/** Chemin SVG polyligne — la forme stockée dans `path_data`. */
export function toSvgPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
}

/** Chemin fermé sur la ligne de base, pour l'aire dégradée sous la courbe BTC. */
export function toAreaPath(points: readonly Point[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${toSvgPath(points)} L ${last[0].toFixed(1)} ${BASELINE_Y} L ${first[0].toFixed(1)} ${BASELINE_Y} Z`;
}

/**
 * Ajoute un point au tracé en respectant la règle de capture (SPEC §5.3) :
 * strictement monotone en X, un point tous les `MIN_X_STEP` au minimum.
 * Renvoie `null` si le point est à ignorer — l'appelant évite alors un rendu.
 */
export function appendDrawPoint(points: readonly Point[], next: Point): Point[] | null {
  const last = points[points.length - 1];
  if (last && next[0] <= last[0] + MIN_X_STEP) return null;
  return [...points, next];
}

/** Graduations horizontales : 200k / 170k / 140k / 110k / 80k. */
export const Y_TICKS = [200_000, 170_000, 140_000, 110_000, 80_000] as const;

/** Étiquettes de mois, ancrées sur les jours 0 / 26 / 57 / 87. */
export const X_TICKS = [
  { label: 'SEPT', day: 0 },
  { label: 'OCT', day: 26 },
  { label: 'NOV', day: 57 },
  { label: 'DÉC', day: 87 },
] as const;

/**
 * Écart absolu moyen entre une prédiction et la courbe réelle, en % (README §7.3).
 * Les deux séries sont ré-échantillonnées sur les jours communs par
 * interpolation linéaire ; renvoie `null` si le recouvrement est vide.
 */
export function meanAbsoluteGap(
  prediction: readonly Point[],
  actual: readonly Point[],
): number | null {
  if (prediction.length < 2 || actual.length < 2) return null;

  const from = Math.max(prediction[0]![0], actual[0]![0]);
  const to = Math.min(
    prediction[prediction.length - 1]![0],
    actual[actual.length - 1]![0],
  );
  if (!(to > from)) return null;

  const SAMPLES = 64;
  let total = 0;
  let counted = 0;

  for (let i = 0; i <= SAMPLES; i++) {
    const at = from + ((to - from) * i) / SAMPLES;
    const predicted = priceAt(interpolateY(prediction, at));
    const real = priceAt(interpolateY(actual, at));
    if (real === 0) continue;
    total += Math.abs((predicted - real) / real) * 100;
    counted += 1;
  }

  return counted === 0 ? null : total / counted;
}

/** Ordonnée de la polyligne à l'abscisse demandée (interpolation linéaire). */
export function interpolateY(points: readonly Point[], atX: number): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (atX <= first[0]) return first[1];
  if (atX >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (atX <= b[0]) {
      const span = b[0] - a[0];
      if (span === 0) return b[1];
      const t = (atX - a[0]) / span;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}
