/**
 * Minage des blocs de l'écran de chargement.
 *
 * Un compteur qui sort de ses bornes dessine des blocs fantômes ou plante le
 * rendu ; c'est le genre de défaut qu'on ne voit qu'en réseau lent, donc
 * jamais sur la machine qui l'a écrit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BLOCK_COUNT, BLOCK_MS, CYCLE_MS, PAUSE_MS, minedAt } from '@/lib/mining';

describe('progression du minage', () => {
  it('part de zéro et avance d’un bloc par intervalle', () => {
    assert.equal(minedAt(0), 0);
    assert.equal(minedAt(BLOCK_MS - 1), 0);
    assert.equal(minedAt(BLOCK_MS), 1);
    assert.equal(minedAt(BLOCK_MS * 3 + 10), 3);
  });

  it('reste pleine pendant la pause plutôt que de se vider aussitôt', () => {
    const pleine = BLOCK_COUNT * BLOCK_MS;
    assert.equal(minedAt(pleine), BLOCK_COUNT);
    assert.equal(
      minedAt(pleine + PAUSE_MS - 1),
      BLOCK_COUNT,
      'toujours pleine en fin de pause',
    );
  });

  it('repart à zéro au cycle suivant', () => {
    assert.equal(minedAt(CYCLE_MS), 0);
    assert.equal(minedAt(CYCLE_MS + BLOCK_MS * 2), 2);
    assert.equal(minedAt(CYCLE_MS * 7 + BLOCK_MS * 5), 5, 'le septième tour vaut le premier');
  });

  it('ne sort jamais des bornes', () => {
    for (const t of [-1, -100_000, 0, 1, 12_345, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const n = minedAt(t);
      assert.ok(Number.isInteger(n), `${t} → ${n}`);
      assert.ok(n >= 0 && n <= BLOCK_COUNT, `${t} → ${n}`);
    }
  });

  it('accepte une chaîne plus courte', () => {
    assert.equal(minedAt(BLOCK_MS * 3, 3), 3);
    assert.equal(minedAt(3 * BLOCK_MS + PAUSE_MS, 3), 0, 'le cycle suit le nombre de blocs');
  });
});
