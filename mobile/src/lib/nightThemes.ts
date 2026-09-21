/**
 * Thèmes d'une soirée.
 *
 * Le club en organise trois sortes, et une même soirée peut en porter
 * plusieurs — une Crypto Night qui finit en Vibe Coding Night est une soirée,
 * pas deux.
 *
 * La liste ci-dessous n'est **pas fermée** : elle sert d'aide à la saisie, pas
 * de validation. Un club qui invente une Pizza Night ne doit pas attendre une
 * migration, et la base ne connaît que du texte.
 */
export const KNOWN_THEMES = ['Crypto Night', 'Stock Night', 'Vibe Coding Night'] as const;

/** Bornes de la contrainte `events_themes_check`. */
export const MAX_THEMES = 5;
export const MAX_THEME_LENGTH = 40;

/**
 * Nettoie une liste saisie : coupe les blancs, écarte les vides et les
 * doublons — la casse ne départage pas, « crypto night » et « Crypto Night »
 * sont le même thème — puis borne au maximum accepté par la base.
 *
 * L'ordre de saisie est conservé : c'est celui qu'on lira sur la carte.
 */
export function normalizeThemes(themes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of themes) {
    const theme = raw.trim().slice(0, MAX_THEME_LENGTH);
    if (!theme) continue;
    const key = theme.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(theme);
    if (out.length === MAX_THEMES) break;
  }

  return out;
}

/** Ce qui s'affiche en surtitre d'une carte : `CRYPTO NIGHT · STOCK NIGHT`. */
export function formatThemes(themes: readonly string[]): string {
  return themes.join(' · ');
}

/**
 * Les thèmes à proposer : ceux du club, puis ceux que les membres ont inventés.
 *
 * Un thème créé une fois doit pouvoir se reprendre d'un doigt la fois
 * suivante, sans le retaper — sinon « Pizza Night » et « pizza night »
 * coexistent au bout d'un mois.
 */
export function suggestThemes(existing: readonly string[]): string[] {
  return normalizeThemes([...KNOWN_THEMES, ...existing]).slice(0, 12);
}
