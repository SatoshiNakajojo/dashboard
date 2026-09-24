/**
 * Quand le bandeau doit-il dire `HORS LIGNE` ?
 *
 * Il le disait dès qu'une actualisation échouait. Or CoinGecko limite l'API
 * publique à quelques appels par minute, et l'app en faisait plusieurs à la
 * fois — un bandeau par onglet, plus les calls, plus l'Oracle. Il suffisait
 * qu'un seul se fasse refuser pour qu'un onglet affiche `HORS LIGNE` pendant
 * que son voisin, servi une seconde plus tôt, montrait la variation du jour.
 *
 * Un refus ponctuel n'est pas une panne. Le bandeau ne bascule qu'après
 * plusieurs minutes **sans aucune** réponse : à ce stade, le prix affiché est
 * vraiment trop vieux pour être lu comme le cours du moment.
 */

/** Au-delà, le dernier cours reçu n'est plus « le cours ». */
export const OFFLINE_AFTER_MS = 3 * 60_000;

/**
 * Vrai si le bandeau doit afficher `HORS LIGNE`.
 *
 * `fetchedAt` à zéro : aucun cours n'a jamais été reçu, celui qu'on montre est
 * le repli de démonstration.
 */
export function isOffline(fetchedAt: number, now: number): boolean {
  if (!(fetchedAt > 0)) return true;
  return now - fetchedAt > OFFLINE_AFTER_MS;
}
