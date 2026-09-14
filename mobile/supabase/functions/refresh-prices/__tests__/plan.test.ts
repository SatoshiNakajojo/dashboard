/**
 * Le plan de rafraîchissement — ce qui sera écrit dans `tickers`.
 *
 * Deux garanties comptent plus que le reste, et sont testées comme telles :
 * on n'efface jamais un prix connu, et on ne réveille pas les clients pour rien.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chunk, planUpdates, type PricedTicker } from '../plan.ts';

const row = (id: string, cg: string, current: number | null): PricedTicker => ({
  id,
  coingecko_id: cg,
  current_price: current,
});

describe('plan de rafraîchissement', () => {
  it('met à jour un prix qui a bougé', () => {
    const plan = planUpdates([row('a', 'bitcoin', 100_000)], { bitcoin: 120_911 });
    assert.deepEqual(plan.updates, [{ id: 'a', price: 120_911 }]);
    assert.equal(plan.skipped, 0);
  });

  it('renseigne un prix encore inconnu', () => {
    const plan = planUpdates([row('a', 'solana', null)], { solana: 212.4 });
    assert.deepEqual(plan.updates, [{ id: 'a', price: 212.4 }]);
  });

  it('n’efface jamais un prix absent de la réponse', () => {
    const plan = planUpdates([row('a', 'bitcoin', 100_000)], {});
    assert.deepEqual(plan.updates, [], 'aucune écriture');
    assert.equal(plan.skipped, 1);
  });

  it('ne réécrit pas un prix inchangé — chaque UPDATE réveille tout le club', () => {
    const plan = planUpdates([row('a', 'bitcoin', 120_911)], { bitcoin: 120_911 });
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.skipped, 1);
  });

  it('rejette une valeur inexploitable plutôt que de l’écrire', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 'cher' as never]) {
      const plan = planUpdates([row('a', 'bitcoin', 100_000)], { bitcoin: bad });
      assert.deepEqual(plan.updates, [], `valeur ${String(bad)}`);
      assert.equal(plan.skipped, 1);
    }
  });

  it('dédoublonne les identifiants à demander', () => {
    const plan = planUpdates(
      [row('a', 'bitcoin', null), row('b', 'bitcoin', null), row('c', 'ethereum', null)],
      {},
    );
    assert.deepEqual(plan.ids, ['bitcoin', 'ethereum']);
  });

  it('applique un même cours à plusieurs positions du même actif', () => {
    const plan = planUpdates([row('a', 'bitcoin', 100_000), row('b', 'bitcoin', 61_000)], {
      bitcoin: 120_911,
    });
    assert.deepEqual(plan.updates, [
      { id: 'a', price: 120_911 },
      { id: 'b', price: 120_911 },
    ]);
  });

  it('ne demande rien quand il n’y a aucun actif coté', () => {
    const plan = planUpdates([], { bitcoin: 120_911 });
    assert.deepEqual(plan, { updates: [], skipped: 0, ids: [] });
  });
});

describe('découpage en lots', () => {
  it('respecte la taille demandée', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  it('rend un seul lot quand tout tient', () => {
    assert.deepEqual(chunk([1, 2], 100), [[1, 2]]);
  });

  it('rend une liste vide pour une entrée vide', () => {
    assert.deepEqual(chunk([], 10), []);
  });

  it('refuse une taille absurde plutôt que de boucler sans fin', () => {
    assert.throws(() => chunk([1, 2], 0), RangeError);
  });
});
