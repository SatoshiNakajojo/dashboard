/**
 * Ce qu'on garde de la zone système sous l'écran.
 *
 * La barre d'onglets réservait `24 + insets.bottom`, et c'était deux fois la
 * même chose : les 24 de la maquette dessinaient la barre d'accueil que l'inset
 * système mesure déjà. Mesuré sur la capture du club, la barre atteignait
 * 131 pt — un huitième de l'écran pour trois mots.
 */

/** Rien ne réclame légitimement plus que la barre d'accueil d'un iPhone. */
export const MAX_BOTTOM_INSET = 34;

/** Sur un écran sans zone système, il faut quand même de l'air sous le texte. */
export const MIN_BOTTOM_PADDING = 12;

/**
 * La marge à réserver sous la barre d'onglets.
 *
 * La borne haute n'est pas de la superstition : dans une PWA autonome iOS,
 * `env(safe-area-inset-bottom)` remonte parfois bien plus que les 34 pt de la
 * barre d'accueil, et une marge décorative ne doit pas suivre une valeur
 * aberrante. Au pire on frôle la zone système de quelques points ; sans borne,
 * on reperd le huitième d'écran qu'on vient de récupérer.
 */
export function bottomInset(reported: number): number {
  if (!Number.isFinite(reported)) return MIN_BOTTOM_PADDING;
  return Math.min(Math.max(reported, MIN_BOTTOM_PADDING), MAX_BOTTOM_INSET);
}
