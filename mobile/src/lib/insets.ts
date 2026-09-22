/**
 * Ce qu'on garde de la zone système sous l'écran.
 *
 * Deux corrections successives, et il faut les distinguer.
 *
 * La première : la barre d'onglets réservait `24 + insets.bottom`, soit deux
 * fois la même chose — les 24 de la maquette dessinaient la barre d'accueil que
 * l'inset système mesure déjà. Mesuré sur une capture du club, la barre
 * atteignait 131 pt, un huitième de l'écran pour trois mots.
 *
 * La seconde : même corrigée, elle restait trop haute. L'inset système
 * (34 pt sur un iPhone à barre d'accueil) est calibré pour des **zones
 * tactiles**, qu'on ne veut pas voir happées par le geste de retour à
 * l'accueil. Trois libellés de texte n'ont pas ce problème : ils n'ont besoin
 * que de ne pas passer *sous* l'indicateur, qui est un trait de 5 pt situé à
 * une dizaine de points du bord.
 */

/** Ce que la barre d'accueil occupe réellement, indicateur compris. */
export const HOME_INDICATOR_SLACK = 10;

/** Au-delà, on réserve de la place pour rien. */
export const MAX_BOTTOM_INSET = 24;

/** Sur un écran sans zone système, il faut quand même de l'air sous le texte. */
export const MIN_BOTTOM_PADDING = 10;

/**
 * La marge à réserver sous la barre d'onglets.
 *
 * La borne haute n'est pas de la superstition : dans une PWA autonome iOS,
 * `env(safe-area-inset-bottom)` remonte parfois bien plus que les 34 pt de la
 * barre d'accueil, et une marge décorative ne doit pas suivre une valeur
 * aberrante.
 */
export function bottomInset(reported: number): number {
  if (!Number.isFinite(reported)) return MIN_BOTTOM_PADDING;
  const needed = reported - HOME_INDICATOR_SLACK;
  return Math.min(Math.max(needed, MIN_BOTTOM_PADDING), MAX_BOTTOM_INSET);
}
