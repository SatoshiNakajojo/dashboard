import { useCallback, useEffect, useMemo, useState } from 'react';

import { describeError } from '@/lib/supabase';
import type { EventProposal, ProposalChoice } from '@/types/domain';
import { getProposalsSource } from './proposals';
import {
  canVote,
  myChoice,
  orderProposals,
  tally,
  type Tally,
  type VoteContext,
} from './proposalRules';

export interface ProposalView extends EventProposal {
  /** Le décompte, voix des participants seulement. */
  tally: Tally;
  /** Mon vote sur cette proposition. */
  mine: ProposalChoice | null;
  /** Je participe à la soirée : je peux voter. */
  canVote: boolean;
}

export interface ProposalsState {
  proposals: ProposalView[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  propose: (location: string, comment: string) => Promise<boolean>;
  withdraw: (proposalId: string) => Promise<void>;
  vote: (proposalId: string, choice: ProposalChoice | null) => Promise<void>;
}

/**
 * Les contre-propositions d'une soirée, en direct.
 *
 * On relit tout à chaque changement plutôt que d'appliquer les messages un à
 * un : une adoption touche la proposition, ses sœurs et leurs votes d'un coup,
 * et la liste d'une soirée tient en quelques lignes.
 */
export function useProposals(
  eventId: string,
  currentUserId: string | null,
  context: VoteContext,
): ProposalsState {
  const source = useMemo(() => getProposalsSource(), []);
  const [snapshot, setSnapshot] = useState<{
    proposals: EventProposal[];
    votes: { proposalId: string; userId: string; choice: ProposalChoice }[];
  }>({ proposals: [], votes: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    source
      .list(eventId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(describeError(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [source, eventId, revision]);

  useEffect(
    () => source.subscribe(eventId, () => setRevision((value) => value + 1)),
    [source, eventId],
  );

  const run = useCallback(async (task: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await task();
      setRevision((value) => value + 1);
      return true;
    } catch (cause) {
      setError(describeError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const propose = useCallback(
    (location: string, comment: string) =>
      currentUserId
        ? run(() =>
            source.propose(eventId, currentUserId, location.trim(), comment.trim(), context),
          )
        : Promise.resolve(false),
    [context, currentUserId, eventId, run, source],
  );

  const withdraw = useCallback(
    async (proposalId: string) => {
      await run(() => source.withdraw(proposalId));
    },
    [run, source],
  );

  const vote = useCallback(
    async (proposalId: string, choice: ProposalChoice | null) => {
      if (!currentUserId) return;
      await run(() => source.vote({ id: proposalId, eventId }, currentUserId, choice, context));
    },
    [context, currentUserId, eventId, run, source],
  );

  const proposals = useMemo(
    () =>
      orderProposals(snapshot.proposals).map((proposal) => ({
        ...proposal,
        tally: tally(snapshot.votes, proposal, context),
        mine: myChoice(snapshot.votes, proposal.id, currentUserId),
        canVote: canVote(context, proposal, currentUserId),
      })),
    [snapshot, currentUserId, context],
  );

  return { proposals, loading, error, busy, propose, withdraw, vote };
}
