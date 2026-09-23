/**
 * Géométrie du repère de l'Oracle — SPEC §5.3.
 *
 * La toile fait toujours **360 × 285** points logiques, jamais des pixels
 * d'écran : la mise à l'échelle se fait par un facteur unique au rendu.
 *
 * Ce qui change, en revanche, c'est le **domaine** que cette toile représente.
 * Il était figé à 90 jours et 80 k$ – 200 k$ ; un pari à dix ans n'y tient pas.
 * Le domaine est donc devenu un `Frame`, passé explicitement partout où on
 * projette.
 *
 * Corollaire, et c'est le point important : un tracé ne se stocke **pas** en
 * coordonnées de toile. Deux membres ne pourraient superposer leurs courbes que
 * s'ils partageaient le même repère, ce qui n'est plus vrai. Un tracé se stocke
 * en **prix** — `[jour, dollars]` — indépendant de tout affichage, et la
 * comparaison entre membres redevient une comparaison de prix réels.
 */

export const PAD = { l: 34, r: 6, t: 10, b: 33 } as const;
export const W = 360;
export const H = 285;
export const PMIN = 80_000;
export const PMAX = 200_000;
export const DAYS = 90;

/** Ligne de base de l'aire sous la courbe BTC. */
export const BASELINE_Y = 252;

export interface DrawBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Bornes du tracé au doigt (le bas est relevé de 20 pour éviter les étiquettes). */
export const DRAW_BOUNDS: DrawBounds = {
  minX: PAD.l,
  maxX: W - PAD.r,
  minY: PAD.t,
  maxY: H - PAD.b - 20,
};

/** Écart minimal en X entre deux points capturés — garantit la monotonie. */
export const MIN_X_STEP = 4;

/** Un point de la toile, en coordonnées logiques. */
export type Point = readonly [x: number, y: number];

/** Un point d'un tracé, tel qu'il se stocke : un jour et un prix. */
export type PricePoint = readonly [day: number, price: number];

/** Le domaine que la toile représente. */
export interface Frame {
  /** Durée couverte par l'axe des temps, en jours. */
  days: number;
  pmin: number;
  pmax: number;
}

/** Le repère historique : 90 jours, 80 k$ – 200 k$. */
export const DEFAULT_FRAME: Frame = { days: DAYS, pmin: PMIN, pmax: PMAX };

/** Hauteur utile du repère. `H - PAD.t - PAD.b - 12` vaut 230, pas 240. */
const PLOT_H = H - PAD.t - PAD.b - 12;
const PLOT_W = W - PAD.l - PAD.r;

/** Jour (0 → `frame.days`) vers abscisse (34 → 354). */
export function x(day: number, frame: Frame = DEFAULT_FRAME): number {
  if (!(frame.days > 0)) return PAD.l;
  return PAD.l + (day / frame.days) * PLOT_W;
}

/** Prix vers ordonnée (240 → 10). */
export function y(price: number, frame: Frame = DEFAULT_FRAME): number {
  const span = frame.pmax - frame.pmin;
  if (!(span > 0)) return PAD.t + PLOT_H;
  return PAD.t + ((frame.pmax - price) / span) * PLOT_H;
}

/** Inverse de `y` — sert à lire le prix visé par un tracé au doigt. */
export function priceAt(yValue: number, frame: Frame = DEFAULT_FRAME): number {
  return frame.pmax - ((yValue - PAD.t) / PLOT_H) * (frame.pmax - frame.pmin);
}

/** Inverse de `x` — sert à dater un point du tracé. */
export function dayAt(xValue: number, frame: Frame = DEFAULT_FRAME): number {
  return ((xValue - PAD.l) / PLOT_W) * frame.days;
}

/**
 * Arrondit à une valeur « ronde » : 1, 2 ou 5 fois une puissance de dix.
 *
 * C'est l'échelle que l'œil lit sans effort — 50 k, 100 k, 200 k — et celle
 * qui fait tomber les graduations sur des chiffres qu'on peut annoncer.
 */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Nombre de graduations visées sur l'axe des prix. */
const PRICE_TICKS = 4;

/** Bande par défaut, en multiples du cours : de quoi tracer vers le haut comme vers le bas. */
const DEFAULT_BAND = { low: 0.6, high: 1.6 } as const;

/**
 * Le repère d'un pari : sa durée, et une bande de prix qui contient tout.
 *
 * La bande n'est plus figée à 80 k – 200 k. Elle est calculée à partir de ce
 * qu'on va afficher — le cours réel **et** les tracés du club — avec une marge
 * de chaque côté, puis arrondie à des valeurs rondes. Sur dix ans, un membre
 * qui trace un bitcoin à 2 M$ doit voir sa courbe, pas la voir coupée au bord.
 *
 * `band` est un plancher, en multiples du cours du jour : la bande couvre
 * toujours au moins cet intervalle, pour qu'on puisse viser loin même quand
 * rien n'est encore tracé (voir `bandFor` dans `horizons.ts`).
 *
 * Puisque les tracés sont stockés en prix, la bande est un pur choix
 * d'affichage : deux membres qui la calculeraient différemment verraient la
 * même chose à une échelle près, sans que rien ne se décale entre eux.
 */
