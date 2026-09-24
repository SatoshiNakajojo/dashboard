import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { callPerformance } from '@/lib/performance';

const open = {
  assetClass: 'ACTION' as const,
  entryPrice: 10,
  currentPrice: 12,
  entryBtcPrice: 60_000,
  exitPrice: null,
  exitBtcPrice: null,
};

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

describe('perf d’un call', () => {
  it('en cours : cours courant, bitcoin courant', () => {
    const perf = callPerformance(open, 66_000);
    assert.equal(perf.closed, false);
    assert.equal(round(perf.performancePercent), 20);
    // 1,2 / 1,1 − 1
    assert.equal(round(perf.vsBtcPercent), 9.1);
  });

  it('close : prix de sortie et bitcoin du jour de la sortie, quel que soit le bitcoin d’aujourd’hui', () => {
    const closed = { ...open, currentPrice: 99, exitPrice: 15, exitBtcPrice: 66_000 };
    for (const live of [30_000, 66_000, 200_000, null]) {
      const perf = callPerformance(closed, live);
      assert.equal(perf.closed, true);
      assert.equal(round(perf.performancePercent), 50);
      // 1,5 / 1,1 − 1
      assert.equal(round(perf.vsBtcPercent), 36.4);
    }
  });

  it('close sans bitcoin de sortie : « — » plutôt qu’un chiffre faux', () => {
    const perf = callPerformance({ ...open, exitPrice: 15, exitBtcPrice: null }, 66_000);
    assert.equal(round(perf.performancePercent), 50);
    assert.equal(perf.vsBtcPercent, null);
  });

  it('un call BTC reste le référentiel', () => {
    const perf = callPerformance(
      {
        ...open,
        assetClass: 'BTC',
        exitPrice: 90_000,
        exitBtcPrice: 90_000,
        entryPrice: 60_000,
      },
      120_000,
    );
    assert.equal(round(perf.performancePercent), 50);
    assert.equal(perf.vsBtcPercent, null);
  });
});
