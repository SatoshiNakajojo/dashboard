/**
 * Les liens qu'un membre partage au club.
 *
 * Un GitHub, une adresse de dépôt BTC, un MetaMask. Deux natures très
 * différentes derrière le même mot « lien » : les unes s'ouvrent, les autres se
 * copient. Ce module range ça avant l'écran, parce que c'est là que sont les
 * cas limites — pas dans l'affichage.
 *
 * Règle de sécurité, et elle est la raison d'être du module : **on n'ouvre que
 * `http:` et `https:`**. Une entrée `javascript:` collée par quelqu'un, dans un
 * champ que six autres membres verront, exécuterait du code dans leur app. Une
 * adresse de portefeuille n'est pas une URL et ne s'ouvre pas : elle se copie.
 */

export interface ProfileLink {
  label: string;
  url: string;
}

/** La contrainte `profiles_links_check` refuse au-delà. */
export const MAX_LINKS = 8;
export const MAX_LABEL = 24;
export const MAX_URL = 200;

/** Les libellés proposés — une aide à la saisie, pas une liste fermée. */
export const SUGGESTED_LABELS = [
  'GitHub',
  'X',
  'Bitcoin',
  'MetaMask',
  'Lightning',
  'Site',
] as const;

/**
 * Ce qu'une entrée est vraiment.
 *
 * `web` s'ouvre dans un navigateur ; `address` se copie dans le presse-papier.
 * Tout ce qui n'est ni l'un ni l'autre — `javascript:`, `data:`, `file:` — est
 * traité comme une adresse : affiché tel quel, jamais ouvert.
 */
export type LinkKind = 'web' | 'address';

export function linkKind(url: string): LinkKind {
  const trimmed = url.trim();
  if (/^https?:\/\/\S/i.test(trimmed)) return 'web';
  // Un domaine saisi sans schéma reste un lien web : `github.com/jc` est une
  // faute de frappe courante, pas une adresse de portefeuille.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(trimmed)) return 'web';
  return 'address';
}

/**
 * L'adresse réellement ouvrable, ou `null`.
 *
 * `null` n'est pas un échec : c'est une adresse de portefeuille, qui n'a pas à
 * s'ouvrir. L'appelant propose alors la copie.
 */
export function openableUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\/\S/i.test(trimmed)) return trimmed;
  if (linkKind(trimmed) === 'web') return `https://${trimmed}`;
  return null;
}

/**
 * Range une liste avant de l'enregistrer.
 *
 * Retire les entrées vides, coupe aux bornes de la base, déduplique sur l'URL
 * — deux fois la même adresse sous deux libellés n'apprend rien — et plafonne.
 * Ne **jamais** lever : une saisie bancale se nettoie, elle ne bloque pas
 * l'enregistrement du reste du profil.
 */
export function normalizeLinks(entries: readonly ProfileLink[]): ProfileLink[] {
  const out: ProfileLink[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const label = (entry?.label ?? '').trim().slice(0, MAX_LABEL);
    const url = (entry?.url ?? '').trim().slice(0, MAX_URL);
    // Une adresse sans libellé garde un sens ; un libellé sans adresse, non.
    if (!url) continue;

    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ label: label || 'Lien', url });
    if (out.length >= MAX_LINKS) break;
  }

  return out;
}

/**
 * Relit ce qui vient de la base.
 *
 * `links` est du jsonb : la contrainte garantit la forme des lignes écrites
 * depuis l'app, mais une ligne plus ancienne, ou écrite autrement, peut être
 * n'importe quoi. On ne fait donc jamais confiance à la forme.
 */
export function parseLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const entries: ProfileLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { label, url } = item as Record<string, unknown>;
    if (typeof url !== 'string') continue;
    entries.push({ label: typeof label === 'string' ? label : '', url });
  }
  return normalizeLinks(entries);
}

/** L'adresse raccourcie qu'on affiche — une clé BTC fait 42 caractères. */
export function shortenUrl(url: string, max = 28): string {
  const trimmed = url.trim().replace(/^https?:\/\//i, '');
  if (trimmed.length <= max) return trimmed;
  // Milieu élidé plutôt que fin coupée : sur une adresse de portefeuille, les
  // derniers caractères sont ceux qu'on vérifie du regard.
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${trimmed.slice(0, head)}…${trimmed.slice(trimmed.length - tail)}`;
}
