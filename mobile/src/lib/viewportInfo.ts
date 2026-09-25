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
  /** Hauteur réellement donnée à la page. */
  layout: number;
  /** Ce que le correctif ajoute sous la page. */
  gap: number;
  /** Nombre de mesures prises depuis l'ouverture. */
  fits: number;
}

export function viewportInfo(): ViewportInfo | null {
  if (typeof window === 'undefined') return null;
  const info = (window as unknown as { __clubViewport?: ViewportInfo }).__clubViewport;
  return info ?? null;
}

/** `ÉCRAN 844 · PAGE 797 · INNER 797 · CALE 47 · 6 MESURES`. */
export function describeViewport(info: ViewportInfo): string {
  return [
    `ÉCRAN ${info.screen}`,
    `PAGE ${info.layout}`,
    `INNER ${info.inner}`,
    `CALE ${info.gap}`,
    `${info.fits} ${info.fits > 1 ? 'MESURES' : 'MESURE'}`,
  ].join(' · ');
}
