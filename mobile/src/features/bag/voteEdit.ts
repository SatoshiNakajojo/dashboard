/**
 * Voter, et changer d'avis.
 *
 * Tant que la fenêtre de vote est ouverte — 72 h après la publication du
 * call —, un vote se modifie : on change de camp, ou seulement de phrase.
 * Ensuite il est verrouillé ; la base le garantit (`ticker_votes_guard`).
 *
 * Une règle de bon sens : changer de camp demande une **nouvelle** phrase. La
 * raison d'un vote bull ne justifie pas un vote bear ; la garder, c'est
 * afficher sous la carte un bear qui dit « j'y crois ». Revenir à son camp
 * d'origine rend la phrase d'origine.
 *
 * Module pur.
 */

import type { Vote } from '@/types/domain';

/** La même limite que la contrainte `ticker_votes_reason_length`. */
export const REASON_MIN = 3;
export const REASON_MAX = 140;

export interface CurrentVote {
  side: Vote;
  reason: string | null;
}

/** La phrase de départ, quand la feuille s'ouvre sur un camp. */
export function initialReason(current: CurrentVote | null, side: Vote): string {
  return current && current.side === side ? (current.reason ?? '') : '';
}

/**
 * La phrase après un changement de camp dans la feuille.
 *
 * On ne touche qu'à ce que le membre n'a pas écrit lui-même : la phrase
 * d'origine s'efface en quittant son camp et revient en y retournant ; une
 * phrase en cours de rédaction, elle, reste.
 */
export function reasonAfterSwitch(
  current: CurrentVote | null,
  from: Vote,
  to: Vote,
  reason: string,
): string {
  if (!current || from === to) return reason;
  const original = current.reason ?? '';
  if (from === current.side && reason === original) return '';
  if (to === current.side && reason.trim() === '') return original;
  return reason;
}

/** Ce que dit le bouton. */
export function submitLabel(current: CurrentVote | null, side: Vote): string {
  if (!current) return side === 'bull' ? 'VOTER BULL' : 'VOTER BEAR';
  if (current.side !== side) return side === 'bull' ? 'PASSER BULL' : 'PASSER BEAR';
  return 'METTRE À JOUR';
}

/** Un vote qui part : une phrase suffisante, et quelque chose de changé. */
export function canSubmit(current: CurrentVote | null, side: Vote, reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) return false;
  if (current && current.side === side && trimmed === (current.reason ?? '').trim())
    return false;
  return true;
}

/** Ce que la carte dit de mon vote, s'il y en a un. */
export function myVoteStatus(
  myVote: Vote | null,
  votesOpen: boolean,
): { label: string; editable: boolean } | null {
  if (!myVote) return null;
  return { label: `VOTRE VOTE : ${myVote.toUpperCase()}`, editable: votesOpen };
}
