import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DAY_MS } from '@/features/oracle/betting';
import {
  FINE_DAYS,
  fineOrigin,
  judgingOrigins,
  judgingSeries,
} from '@/features/oracle/judging';

const NOW = Date.UTC(2026, 8, 24, 15, 42);
const DAY_START = Date.UTC(2026, 8, 24);
const opened = (daysAgo: number) => ({ openedAt: NOW - daysAgo * DAY_MS });

describe('séries qui jugent les paris résolus', () => {
  it('ne dépendent que du jour, pas de l’heure ni de l’écran', () => {
    assert.equal(fineOrigin(NOW), DAY_START - FINE_DAYS * DAY_MS);
    assert.equal(fineOrigin(DAY_START + 1), fineOrigin(DAY_START + DAY_MS - 1));
  });

  it('restent horaires : la série fine ne dépasse pas 90 jours chez CoinGecko', () => {
    // `fetchBtcSince` demande ceil(écart) + 1 jours ; au-delà de 90, CoinGecko passe en journalier.
    const elapsed = (DAY_START + DAY_MS - 1 - fineOrigin(NOW)) / DAY_MS;
    assert.ok(Math.ceil(elapsed) + 1 <= 90);
  });

  it('ne chargent que ce qui sert', () => {
    assert.deepEqual(judgingOrigins([], NOW), { fine: null, coarse: null });
    assert.deepEqual(judgingOrigins([opened(10)] as never, NOW), {
      fine: fineOrigin(NOW),
      coarse: null,
    });
    const both = judgingOrigins([opened(10), opened(200)] as never, NOW);
    assert.equal(both.fine, fineOrigin(NOW));
    assert.equal(both.coarse, Date.UTC(2026, 2, 8));
  });

  it('bornent la série large à l’historique public', () => {
    const { coarse } = judgingOrigins([opened(900)] as never, NOW);
    assert.ok(coarse !== null && (DAY_START - coarse) / DAY_MS === 364);
  });

  it('attribuent chaque pari à une série, toujours la même dans la journée', () => {
    assert.equal(judgingSeries(opened(10), NOW), 'fine');
    assert.equal(judgingSeries(opened(120), NOW), 'coarse');
  });
});
