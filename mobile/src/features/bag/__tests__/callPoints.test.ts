import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SCORE_TABLE,
  authorPoints,
  callStakes,
  memberCallPoints,
  pointLines,
  voterPoints,
  voterShare,
} from '@/features/bag/callPoints';
import { formatPoints } from '@/lib/format';
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
  it('suit les paliers, à la hausse comme à la baisse', () => {
    const cases: [number | null, number][] = [
      [250, 500],
      [100, 500],
      [99.9, 300],
      [50, 300],
      [49, 200],
      [30, 200],
      [25, 100],
      [20, 100],
      [14.9, 50],
      [10, 50],
      [7, 25],
      [5, 25],
      [4.99, 10],
      [0.01, 10],
      [0, 0],
      [-0.01, -10],
      [-4.99, -10],
      [-5, -25],
      [-12, -50],
      [-20, -100],
      [-29, -100],
      [-30, -200],
      [-48, -200],
      [-50, -300],
      [-99, -300],
      [null, 0],
    ];
    for (const [perf, points] of cases) assert.equal(authorPoints(perf), points, String(perf));
  });
});

describe('les votants', () => {
  it('prennent la moitié, arrondie vers zéro', () => {
    const halves: [number, number][] = [
      [10, 5],
      [25, 12],
      [50, 25],
      [100, 50],
      [200, 100],
      [300, 150],
      [500, 250],
      [-25, -12],
      [-10, -5],
    ];
    for (const [author, half] of halves) assert.equal(voterShare(author), half, String(author));
  });

  it('un bull gagne quand le call monte, perd quand il baisse ; un bear, l’inverse', () => {
    assert.equal(voterPoints('bull', 40), 100);
    assert.equal(voterPoints('bear', 40), -100);
    assert.equal(voterPoints('bull', -7), -12);
    assert.equal(voterPoints('bear', -7), 12);
    assert.ok(Object.is(voterPoints('bear', 0), 0), 'pas de −0 à l’écran');
  });

  it('l’enjeu d’un call, rôle par rôle', () => {
    assert.deepEqual(callStakes(call('a', 'x', 55)), { author: 300, bull: 150, bear: -150 });
  });

  it('le barème affiché se lit de la plus belle hausse à la pire baisse', () => {
    assert.deepEqual(
      SCORE_TABLE.map((row) => [row.label, row.author, row.bull, row.bear]),
      [
        ['+100 % et plus', 500, 250, -250],
        ['+50 à +100 %', 300, 150, -150],
        ['+30 à +50 %', 200, 100, -100],
        ['+20 à +30 %', 100, 50, -50],
        ['+10 à +20 %', 50, 25, -25],
        ['+5 à +10 %', 25, 12, -12],
        ['0 à +5 %', 10, 5, -5],
        ['0 à −5 %', -10, -5, 5],
        ['−5 à −10 %', -25, -12, 12],
        ['−10 à −20 %', -50, -25, 25],
        ['−20 à −30 %', -100, -50, 50],
        ['−30 à −50 %', -200, -100, 100],
        ['−50 à −100 %', -300, -150, 150],
      ],
    );
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
        ['nvda', 'alex', 'author', 300],
        ['nvda', 'john', 'bull', 150],
        ['nvda', 'marco', 'bear', -150],
        ['wif', 'marco', 'author', -300],
        ['wif', 'john', 'bear', 150],
        ['wif', 'sofia', 'bull', -150],
      ],
    );
  });

  it('acquis sur un call clôturé, latents sur un call en cours', () => {
    const john = memberCallPoints(lines, 'john', null);
    assert.deepEqual(john, {
      total: 300,
      settled: 150,
      latent: 150,
      asAuthor: 0,
      asVoter: 300,
    });
  });

  it('un call clôturé compte l’année de sa sortie, à l’heure de Nouméa', () => {
    assert.equal(memberCallPoints(lines, 'alex', 2026).total, 0);
    assert.equal(memberCallPoints(lines, 'alex', 2025).total, 300);
    assert.equal(
      memberCallPoints(lines, 'marco', 2026).total,
      -300,
      'latents : l’année en cours',
    );
  });
});

describe('affichage des points', () => {
  it('signe toujours, avec le vrai signe moins et les milliers séparés', () => {
    assert.equal(formatPoints(500), '+500');
    assert.equal(formatPoints(-12), '−12');
    assert.equal(formatPoints(0), '0');
    assert.equal(formatPoints(1250), '+1\u202f250');
  });
});
