/**
 * Source des contre-propositions de lieu — même contrat que le potluck : une
 * interface, deux implémentations (Supabase, et un magasin mémoire pour la
 * démo, qui applique la même règle que la base).
 */

import { supabase } from '@/lib/supabase';
import { MOCK_EVENTS } from '@/mocks/events';
import { MEMBER_LIST, MEMBERS } from '@/mocks/members';
import type { EventProposalRow, EventProposalVoteRow } from '@/types/database';
import type { EventProposal, ProposalChoice, ProposalVote } from '@/types/domain';
import { majorityOf, tally } from './proposalRules';

export interface ProposalsSnapshot {
  proposals: EventProposal[];
  votes: ProposalVote[];
}

export interface ProposalsSource {
  list(eventId: string, signal?: AbortSignal): Promise<ProposalsSnapshot>;
  propose(eventId: string, userId: string, location: string, comment: string): Promise<void>;
  /** Retire sa proposition, tant qu'elle est ouverte. */
  withdraw(proposalId: string): Promise<void>;
  /** Vote pour ou contre ; `null` retire son vote. */
  vote(
    proposal: { id: string; eventId: string },
    userId: string,
    choice: ProposalChoice | null,
  ): Promise<void>;
  /** Un changement sur les propositions ou les votes de la soirée. */
  subscribe(eventId: string, onChange: () => void): () => void;
}

// ---------------------------------------------------------------------------

