/**
 * La date d'entrée d'un call et le cours du bitcoin ce jour-là.
 *
 * Un décalage d'un jour ne lève rien : il fausse la colonne « vs ₿ » de
 * quelques pour cent, sans que personne ne s'en aperçoive. D'où ces tests,
 * sur le fuseau de Nouméa et sur les formats de réponse.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkEntryDate,
  coingeckoCovers,
  coingeckoDate,
  entryDateMs,
  parseCoingeckoHistory,
  parseMempoolHistory,
} from '@/lib/btcAtDate';

/** 23 septembre 2026, 10 h à Nouméa (23 h UTC la veille). */
const NOW = Date.UTC(2026, 8, 22, 23, 0);

describe('date d’entrée', () => {
  it('vide ou du jour : c’est aujourd’hui', () => {
    assert.deepEqual(checkEntryDate('', NOW), { kind: 'today' });
    assert.deepEqual(checkEntryDate('23/09/2026', NOW), { kind: 'today' });
  });

  it('se lit à l’heure de Nouméa, pas de l’appareil', () => {
    // À 23 h UTC le 22, il est déjà le 23 à Nouméa : le 22 est donc « hier ».
    const check = checkEntryDate('22/09/2026', NOW);
    assert.equal(check.kind, 'past');
  });

  it('refuse le futur et l’impossible', () => {
    assert.deepEqual(checkEntryDate('24/09/2026', NOW), { kind: 'future' });
    assert.deepEqual(checkEntryDate('31/02/2026', NOW), { kind: 'invalid' });
    assert.deepEqual(checkEntryDate('mars', NOW), { kind: 'invalid' });
  });

  it('tombe à midi à Nouméa, donc le même jour en UTC', () => {
    const ms = entryDateMs('12/03/2026')!;
    assert.equal(coingeckoDate(ms), '12-03-2026');
  });
});

describe('sources du cours historique', () => {
  it('CoinGecko ne couvre qu’un an', () => {
    assert.equal(coingeckoCovers(NOW - 100 * 86_400_000, NOW), true);
    assert.equal(coingeckoCovers(NOW - 400 * 86_400_000, NOW), false);
  });

  it('lit la réponse de CoinGecko', () => {
    assert.equal(
      parseCoingeckoHistory({ market_data: { current_price: { usd: 84_123.4, eur: 78_000 } } }),
      84_123.4,
    );
    assert.equal(parseCoingeckoHistory({ error: 'rate limited' }), null);
    assert.equal(parseCoingeckoHistory({ market_data: { current_price: { usd: 0 } } }), null);
    assert.equal(parseCoingeckoHistory(null), null);
  });

  it('lit la réponse de mempool.space', () => {
    assert.equal(
      parseMempoolHistory({ prices: [{ time: 1_499_904_000, USD: 2_254, EUR: 1_964 }] }),
      2_254,
    );
    assert.equal(parseMempoolHistory({ prices: [] }), null);
    assert.equal(parseMempoolHistory({ prices: [{ time: 1, USD: -1 }] }), null);
    assert.equal(parseMempoolHistory('oops'), null);
  });
});
