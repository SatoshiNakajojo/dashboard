/**
 * Les mesures d'écran prises par le correctif de la bande basse
 * (`scripts/viewport-shim.mjs`), telles qu'il les laisse dans la page.
 *
 * Le défaut ne se voit que sur un iPhone, app installée : aucun outil de
 * développement n'y est ouvert. Le panneau « À propos » affiche donc ces
 * chiffres en petit, pour qu'une capture d'écran suffise à comprendre ce qui
 * s'est passé.
 */

export interface ViewportInfo {
  /** App installée sur l'écran d'accueil d'un iPhone ou d'un iPad. */
  standalone: boolean;
  /** Hauteur de l'écran, en points. */
  screen: number;
  /** `innerHeight`, telle qu'iOS la déclare. */
  inner: number;
  /** Témoin : une sonde `fixed` à 100 % — `null` avant que la page existe. */
  layout: number | null;
  /** Ce que le correctif ajoute sous la page. */
  gap: number;
  /** Nombre de mesures prises depuis l'ouverture. */
  fits: number;
  /** Nombre de fois où la bande a été posée ou retirée. */
  toggles: number;
  /** Le coupe-circuit a figé l'état : la page basculait trop souvent. */
  frozen: boolean;
}

export function viewportInfo(): ViewportInfo | null {
  if (typeof window === 'undefined') return null;
  const info = (window as unknown as { __clubViewport?: ViewportInfo }).__clubViewport;
  return info ?? null;
}

/** `ÉCRAN 844 · INNER 797 · PAGE 797 · CALE 47 · 6 MESURES · 1 BASCULE`. */
export function describeViewport(info: ViewportInfo): string {
  return [
    `ÉCRAN ${info.screen}`,
    `INNER ${info.inner}`,
    `PAGE ${info.layout ?? '—'}`,
    `CALE ${info.gap}`,
    `${info.fits} ${info.fits > 1 ? 'MESURES' : 'MESURE'}`,
    `${info.toggles} ${info.toggles > 1 ? 'BASCULES' : 'BASCULE'}`,
    ...(info.frozen ? ['FIGÉ'] : []),
  ].join(' · ');
}
