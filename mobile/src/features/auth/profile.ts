/**
 * Ce qu'un membre devient au moment où il entre — initiales et couleur.
 *
 * Module volontairement pur : aucune dépendance React Native ni Supabase, pour
 * que ces deux décisions — les seules de l'amorçage qui aient des cas limites —
 * soient testables directement.
 */

/** Palette du club, dans l'ordre d'attribution (README §4.3). */
export const PALETTE = [
  '#E8A33D',
  '#6E9A78',
  '#8C7BA8',
  '#B3574F',
  '#5B8A9A',
  '#C9A227',
  '#F2EBDD',
] as const;

/**
 * `Jean-Marc Dupont` → `JD`.
 *
 * Deux lettres majuscules sans accent, toujours : c'est la contrainte
 * `profiles.initials` de la base, et un avatar vide n'existe pas dans ce design.
 */
export function initialsFrom(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    // Un prénom composé est **un** mot : `Jean-Marc Dupont` donne `JD`, pas `JM`.
    // Le trait d'union et l'apostrophe soudent les lettres, ils ne séparent pas.
    .replace(/['’‘-]/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'XX';
  if (words.length === 1) return (words[0]!.slice(0, 2) + 'X').slice(0, 2);
  return words[0]![0]! + words[1]![0]!;
}

/**
 * Première couleur libre de la palette.
 *
 * La couleur d'un membre l'identifie partout — avatar, courbe de l'Oracle,
 * pastille de potluck : deux membres de la même couleur rendraient l'Oracle
 * illisible. Au-delà de sept membres la palette est épuisée et on recycle,
 * ce qui est le signal qu'il faut l'étendre plutôt qu'un plantage.
 */
export function pickColor(taken: readonly string[]): string {
  const used = new Set(taken.map((color) => color.toLowerCase()));
  return PALETTE.find((color) => !used.has(color.toLowerCase())) ?? PALETTE[0];
}

/**
 * Couleur de repli quand les couleurs déjà prises sont inconnues.
 *
 * Le cas arrive si `taken_profile_colors()` manque — migration non appliquée —
 * ou si l'appel échoue. Retomber sur `PALETTE[0]` donnerait alors la **même**
 * couleur à tout le club, ce qui est précisément le défaut qu'on vient de
 * corriger : un repli ne doit pas reconstituer la panne.
 *
 * L'identifiant du membre sert de graine. Ce n'est pas une garantie d'unicité,
 * seulement la différence entre « peut-être une collision » et « sept avatars
 * identiques, à coup sûr ».
 */
export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  return PALETTE[hash % PALETTE.length]!;
}
