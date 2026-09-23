/**
 * Justesse d'un tracé.
 *
 * C'est un chiffre que sept personnes vont comparer entre elles. S'il peut
 * sortir de 0–100, ou récompenser un tracé qui ne touche pas le cours, il vaut
 * mieux ne pas l'afficher du tout.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACCURACY_TIERS, PERFECT, accuracyLabel, accuracyPercent } from '@/lib/accuracy';
import type { PricePoint } from '@/lib/chart';

/** Un tracé horizontal à ce prix, du jour 0 au jour 90 — en prix, pas en pixels. */
const flat = (price: number): PricePoint[] => [
  [0, price],
  [90, price],
];

describe('justesse', () => {
  it('donne 100 % à un tracé confondu avec le cours', () => {
    const courbe = flat(120_000);
    const score = accuracyPercent(courbe, courbe);
    assert.ok(score !== null && score > 99.99, `obtenu ${score}`);
  });

  it('retire le pourcentage d’erreur', () => {
    // 110 000 contre 100 000 : 10 % d'erreur, donc 90 % de justesse.
    const score = accuracyPercent(flat(110_000), flat(100_000));
    assert.ok(score !== null && Math.abs(score - 90) < 0.5, `obtenu ${score}`);
  });

  it('décroît quand on s’éloigne', () => {
    const réel = flat(100_000);
    const proche = accuracyPercent(flat(105_000), réel)!;
    const loin = accuracyPercent(flat(140_000), réel)!;
    assert.ok(proche > loin, `${proche} doit dépasser ${loin}`);
  });

  it('ne descend jamais sous zéro', () => {
    // Un tracé à 200 000 contre un cours à 80 000 : 150 % d'erreur, et -50 %
    // n'est pas une justesse.
    const score = accuracyPercent(flat(200_000), flat(80_000));
    assert.ok(score !== null && score >= 0, `obtenu ${score}`);
  });

  it('reste dans 0–100 quoi qu’on lui donne', () => {
    // Jusqu'à dix ans d'horizon : les prix ne sont plus bornés par un repère.
    for (const mien of [8_000, 80_000, 120_000, 400_000, 2_000_000]) {
      for (const réel of [8_000, 80_000, 120_000, 2_000_000]) {
        const score = accuracyPercent(flat(mien), flat(réel));
        assert.ok(
          score !== null && score >= 0 && score <= PERFECT,
          `${mien}/${réel} → ${score}`,
        );
      }
    }
  });

  it('reste muette tant qu’il n’y a rien à comparer', () => {
    // Zéro se lirait « vous vous trompez complètement » ; on ne sait pas
    // encore, ce qui est différent.
    assert.equal(accuracyPercent([], flat(100_000)), null);
    assert.equal(accuracyPercent([[34, 10]], flat(100_000)), null);
    assert.equal(
      accuracyPercent(
        [
          [60, 100_000],
          [90, 100_000],
        ],
        [
          [0, 100_000],
          [30, 100_000],
        ],
      ),
      null,
      'plages disjointes',
    );
  });
});

describe('qualificatif', () => {
  it('suit les paliers', () => {
    assert.equal(accuracyLabel(97), 'DANS LE MILLE');
    assert.equal(accuracyLabel(90), 'DANS LE MILLE', 'le seuil est inclusif');
    assert.equal(accuracyLabel(89.9), 'PAS LOIN');
    assert.equal(accuracyLabel(70), 'PAS LOIN');
    assert.equal(accuracyLabel(12), 'À CÔTÉ');
    assert.equal(accuracyLabel(0), 'À CÔTÉ');
  });

  it('se tait sans chiffre', () => {
    assert.equal(accuracyLabel(null), null);
  });

  it('couvre toute la plage — aucun score sans mot', () => {
    for (let v = 0; v <= 100; v += 0.5) {
      assert.ok(accuracyLabel(v), `${v} n’a pas de qualificatif`);
    }
    assert.equal(
      ACCURACY_TIERS[ACCURACY_TIERS.length - 1]!.min,
      0,
      'le dernier palier attrape tout',
    );
  });
});
