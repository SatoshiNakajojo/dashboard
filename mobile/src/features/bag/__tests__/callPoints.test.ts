import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  authorPoints,
  callStakes,
  memberCallPoints,
  pointLines,
  voterPoints,
} from '@/features/bag/callPoints';
import type { CallView, VoteView } from '@/types/domain';

const NOW = Date.UTC(2026, 8, 24, 3);

const vote = (userId: string, side: VoteView['side']): VoteView => ({
  userId,
  side,
  reason: 'parce que',
  createdAt: '2026-09-01T00:00:00Z',
});

const call = (
  id: string,
  author: string,
  perf: number | null,
  extra: Partial<CallView> = {},
): CallView =>
  ({
    id,
    userId: author,
    symbol: `$${id.toUpperCase()}`,
    assetClass: 'ACTION',
    performancePercent: perf,
    vsBtcPercent: null,
    closed: false,
    closedOn: null,
    voters: [],
    ...extra,
  }) as CallView;

describe('barème de l’auteur', () => {
  it('gagne à partir de +30 %, perd à partir de −20 %, rien entre les deux', () => {
    const cases: [number | null, number][] = [
      [250, 300],
      [100, 300],
      [74, 200],
      [50, 200],
      [35, 100],
      [30, 100],
      [29.9, 0],
      [12, 0],
      [0, 0],
      [-19.9, 0],
      [-20, -100],
      [-48, -100],
      [-50, -200],
      [-99, -200],
      [null, 0],
    ];
    for (const [perf, points] of cases) assert.equal(authorPoints(perf), points, String(perf));
  });
});

describe('les votants', () => {
  it('un bull gagne avec l’auteur, et perd avec lui — à moitié', () => {
    assert.equal(voterPoints('bull', 40), 50);
    assert.equal(voterPoints('bull', -30), -50);
  });

  it('un bear gagne quand le call est nul, perd quand il réussit', () => {
    assert.equal(voterPoints('bear', -30), 50);
    assert.equal(voterPoints('bear', -60), 100);
    assert.equal(voterPoints('bear', 40), -50);
    assert.equal(voterPoints('bear', 10), 0);
    assert.ok(Object.is(voterPoints('bear', 10), 0), 'pas de −0 à l’écran');
  });

  it('l’enjeu d’un call, rôle par rôle', () => {
    assert.deepEqual(callStakes(call('a', 'x', 55)), { author: 200, bull: 100, bear: -100 });
  });
});

describe('lignes de points', () => {
  const calls = [
    call('nvda', 'alex', 74, {
      closed: true,
      closedOn: '2025-12-31',
      voters: [vote('john', 'bull'), vote('marco', 'bear'), vote('alex', 'bull')],
    }),
    call('wif', 'marco', -61, { voters: [vote('john', 'bear'), vote('sofia', 'bull')] }),
  ];
  const lines = pointLines(calls, NOW);

  it('une ligne par auteur et par votant, sans le vote de l’auteur sur son call', () => {
    assert.deepEqual(
      lines.map((l) => [l.callId, l.memberId, l.role, l.points]),
      [
        ['nvda', 'alex', 'author', 200],
        ['nvda', 'john', 'bull', 100],
        ['nvda', 'marco', 'bear', -100],
        ['wif', 'marco', 'author', -200],
        ['wif', 'john', 'bear', 100],
        ['wif', 'sofia', 'bull', -100],
      ],
    );
  });

  it('acquis sur un call clôturé, latents sur un call en cours', () => {
    const john = memberCallPoints(lines, 'john', null);
    assert.deepEqual(john, {
      total: 200,
      settled: 100,
      latent: 100,
      asAuthor: 0,
      asVoter: 200,
    });
  });

  it('un call clôturé compte l’année de sa sortie, à l’heure de Nouméa', () => {
    assert.equal(memberCallPoints(lines, 'alex', 2026).total, 0);
    assert.equal(memberCallPoints(lines, 'alex', 2025).total, 200);
    assert.equal(
      memberCallPoints(lines, 'marco', 2026).total,
      -200,
      'latents : l’année en cours',
    );
  });
});
