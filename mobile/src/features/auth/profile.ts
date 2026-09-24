/**
 * Ce qu'un membre devient au moment où il entre — initiales et couleur.
 *
 * Module volontairement pur : aucune dépendance React Native ni Supabase, pour
 * que ces deux décisions — les seules de l'amorçage qui aient des cas limites —
 * soient testables directement.
 */

/**
 * La palette du club : quatorze couleurs, chacune avec son nom.
 *
 * Les sept premières sont celles du design, dans leur ordre d'attribution
 * (README §4.3) : un nouveau membre reçoit la première libre. Les sept
 * suivantes n'existent que pour qu'on puisse **choisir** — avec sept couleurs
 * pour sept membres, il n'y aurait rien à choisir.
 *
 * Choisies pour rester distinctes deux à deux (même les plus proches, Canard
 * et Ciel, se séparent nettement sur une courbe de l'Oracle), lisibles sous
 * les initiales sombres d'un avatar, et visibles sur le fond encre. Les tests
 * vérifient ces trois propriétés : une couleur ajoutée qui les casse échoue.
 */
export const COLORS = [
  { hex: '#E8903D', name: 'Or' },
  { hex: '#6E9A78', name: 'Sauge' },
  { hex: '#8C7BA8', name: 'Violette' },
  { hex: '#B3574F', name: 'Brique' },
  { hex: '#5B8A9A', name: 'Canard' },
  { hex: '#C9A227', name: 'Moutarde' },
  { hex: '#F2EBDD', name: 'Ivoire' },
  { hex: '#C7788F', name: 'Rose' },
  { hex: '#9AA35C', name: 'Olive' },
  { hex: '#D4B483', name: 'Sable' },
  { hex: '#E07A5F', name: 'Corail' },
  { hex: '#9CCFB0', name: 'Menthe' },
  { hex: '#B9774A', name: 'Cuivre' },
  { hex: '#7FA6C9', name: 'Ciel' },
] as const;

/** Les couleurs seules, dans l'ordre d'attribution. */
export const PALETTE = COLORS.map((color) => color.hex);

/** Le nom d'une couleur de la palette, ou `null` pour une couleur d'ailleurs. */
export function colorName(hex: string): string | null {
  return COLORS.find((color) => color.hex.toLowerCase() === hex.toLowerCase())?.name ?? null;
}

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
 * illisible. Au-delà de quatorze membres la palette est épuisée et on
 * recycle, ce qui est le signal qu'il faut l'étendre plutôt qu'un plantage.
 */
export function pickColor(taken: readonly string[]): string {
  const used = new Set(taken.map((color) => color.toLowerCase()));
  return PALETTE.find((color) => !used.has(color.toLowerCase())) ?? PALETTE[0]!;
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
