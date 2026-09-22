/**
 * À quel point un tracé colle au cours réel, en pourcentage.
 *
 * `meanAbsoluteGap` répond déjà à la question, mais à l'envers : elle donne
 * l'**erreur** moyenne, en pour cent du prix réel. Un membre lit mieux « 87 %
 * de justesse » que « 13 % d'écart », et c'est la même mesure.
 *
 * Ce n'est volontairement **pas** un coefficient de corrélation. Une
 * corrélation mesure l'accord de *forme* : un tracé parfaitement parallèle au
 * cours, mais 40 000 $ au-dessus, obtiendrait 100 %. Dans un club qui parie sur
 * des niveaux de prix, ce serait un mensonge. La justesse mesure la distance,
 * ce qui est la question posée.
 *
 * Elle se lit ainsi :
 *
 *   • **100 %** — le tracé est confondu avec le cours ;
 *   • **90 %** — on s'est trompé de 10 % en moyenne sur la période écoulée ;
 *   • **0 %** — on s'est trompé d'au moins 100 %, c'est-à-dire du double ou de
 *     la moitié du prix. En dessous, la nuance n'intéresse plus personne.
 */

import { meanAbsoluteGap, type Point } from './chart';

/** En dessous, la précision d'un tracé au doigt n'a plus de sens. */
export const PERFECT = 100;

/**
 * La justesse d'un tracé sur la portion déjà écoulée.
 *
 * `null` tant qu'il n'y a rien à comparer : un tracé de moins de deux points,
 * ou un cours réel qui n'a pas encore rejoint le début du tracé. Renvoyer zéro
 * dans ce cas se lirait comme « vous vous trompez complètement », alors qu'on
 * ne sait simplement pas encore.
 */
export function accuracyPercent(
  prediction: readonly Point[],
  actual: readonly Point[],
): number | null {
  const error = meanAbsoluteGap(prediction, actual);
  if (error === null) return null;
  // Borné en bas : une erreur de 300 % donnerait -200, ce qui n'est pas une
  // justesse. Borné en haut par construction, l'erreur n'étant jamais négative.
  return Math.max(0, Math.min(PERFECT, PERFECT - error));
}

/**
 * Le qualificatif qui accompagne le chiffre.
 *
 * Trois paliers, pas cinq : c'est un jeu entre sept personnes, pas une notation
 * de risque. Les seuils sont ici et nulle part ailleurs, pour que le mot et la
 * couleur ne puissent pas diverger du nombre.
 */
export const ACCURACY_TIERS = [
  { min: 90, label: 'DANS LE MILLE' },
  { min: 70, label: 'PAS LOIN' },
  { min: 0, label: 'À CÔTÉ' },
] as const;

export function accuracyLabel(percent: number | null): string | null {
  if (percent === null) return null;
  return ACCURACY_TIERS.find((tier) => percent >= tier.min)?.label ?? null;
}
