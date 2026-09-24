/**
 * Choisir sa couleur : laquelle est libre, laquelle est prise, et par qui.
 *
 * La couleur d'un membre l'identifie partout — son avatar, ses courbes dans
 * l'Oracle, ses marques sur le potluck. Deux membres de la même couleur, et
 * l'Oracle devient illisible. Une couleur déjà portée par un autre membre ne
 * se choisit donc pas ; la base le refuse aussi (`profiles_color_guard`).
 *
 * Module pur, testable sans rendu.
 */

import { COLORS } from '@/features/auth/profile';
import type { Member } from '@/types/domain';

export interface ColorChoice {
  hex: string;
  name: string;
  /** Le membre qui la porte déjà, s'il y en a un — et si ce n'est pas moi. */
  takenBy: Member | null;
}

export function colorChoices(members: readonly Member[], meId: string): ColorChoice[] {
  return COLORS.map(({ hex, name }) => ({
    hex,
    name,
    takenBy:
      members.find(
        (member) => member.id !== meId && member.color.toLowerCase() === hex.toLowerCase(),
      ) ?? null,
  }));
}
