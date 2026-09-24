import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PointLine } from '@/features/bag/callPoints';
import { clubStandings, titlesOf } from '@/features/club/clubStandings';
import type { BetView } from '@/features/oracle/useOracle';
import type { Member } from '@/types/domain';

const member = (id: string): Member => ({
  id,
  displayName: id[0]!.toUpperCase() + id.slice(1),
  initials: id.slice(0, 2).toUpperCase(),
  color: '#E8903D',
  avatarUrl: null,
  links: [],
});
const MEMBERS = ['john', 'alex', 'lea', 'marco'].map(member);

const line = (memberId: string, points: number, settled = true, year = 2026): PointLine => ({
  memberId,
  callId: 'c',
  symbol: '$C',
  role: 'author',
  points,
  settled,
  year,
});

const resolved = (who: string, accuracy: number): BetView =>
  ({
    bet: {
      id: `${who}-${accuracy}`,
      userId: who,
      horizon: '3m',
      openedAt: Date.UTC(2026, 1, 1),
      lockedAt: Date.UTC(2026, 1, 4),
      resolvesAt: Date.UTC(2026, 4, 2),
      path: [],
      hash: null,
    },
    author: MEMBERS.find((m) => m.id === who)!,
    phase: 'resolved',
    target: null,
    accuracy,
    onChart: [],
  }) as BetView;

describe('classement du club', () => {
  it('additionne calls et Oracle, et classe tout le monde', () => {
    const rows = clubStandings(
      MEMBERS,
      [line('john', 100), line('john', 50, false), line('marco', -200)],
      [resolved('lea', 90), resolved('john', 50)],
      2026,
    );
    assert.deepEqual(
      rows.map((r) => [r.member.id, r.rank, r.total, r.calls, r.callsLatent, r.oracle]),
      [
        ['john', 1, 250, 150, 50, 100],
        ['lea', 2, 180, 0, 0, 180],
        ['alex', 3, 0, 0, 0, 0],
        ['marco', 4, -200, -200, 0, 0],
      ],
    );
  });

  it('désigne qui détient la vérité et qui est à côté de la plaque', () => {
    const rows = clubStandings(MEMBERS, [line('john', 100), line('marco', -200)], [], 2026);
    assert.deepEqual(titlesOf(rows), { truth: 'john', offMark: 'marco' });
  });

  it('ne désigne personne quand tout le monde est à égalité, ni un premier ex æquo', () => {
    assert.deepEqual(titlesOf(clubStandings(MEMBERS, [], [], 2026)), {
      truth: null,
      offMark: null,
    });
    const tied = clubStandings(
      MEMBERS,
      [line('john', 100), line('alex', 100), line('lea', -100)],
      [],
      2026,
    );
    assert.deepEqual(titlesOf(tied), { truth: null, offMark: 'lea' });
  });

  it('filtre les calls par année', () => {
    const rows = clubStandings(MEMBERS, [line('john', 100, true, 2025)], [], 2026);
    assert.equal(rows.find((r) => r.member.id === 'john')!.total, 0);
  });
});
