import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scheduleFor } from '@/lib/horizons';
import { callsRecord, nightsRecord, oracleRecord } from '@/features/profile/record';
import type { Bet } from '@/features/oracle/betting';
import type { BetView } from '@/features/oracle/useOracle';
import type { CallView, Member } from '@/types/domain';

const NOW = Date.UTC(2026, 8, 24, 3);
const DAY = 86_400_000;

const member = (id: string): Member => ({
  id,
  displayName: id,
  initials: id.slice(0, 2),
  color: '#E8903D',
  avatarUrl: null,
  links: [],
});

const call = (id: string, userId: string, extra: Partial<CallView>): CallView =>
  ({
    id,
    userId,
    symbol: `$${id.toUpperCase()}`,
    assetClass: 'ACTION',
    createdAt: new Date(NOW).toISOString(),
    performancePercent: null,
    vsBtcPercent: null,
    closed: false,
    ...extra,
  }) as CallView;

describe('les calls d’un membre', () => {
  const calls = [
    call('a', 'lea', { performancePercent: 20, vsBtcPercent: 5 }),
    call('b', 'lea', {
      performancePercent: 60,
      vsBtcPercent: 30,
      closed: true,
      createdAt: new Date(NOW - 5 * DAY).toISOString(),
    }),
    call('c', 'lea', {
      performancePercent: -10,
      vsBtcPercent: null,
      createdAt: new Date(NOW - 9 * DAY).toISOString(),
    }),
    call('d', 'alex', { performancePercent: 90 }),
  ];

  it('compte, moyenne, et désigne le meilleur', () => {
    const record = callsRecord(calls, 'lea');
    assert.deepEqual(
      record.calls.map((c) => c.id),
      ['a', 'c', 'b'],
      'en cours d’abord, du plus récent au plus ancien, puis les clos',
    );
    assert.equal(record.open, 2);
    assert.equal(record.closed, 1);
    assert.equal(Math.round(record.averagePerf!), 23);
    assert.equal(record.averageVsBtc, 17.5);
    assert.equal(record.best?.id, 'b');
  });

  it('n’invente rien pour qui n’a pas de call', () => {
    const record = callsRecord(calls, 'marco');
    assert.equal(record.calls.length, 0);
    assert.equal(record.averagePerf, null);
    assert.equal(record.best, null);
  });
});

describe('les soirées d’un membre', () => {
  const night = (id: string, daysFromNow: number, attendeeIds: string[]) => ({
    id,
    startsAt: new Date(NOW + daysFromNow * DAY).toISOString(),
    title: id,
    location: 'Ici',
    themes: ['Crypto Night'],
    createdBy: null,
    editedAt: null,
    attendeeIds,
  });

  it('compte les présences passées et trouve la prochaine où il vient', () => {
    const record = nightsRecord(
      [
        night('passée-1', -30, ['lea']),
        night('passée-2', -10, ['alex']),
        night('future-loin', 20, ['lea']),
        night('future-proche', 5, ['lea']),
        night('future-sans', 2, ['alex']),
      ],
      'lea',
      NOW,
    );
    assert.equal(record.attended, 1);
    assert.equal(record.past, 2);
    assert.equal(record.next?.id, 'future-proche');
  });
});

describe('l’Oracle d’un membre', () => {
  const bet = (userId: string, horizon: Bet['horizon'], openedAt: number): Bet => {
    const s = scheduleFor(horizon, openedAt);
    return {
      id: `${userId}-${horizon}-${openedAt}`,
      userId,
      horizon,
      openedAt: s.openedAt,
      lockedAt: s.locksAt,
      resolvesAt: s.resolvesAt,
      path: [],
      hash: null,
    };
  };
  const judged = (b: Bet, accuracy: number, who: Member): BetView => ({
    bet: b,
    author: who,
    phase: 'resolved',
    target: null,
    accuracy,
    onChart: [],
  });

  it('donne son rang de l’année, son total, et ses paris en cours', () => {
    const lea = member('lea');
    const alex = member('alex');
    const old = bet('lea', '1w', Date.UTC(2025, 5, 1));
    const recent = bet('lea', '1w', NOW - 30 * DAY);
    const alexRecent = bet('alex', '3m', NOW - 120 * DAY);
    const running = [bet('lea', '12m', NOW - 5 * DAY), bet('lea', '1w', NOW - DAY)];
    const record = oracleRecord(
      [judged(recent, 90, lea), judged(old, 80, lea), judged(alexRecent, 70, alex)],
      [old, recent, alexRecent, ...running],
      'lea',
      NOW,
    );
    assert.equal(record.year?.rank, 2, 'Alex : 140 points ; Léa : 90');
    assert.equal(record.year?.points, 90);
    assert.equal(record.allTime?.points, 170);
    assert.equal(record.rankedThisYear, 2);
    assert.deepEqual(record.running, ['1w', '12m']);
  });
});
