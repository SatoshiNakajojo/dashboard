/**
 * Les groupes Facebook du club.
 *
 * Une messagerie interne a été envisagée, puis écartée : le club discute déjà
 * dans trois groupes Facebook, un par sorte de soirée. Refaire une messagerie,
 * c'était dédoubler la conversation — et perdre la moitié des messages entre
 * les deux. L'app pointe donc vers les groupes, là où les membres sont déjà.
 *
 * **Pour renseigner un lien**, collez l'adresse du groupe dans `url`, telle que
 * Facebook l'affiche (`https://www.facebook.com/groups/…`). Un groupe sans
 * adresse reste listé, marqué « lien à venir » : il ne s'ouvre pas.
 */

import type { KNOWN_THEMES } from './nightThemes';
import { openableUrl } from './profileLinks';

export interface ClubChannel {
  key: 'bitcoin' | 'stocks' | 'vibe';
  name: string;
  /** La soirée dont on parle dans ce groupe. */
  theme: (typeof KNOWN_THEMES)[number];
  /** Adresse du groupe. Vide tant qu'elle n'est pas renseignée. */
  url: string;
}

export const CLUB_CHANNELS: readonly ClubChannel[] = [
  { key: 'bitcoin', name: 'Bitcoin Club', theme: 'Crypto Night', url: '' },
  { key: 'stocks', name: 'Stocks Club', theme: 'Stock Night', url: '' },
  { key: 'vibe', name: 'Vibe-Coding Club', theme: 'Vibe Coding Night', url: '' },
];

/**
 * L'adresse à ouvrir, ou `null`.
 *
 * Seules les adresses web s'ouvrent : c'est la même porte que pour les liens
 * de profil, et elle reste fermée à `javascript:` et consorts.
 */
export function channelUrl(channel: Pick<ClubChannel, 'url'>): string | null {
  const url = channel.url.trim();
  if (!url) return null;
  const openable = openableUrl(url);
  return openable && /^https:\/\//i.test(openable) ? openable : null;
}