function fromRow(row: EventProposalRow): EventProposal {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    location: row.location,
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function voteFromRow(row: EventProposalVoteRow): ProposalVote {
  return { proposalId: row.proposal_id, userId: row.user_id, choice: row.choice };
}

function createSupabaseSource(client: NonNullable<typeof supabase>): ProposalsSource {
  return {
    async list(eventId, signal) {
      let proposals = client
        .from('event_proposals')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at');
      let votes = client.from('event_proposal_votes').select('*').eq('event_id', eventId);
      if (signal) {
        proposals = proposals.abortSignal(signal);
        votes = votes.abortSignal(signal);
      }
      const [p, v] = await Promise.all([proposals, votes]);
      // Avant la migration, les tables n'existent pas : pas de proposition.
      if (p.error) return { proposals: [], votes: [] };
      return {
        proposals: (p.data ?? []).map((row) => fromRow(row as EventProposalRow)),
        votes: v.error
          ? []
          : (v.data ?? []).map((row) => voteFromRow(row as EventProposalVoteRow)),
      };
    },

    async propose(eventId, userId, location, comment) {
      const { error } = await client
        .from('event_proposals')
        .insert({ event_id: eventId, user_id: userId, location, comment });
      if (error) throw error;
    },

    async withdraw(proposalId) {
      const { data, error } = await client
        .from('event_proposals')
        .delete()
        .eq('id', proposalId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('Cette proposition ne peut plus être retirée.');
    },

    async vote(proposal, userId, choice) {
      if (choice === null) {
        const { error } = await client
          .from('event_proposal_votes')
          .delete()
          .eq('proposal_id', proposal.id)
          .eq('user_id', userId);
        if (error) throw error;
        return;
      }
      // `event_id` sert au filtre du temps réel ; la base le recopie de toute
      // façon depuis la proposition.
      const { error } = await client
        .from('event_proposal_votes')
        .upsert(
          { proposal_id: proposal.id, user_id: userId, event_id: proposal.eventId, choice },
          { onConflict: 'proposal_id,user_id' },
        );
      if (error) throw error;
    },

    subscribe(eventId, onChange) {
      const channel = client
        .channel(`proposals:${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_proposals',
            filter: `event_id=eq.${eventId}`,
          },
          () => onChange(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_proposal_votes',
            filter: `event_id=eq.${eventId}`,
          },
          () => onChange(),
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Démo — la même règle que `event_proposals_tally`
// ---------------------------------------------------------------------------

type AdoptionListener = (eventId: string, location: string) => void;
const adoptionListeners = new Set<AdoptionListener>();

/**
 * En démo, une proposition adoptée doit déplacer la soirée affichée : c'est ce
 * que fait la base en production, et que le temps réel des soirées rapporte.
 */
export function onMockAdoption(listener: AdoptionListener): () => void {
  adoptionListeners.add(listener);
  return () => {
    adoptionListeners.delete(listener);
  };
}

function createMockSource(): ProposalsSource {
  // Démo : Alex ne peut pas venir aux Grillades (proposées par « Toi ») et
  // propose chez lui. Trois pour, un contre : une voix de plus, et la soirée
  // change de lieu.
  const grillades = MOCK_EVENTS[1]!.id;
  const seed = '66666666-6666-4666-8666-000000000000';
  const proposals: EventProposal[] = [
    {
      id: seed,
      eventId: grillades,
      userId: MEMBERS.alex!.id,
      location: 'Chez Alex — Anse Vata',
      comment: 'Je garde mes enfants ce soir-là : on peut le faire chez moi ?',
      status: 'open',
      createdAt: '2026-09-24T09:00:00+11:00',
      decidedAt: null,
    },
  ];
  const votes: ProposalVote[] = [
    { proposalId: seed, userId: MEMBERS.alex!.id, choice: 'for' },
    { proposalId: seed, userId: MEMBERS.lea!.id, choice: 'for' },
    { proposalId: seed, userId: MEMBERS.rayan!.id, choice: 'for' },
    { proposalId: seed, userId: MEMBERS.marco!.id, choice: 'against' },
  ];
  const listeners = new Map<string, Set<() => void>>();
  let sequence = 0;
  const emit = (eventId: string) => listeners.get(eventId)?.forEach((listener) => listener());
  const clubSize = MEMBER_LIST.length;

  const settle = (proposal: EventProposal) => {
    const count = tally(votes, proposal.id);
    const majority = majorityOf(clubSize);
    const now = new Date().toISOString();
    if (count.for >= majority) {
      proposal.status = 'adopted';
      proposal.decidedAt = now;
      for (const other of proposals) {
        if (
          other.eventId === proposal.eventId &&
          other.id !== proposal.id &&
          other.status === 'open'
        ) {
          other.status = 'rejected';
          other.decidedAt = now;
        }
      }
      adoptionListeners.forEach((listener) => listener(proposal.eventId, proposal.location));
    } else if (count.against >= majority) {
      proposal.status = 'rejected';
      proposal.decidedAt = now;
    }
  };

  return {
    async list(eventId) {
      return {
        proposals: proposals.filter((p) => p.eventId === eventId).map((p) => ({ ...p })),
        votes: votes
          .filter((v) => proposals.some((p) => p.id === v.proposalId && p.eventId === eventId))
          .map((v) => ({ ...v })),
      };
    },

    async propose(eventId, userId, location, comment) {
      if (
        proposals.some(
          (p) => p.eventId === eventId && p.userId === userId && p.status === 'open',
        )
      ) {
        throw new Error('Vous avez déjà une proposition ouverte pour cette soirée.');
      }
      sequence += 1;
      const proposal: EventProposal = {
        id: `66666666-6666-4666-8666-${String(sequence).padStart(12, '0')}`,
        eventId,
        userId,
        location: location.trim(),
        comment: comment.trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        decidedAt: null,
      };
      proposals.push(proposal);
      votes.push({ proposalId: proposal.id, userId, choice: 'for' });
      settle(proposal);
      emit(eventId);
    },

    async withdraw(proposalId) {
      const index = proposals.findIndex((p) => p.id === proposalId && p.status === 'open');
      if (index === -1) throw new Error('Cette proposition ne peut plus être retirée.');
      const [removed] = proposals.splice(index, 1);
      for (let i = votes.length - 1; i >= 0; i -= 1) {
        if (votes[i]!.proposalId === proposalId) votes.splice(i, 1);
      }
      emit(removed!.eventId);
    },

    async vote(target, userId, choice) {
      const proposalId = target.id;
      const proposal = proposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.status !== 'open')
        throw new Error('Le vote sur cette proposition est clos.');
      const index = votes.findIndex((v) => v.proposalId === proposalId && v.userId === userId);
      if (index !== -1) votes.splice(index, 1);
      if (choice) votes.push({ proposalId, userId, choice });
      settle(proposal);
      emit(proposal.eventId);
    },

    subscribe(eventId, onChange) {
      const set = listeners.get(eventId) ?? new Set<() => void>();
      set.add(onChange);
      listeners.set(eventId, set);
      return () => {
        set.delete(onChange);
      };
    },
  };
}

const mockSource = createMockSource();

export function getProposalsSource(): ProposalsSource {
  return supabase ? createSupabaseSource(supabase) : mockSource;
}
