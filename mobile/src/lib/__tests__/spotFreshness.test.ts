/**
 * `HORS LIGNE` ne s'affiche que pour une vraie panne, pas pour un refus ponctuel.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OFFLINE_AFTER_MS, isOffline } from '@/lib/spotFreshness';

const NOW = 1_758_700_000_000;

describe('bandeau hors ligne', () => {
  it('reste en ligne après un refus ponctuel', () => {
    // Le cours a 70 s : l'actualisation vient d'échouer, mais il est encore bon.
    assert.equal(isOffline(NOW - 70_000, NOW), false);
  });

  it('bascule après plusieurs minutes sans réponse', () => {
    assert.equal(isOffline(NOW - OFFLINE_AFTER_MS - 1, NOW), true);
  });

  it('est hors ligne tant qu’aucun cours n’a été reçu', () => {
    assert.equal(isOffline(0, NOW), true);
  });
});