export function frameFor(
  days: number,
  prices: readonly number[],
  spot: number,
  band: { low: number; high: number } = DEFAULT_BAND,
): Frame {
  const finite = prices.filter((price) => Number.isFinite(price) && price > 0);
  const anchor = Number.isFinite(spot) && spot > 0 ? spot : 100_000;

  // Marge de 15 % autour des données : une courbe qui touche le bord du cadre
  // se lit comme coupée. La bande plancher, elle, n'en prend pas — elle est
  // déjà une marge.
  const low = Math.min(anchor * band.low, ...finite.map((price) => price * 0.85));
  const high = Math.max(anchor * band.high, ...finite.map((price) => price * 1.15), low * 1.2);

  const step = niceStep((high - low) / PRICE_TICKS);
  const pmin = Math.max(0, Math.floor(low / step) * step);
  const pmax = Math.ceil(high / step) * step;

  return { days: days > 0 ? days : DAYS, pmin, pmax: pmax > pmin ? pmax : pmin + step };
}

/** Les graduations de l'axe des prix, sur des valeurs rondes. */
export function priceTicks(frame: Frame): number[] {
  const step = niceStep((frame.pmax - frame.pmin) / PRICE_TICKS);
  const ticks: number[] = [];
  for (let value = Math.ceil(frame.pmin / step) * step; value <= frame.pmax; value += step) {
    ticks.push(value);
  }
  return ticks;
}

/** `120 000` → `120k`, `1 500 000` → `1,5M` — ce qui tient à gauche du repère. */
export function compactPrice(price: number): string {
  if (price >= 1_000_000) {
    const m = price / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace('.', ',')}M`;
  }
  if (price >= 1_000) return `${Math.round(price / 1_000)}k`;
  return `${Math.round(price)}`;
}

/** Un tracé stocké, projeté sur la toile. */
export function toCanvas(points: readonly PricePoint[], frame: Frame): Point[] {
  return points.map(([day, price]) => [x(day, frame), y(price, frame)] as Point);
}

/** Un tracé de la toile, ramené à ce qu'on enregistre. */
export function toPrices(points: readonly Point[], frame: Frame): PricePoint[] {
  return points.map(([px, py]) => [dayAt(px, frame), priceAt(py, frame)] as PricePoint);
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ramène un point du geste dans le repère de dessin.
 *
 * Les bornes horizontales se resserrent sur la fenêtre du pari : on ne trace
 * pas le passé — il est déjà écrit par la courbe réelle.
 */
export function clampToCanvas(px: number, py: number, bounds: DrawBounds = DRAW_BOUNDS): Point {
  return [
    clampValue(px, bounds.minX, bounds.maxX),
    clampValue(py, bounds.minY, bounds.maxY),
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

/**
 * Deux tracés sont-ils identiques, point pour point ?
 *
 * Comparer les références ne marche pas : le tracé rechargé depuis la base est
 * un tableau neuf, et il serait signalé comme modifié dès l'ouverture de
 * l'écran — donc un bouton « déposer » allumé sans qu'on ait rien fait.
 */
export function samePath(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, i) => point[0] === b[i]![0] && point[1] === b[i]![1]);
}

/**
 * Écart absolu moyen entre une prédiction et la courbe réelle, en % (README §7.3).
 * Les deux séries sont ré-échantillonnées sur les jours communs par
 * interpolation linéaire ; renvoie `null` si le recouvrement est vide.
 */
export function meanAbsoluteGap(
  prediction: readonly PricePoint[],
  actual: readonly PricePoint[],
): number | null {
  if (prediction.length < 2 || actual.length < 2) return null;

  const from = Math.max(prediction[0]![0], actual[0]![0]);
  const to = Math.min(prediction[prediction.length - 1]![0], actual[actual.length - 1]![0]);
  if (!(to > from)) return null;

  const SAMPLES = 64;
  let total = 0;
  let counted = 0;

  for (let i = 0; i <= SAMPLES; i++) {
    const at = from + ((to - from) * i) / SAMPLES;
    const predicted = interpolateY(prediction, at);
    const real = interpolateY(actual, at);
    if (real === 0) continue;
    total += Math.abs((predicted - real) / real) * 100;
    counted += 1;
  }

  return counted === 0 ? null : total / counted;
}

/**
 * Seconde composante de la polyligne à la première demandée.
 *
 * Générique aux deux espaces : une ordonnée de toile pour des `Point`, un prix
 * pour des `PricePoint`. C'est la même interpolation, et la dupliquer ferait
 * diverger deux copies au premier correctif.
 */
export function interpolateY(points: readonly (readonly [number, number])[], atX: number): number {
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
