import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canPropose,
  majorityOf,
  myChoice,
  orderProposals,
  tally,
  tallyLine,
} from '@/features/nights/proposalRules';
import type { EventProposal, ProposalVote } from '@/types/domain';

const proposal = (over: Partial<EventProposal>): EventProposal => ({
  id: 'p1',
  eventId: 'e1',
  userId: 'alex',
  location: 'Chez Alex',
  comment: 'Je garde mes enfants.',
  status: 'open',
  createdAt: '2026-09-25T08:00:00Z',
  decidedAt: null,
  ...over,
});

const votes: ProposalVote[] = [
  { proposalId: 'p1', userId: 'alex', choice: 'for' },
  { proposalId: 'p1', userId: 'lea', choice: 'for' },
  { proposalId: 'p1', userId: 'marco', choice: 'against' },
  { proposalId: 'p2', userId: 'lea', choice: 'against' },
];

describe('contre-propositions de lieu', () => {
  it('compte à la majorité absolue du club, comme la base', () => {
    assert.equal(majorityOf(7), 4);
    assert.equal(majorityOf(6), 4);
    assert.equal(majorityOf(2), 2);
    assert.equal(majorityOf(0), 1);
  });

  it('dépouille une proposition et dit ce qu’il manque', () => {
    assert.deepEqual(tally(votes, 'p1'), { for: 2, against: 1 });
    assert.equal(
      tallyLine(tally(votes, 'p1'), 7),
      '2 POUR · 1 CONTRE · ENCORE 2 VOIX POUR CHANGER DE LIEU',
    );
    assert.equal(tallyLine({ for: 4, against: 1 }, 7), '4 POUR · 1 CONTRE');
    assert.equal(myChoice(votes, 'p1', 'marco'), 'against');
    assert.equal(myChoice(votes, 'p1', 'rayan'), null);
    assert.equal(myChoice(votes, 'p1', null), null);
  });

  it('laisse proposer les autres membres, une fois, avant la soirée', () => {
    const event = { createdBy: 'john', startsAt: '2026-10-03T08:30:00Z' };
    const now = Date.parse('2026-09-25T00:00:00Z');
    assert.equal(canPropose(event, [], 'lea', now), true);
    assert.equal(
      canPropose(event, [], 'john', now),
      false,
      'le créateur modifie, il ne propose pas',
    );
    assert.equal(canPropose(event, [proposal({ userId: 'lea' })], 'lea', now), false);
    assert.equal(
      canPropose(event, [proposal({ userId: 'lea', status: 'rejected' })], 'lea', now),
      true,
      'une proposition tranchée libère la place',
    );
    assert.equal(canPropose(event, [], 'lea', Date.parse('2026-10-04T00:00:00Z')), false);
    assert.equal(canPropose(event, [], null, now), false);
  });

  it('montre les propositions ouvertes d’abord', () => {
    const ordered = orderProposals([
      proposal({ id: 'vieille', status: 'rejected', decidedAt: '2026-09-20T00:00:00Z' }),
      proposal({ id: 'ouverte' }),
      proposal({ id: 'adoptée', status: 'adopted', decidedAt: '2026-09-24T00:00:00Z' }),
    ]);
    assert.deepEqual(
      ordered.map((p) => p.id),
      ['ouverte', 'adoptée', 'vieille'],
    );
  });
});
