/**
 * L'animation de l'écran de chargement : des blocs qui se minent.
 *
 * Une barre de progression mentirait — on ne sait pas combien de temps met un
 * bundle de 2,7 Mo sur le réseau de Nouméa, et une barre qui reste à 80 %
 * donne l'impression d'un plantage. Des blocs qui se remplissent en boucle ne
 * promettent rien : ils disent seulement que ça travaille.
 *
 * Module pur, parce que c'est le calcul qui a des cas limites — un temps
 * négatif si l'horloge recule, une boucle qui doit repartir proprement — pas
 * le dessin.
 */

/** Huit : assez pour lire une progression, assez court pour boucler vite. */
export const BLOCK_COUNT = 8;

/** Durée de minage d'un bloc. Une chaîne complète fait donc 8 × 150 ms. */
export const BLOCK_MS = 150;

/** Un temps de respiration une fois la chaîne pleine, avant de repartir. */
export const PAUSE_MS = 450;

export const CYCLE_MS = BLOCK_COUNT * BLOCK_MS + PAUSE_MS;

/**
 * Combien de blocs sont minés à cet instant du cycle.
 *
 * Renvoie toujours un entier de 0 à `BLOCK_COUNT`. Pendant la pause, la chaîne
 * reste pleine — c'est ce qui la rend lisible, une chaîne qui se viderait
 * aussitôt pleine ne se verrait jamais complète.
 */
export function minedAt(elapsedMs: number, count: number = BLOCK_COUNT): number {
  // Une horloge qui recule (changement d'heure, `performance.now` remis à
  // zéro) ne doit pas rendre un nombre négatif de blocs.
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const cycle = count * BLOCK_MS + PAUSE_MS;
  const position = elapsedMs % cycle;
  return Math.min(count, Math.floor(position / BLOCK_MS));
}
