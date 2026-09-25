/**
 * Contre-propositions de lieu : la règle, telle que l'app l'affiche.
 *
 * La base tranche (`event_proposals_tally`, migration
 * `20261003090000_event_proposals`) : dès que les **pour** atteignent la
 * majorité absolue du club, la soirée change de lieu ; dès que les **contre**
 * l'atteignent, la proposition tombe. Ce module ne décide rien. Il dit où en
 * est le vote, avec la même arithmétique, pour qu'on lise « encore 1 voix »
 * plutôt qu'un simple décompte.
 *
 * Module pur.
 */

import type { EventProposal, ProposalChoice, ProposalVote } from '@/types/domain';

/** La majorité absolue : 4 sur 7 — la même que `club_majority()`. */
export function majorityOf(clubSize: number): number {
  return Math.floor(Math.max(1, clubSize) / 2) + 1;
}

export interface Tally {
  for: number;
  against: number;
}

export function tally(votes: readonly ProposalVote[], proposalId: string): Tally {
  let pour = 0;
  let contre = 0;
  for (const vote of votes) {
    if (vote.proposalId !== proposalId) continue;
    if (vote.choice === 'for') pour += 1;
    else contre += 1;
  }
  return { for: pour, against: contre };
}

export function myChoice(
  votes: readonly ProposalVote[],
  proposalId: string,
  userId: string | null,
): ProposalChoice | null {
  if (!userId) return null;
  return (
    votes.find((vote) => vote.proposalId === proposalId && vote.userId === userId)?.choice ??
    null
  );
}

/** `3 POUR · 1 CONTRE · ENCORE 1 VOIX POUR CHANGER DE LIEU`. */
export function tallyLine(count: Tally, clubSize: number): string {
  const needed = majorityOf(clubSize) - count.for;
  const head = `${count.for} POUR · ${count.against} CONTRE`;
  if (needed <= 0) return head;
  return `${head} · ENCORE ${needed} VOIX POUR CHANGER DE LIEU`;
}

/**
 * Peut-on proposer un autre lieu ? Pas pour le créateur — il modifie sa
 * soirée —, pas une soirée commencée, et une proposition ouverte à la fois.
 */
export function canPropose(
  event: { createdBy: string | null; startsAt: string },
  proposals: readonly EventProposal[],
  userId: string | null,
  now: number = Date.now(),
): boolean {
  if (!userId || event.createdBy === userId) return false;
  if (!(Date.parse(event.startsAt) > now)) return false;
  return !proposals.some(
    (proposal) => proposal.userId === userId && proposal.status === 'open',
  );
}

/** Les ouvertes d'abord, puis les tranchées, les plus récentes en tête. */
export function orderProposals(proposals: readonly EventProposal[]): EventProposal[] {
  const rank = (proposal: EventProposal) => (proposal.status === 'open' ? 0 : 1);
  return [...proposals].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt),
  );
}
