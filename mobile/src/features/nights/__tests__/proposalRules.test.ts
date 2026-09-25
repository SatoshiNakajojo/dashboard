import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canPropose,
  canVote,
  electorate,
  majorityOf,
  myChoice,
  orderProposals,
  outcome,
  tally,
  tallyLine,
  type VoteContext,
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

// Grillades chez John ; Léa et Marco viennent. Alex propose chez lui.
const context: VoteContext = { attendeeIds: ['lea', 'marco'], organizerId: 'john' };
const p1 = proposal({});

const votes: ProposalVote[] = [
  { proposalId: 'p1', userId: 'alex', choice: 'for' },
  { proposalId: 'p1', userId: 'marco', choice: 'against' },
  // Rayan ne vient pas : sa voix ne compte pas.
  { proposalId: 'p1', userId: 'rayan', choice: 'for' },
  { proposalId: 'p2', userId: 'lea', choice: 'against' },
];

describe('contre-propositions : qui vote', () => {
  it('fait voter les participants : présents, organisateur, auteur', () => {
    assert.deepEqual([...electorate(context, 'alex')].sort(), ['alex', 'john', 'lea', 'marco']);
    assert.equal(canVote(context, p1, 'lea'), true);
    assert.equal(canVote(context, p1, 'john'), true, 'l’organisateur vote');
    assert.equal(canVote(context, p1, 'rayan'), false, 'dire « Je viens » d’abord');
    assert.equal(canVote(context, p1, null), false);
  });

  it('prend la majorité des participants, pas du club', () => {
    assert.equal(majorityOf(2), 2);
    assert.equal(majorityOf(3), 2);
    assert.equal(majorityOf(4), 3);
    assert.equal(majorityOf(5), 3);
    assert.equal(majorityOf(7), 4);
  });
});

describe('contre-propositions : le décompte', () => {
  it('ne compte que les voix des participants', () => {
    assert.deepEqual(tally(votes, p1, context), {
      for: 1,
      against: 1,
      participants: 4,
      hostFor: false,
    });
    assert.equal(outcome(tally(votes, p1, context)), 'open');
    assert.equal(
      tallyLine(tally(votes, p1, context)),
      '1 POUR · 1 CONTRE SUR 4 PARTICIPANTS · ENCORE 2 VOIX, OU L’ACCORD DE L’ORGANISATEUR',
    );
  });

  it('adopte à la majorité des pour', () => {
    const more = [...votes, { proposalId: 'p1', userId: 'lea', choice: 'for' as const }];
    // Alex et Léa : 2 sur 4, pas encore.
    assert.equal(outcome(tally(more, p1, context)), 'open');
    const small: VoteContext = { attendeeIds: ['lea'], organizerId: 'john' };
    // Trois participants (John, Léa, Alex) : 2 pour suffisent.
    assert.equal(outcome(tally(more, p1, small)), 'adopted');
  });

  it('adopte aussitôt si l’organisateur est pour', () => {
    const host = [...votes, { proposalId: 'p1', userId: 'john', choice: 'for' as const }];
    const count = tally(host, p1, context);
    assert.equal(count.hostFor, true);
    assert.equal(outcome(count), 'adopted');
    assert.equal(tallyLine(count), '2 POUR · 1 CONTRE SUR 4 PARTICIPANTS');
  });

  it('rejette à la majorité des contre', () => {
    const against = [
      ...votes,
      { proposalId: 'p1', userId: 'lea', choice: 'against' as const },
      { proposalId: 'p1', userId: 'john', choice: 'against' as const },
    ];
    assert.equal(outcome(tally(against, p1, context)), 'rejected');
  });

  it('retrouve mon vote', () => {
    assert.equal(myChoice(votes, 'p1', 'marco'), 'against');
    assert.equal(myChoice(votes, 'p1', 'lea'), null);
    assert.equal(myChoice(votes, 'p1', null), null);
  });
});

describe('contre-propositions : qui propose, et dans quel ordre', () => {
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
