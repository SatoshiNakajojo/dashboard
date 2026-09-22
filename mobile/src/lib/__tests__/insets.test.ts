/**
 * Marge sous la barre d'onglets.
 *
 * Le défaut d'origine était invisible sur la machine de développement, où
 * l'inset vaut 0 : il ne se voyait que sur un vrai téléphone, où il mangeait
 * un huitième de l'écran.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_BOTTOM_INSET, MIN_BOTTOM_PADDING, bottomInset } from '@/lib/insets';

describe('marge basse', () => {
  it('donne de l’air même sans zone système', () => {
    // Navigateur de bureau, iPhone à bouton : `insets.bottom` vaut 0, et le
    // texte ne doit pas coller au bord.
    assert.equal(bottomInset(0), MIN_BOTTOM_PADDING);
  });

  it('dégage la barre d’accueil sans lui offrir toute sa hauteur', () => {
    // 34 pt est calibré pour des zones tactiles. Trois libellés de texte n'ont
    // besoin que de ne pas passer sous l'indicateur lui-même.
    assert.equal(bottomInset(34), 24);
    assert.ok(bottomInset(34) < 34, 'sinon on reperd ce qu’on vient de gagner');
  });

  it('suit un inset modeste plutôt que de l’ignorer', () => {
    assert.equal(bottomInset(20), 10);
    assert.equal(bottomInset(28), 18);
  });

  it('borne une valeur aberrante', () => {
    // Mesuré sur la capture du club : la PWA annonçait plus de 70 pt, ce qui,
    // ajouté aux 24 de la maquette, donnait une barre de 131 pt.
    assert.equal(bottomInset(73), MAX_BOTTOM_INSET);
    assert.equal(bottomInset(84), MAX_BOTTOM_INSET);
    assert.equal(bottomInset(1000), MAX_BOTTOM_INSET);
  });

  it('ne suit pas une valeur absurde', () => {
    assert.equal(bottomInset(-10), MIN_BOTTOM_PADDING, 'un inset négatif n’existe pas');
    // NaN et l'infini ne sont pas des mesures : on retombe sur le minimum
    // plutôt que sur le maximum, parce qu'une valeur qu'on ne comprend pas ne
    // justifie pas de réserver le plus de place possible.
    assert.equal(bottomInset(Number.NaN), MIN_BOTTOM_PADDING);
    assert.equal(bottomInset(Number.POSITIVE_INFINITY), MIN_BOTTOM_PADDING);
  });

  it('ne dépasse jamais les bornes, quelle que soit l’entrée', () => {
    for (let v = -50; v <= 200; v += 7) {
      const p = bottomInset(v);
      assert.ok(p >= MIN_BOTTOM_PADDING && p <= MAX_BOTTOM_INSET, `${v} → ${p}`);
    }
  });
});
