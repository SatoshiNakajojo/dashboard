import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { betPoints, clubYear, standings } from '@/features/oracle/standings';
import type { BetView } from '@/features/oracle/useOracle';
import type { HorizonKey } from '@/lib/horizons';
import type { Member } from '@/types/domain';

const member = (id: string, displayName: string): Member => ({
  id,
  displayName,
  initials: displayName.slice(0, 2).toUpperCase(),
  color: '#E8903D',
  avatarUrl: null,
  links: [],
});

const LEA = member('lea', 'Léa');
const ALEX = member('alex', 'Alex');
const MARCO = member('marco', 'Marco');

/** Un pari résolu à `resolvesAt`, jugé à `accuracy`. */
const resolved = (
  author: Member,
  horizon: HorizonKey,
  accuracy: number | null,
  resolvesAt = Date.UTC(2026, 5, 1),
): BetView =>
  ({
    bet: {
      id: `${author.id}-${horizon}-${resolvesAt}-${accuracy}`,
      userId: author.id,
      horizon,
      openedAt: resolvesAt - 7 * 86_400_000,
      lockedAt: resolvesAt - 6 * 86_400_000,
      resolvesAt,
      path: [],
      hash: null,
    },
    author,
    phase: 'resolved',
    target: null,
    accuracy,
    onChart: [],
  }) as BetView;

describe('points d’un pari', () => {
  it('justesse × poids de l’horizon', () => {
    assert.equal(betPoints(resolved(LEA, '1w', 92.4)), 92);
    assert.equal(betPoints(resolved(LEA, '3m', 80)), 160);
    assert.equal(betPoints(resolved(LEA, '12m', 70)), 280);
    assert.equal(betPoints(resolved(LEA, '10y', 50)), 400);
  });

  it('un pari sans cours ne vaut rien, plutôt que zéro', () => {
    assert.equal(betPoints(resolved(LEA, '1w', null)), null);
  });
});

describe('classement', () => {
  it('cumule les points, et garde la moyenne à côté', () => {
    const rows = standings(
      [
        resolved(LEA, '1w', 97),
        resolved(ALEX, '1w', 90),
        resolved(ALEX, '1w', 90),
        resolved(MARCO, '3m', 80),
      ],
      null,
    );
    assert.deepEqual(
      rows.map((r) => [r.member.displayName, r.rank, r.points, r.bets, Math.round(r.average)]),
      [
        ['Alex', 1, 180, 2, 90],
        ['Marco', 2, 160, 1, 80],
        ['Léa', 3, 97, 1, 97],
      ],
    );
    assert.equal(rows[2]!.best, 97);
  });

  it('filtre sur l’année de résolution, à l’heure de Nouméa', () => {
    // 31 décembre 2025, 14 h UTC = 1er janvier 2026, 1 h à Nouméa.
    const newYear = Date.UTC(2025, 11, 31, 14);
    assert.equal(clubYear(newYear), 2026);
    const rows = standings(
      [resolved(LEA, '1w', 90, newYear), resolved(ALEX, '1w', 95, Date.UTC(2025, 5, 1))],
      2026,
    );
    assert.deepEqual(
      rows.map((r) => r.member.displayName),
      ['Léa'],
    );
  });

  it('ignore les paris sans justesse, et ne classe pas qui n’a rien de jugé', () => {
    const rows = standings([resolved(LEA, '1w', null), resolved(ALEX, '1w', 60)], null);
    assert.deepEqual(
      rows.map((r) => r.member.displayName),
      ['Alex'],
    );
  });

  it('à égalité de points : même rang, départagés par la moyenne pour l’ordre', () => {
    const rows = standings(
      [
        resolved(LEA, '3m', 50), // 100 points, moyenne 50
        resolved(ALEX, '1w', 50),
        resolved(ALEX, '1w', 50), // 100 points, moyenne 50
        resolved(MARCO, '1w', 100), // 100 points, moyenne 100
      ],
      null,
    );
    assert.deepEqual(
      rows.map((r) => [r.member.displayName, r.rank]),
      [
        ['Marco', 1],
        ['Alex', 1],
        ['Léa', 1],
      ],
    );
  });
});
