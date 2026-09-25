/**
 * Contre-propositions de lieu : la règle, telle que l'app l'affiche.
 *
 * La base tranche (`event_proposal_settle`, migration
 * `20261005090000_proposal_participants`). Votent les **participants** de la
 * soirée : ceux qui ont dit « Je viens », l'organisateur, et l'auteur de la
 * proposition. Dès que les pour atteignent leur majorité — ou que
 * l'organisateur vote pour —, la soirée change de lieu ; dès que les contre
 * l'atteignent, la proposition tombe.
 *
 * Ce module ne décide rien en production : il dit où en est le vote, avec la
 * même arithmétique, pour qu'on lise « encore 1 voix ». La démo, sans base,
 * s'en sert pour trancher.
 *
 * Module pur.
 */

import type { EventProposal, ProposalChoice, ProposalVote } from '@/types/domain';

/** Ce qu'il faut savoir de la soirée pour compter les voix. */
export interface VoteContext {
  attendeeIds: readonly string[];
  /** L'organisateur : son accord suffit. */
  organizerId: string | null;
}

/** Les participants d'une proposition : présents, organisateur, auteur. */
export function electorate(context: VoteContext, proposerId: string): Set<string> {
  const out = new Set(context.attendeeIds);
  if (context.organizerId) out.add(context.organizerId);
  out.add(proposerId);
  return out;
}

/** La majorité : 2 sur 3, 3 sur 5, 4 sur 7 — la même que la base. */
export function majorityOf(participants: number): number {
  return Math.floor(Math.max(1, participants) / 2) + 1;
}

export interface Tally {
  for: number;
  against: number;
  /** Combien de participants votent. */
  participants: number;
  /** L'organisateur a voté pour. */
  hostFor: boolean;
}

/** Le décompte d'une proposition — seules comptent les voix des participants. */
export function tally(
  votes: readonly ProposalVote[],
  proposal: Pick<EventProposal, 'id' | 'userId'>,
  context: VoteContext,
): Tally {
  const voters = electorate(context, proposal.userId);
  let pour = 0;
  let contre = 0;
  let hostFor = false;
  for (const vote of votes) {
    if (vote.proposalId !== proposal.id || !voters.has(vote.userId)) continue;
    if (vote.choice === 'for') {
      pour += 1;
      if (vote.userId === context.organizerId) hostFor = true;
    } else {
      contre += 1;
    }
  }
  return { for: pour, against: contre, participants: voters.size, hostFor };
}

/** Ce que la base déciderait de ce décompte. */
export function outcome(count: Tally): 'adopted' | 'rejected' | 'open' {
  const majority = majorityOf(count.participants);
  if (count.hostFor || count.for >= majority) return 'adopted';
  if (count.against >= majority) return 'rejected';
  return 'open';
}

/** Ce membre peut-il voter ? Il faut participer. */
export function canVote(
  context: VoteContext,
  proposal: Pick<EventProposal, 'userId'>,
  userId: string | null,
): boolean {
  return userId !== null && electorate(context, proposal.userId).has(userId);
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

/** `2 POUR · 1 CONTRE SUR 5 PARTICIPANTS · ENCORE 1 VOIX, OU L'ACCORD DE L'ORGANISATEUR`. */
export function tallyLine(count: Tally): string {
  const needed = majorityOf(count.participants) - count.for;
  const head = `${count.for} POUR · ${count.against} CONTRE SUR ${count.participants} PARTICIPANTS`;
  if (needed <= 0 || count.hostFor) return head;
  return `${head} · ENCORE ${needed} VOIX, OU L’ACCORD DE L’ORGANISATEUR`;
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
