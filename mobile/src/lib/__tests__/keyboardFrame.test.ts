import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeKeyboard,
  keyboardFrameStyles,
  keyboardState,
  referenceHeight,
  revealScrollTop,
} from '@/lib/keyboardFrame';

describe('le clavier et les feuilles du bas', () => {
  it('reconnaît un clavier ouvert à ce qu’il cache', () => {
    // iPhone 11, app installée : 852 de page, le clavier en prend 336.
    assert.deepEqual(keyboardState(852, 516, 0), { open: true, top: 0, height: 516 });
    // iOS a fait glisser la zone visible de 40 px.
    assert.deepEqual(keyboardState(852, 516, 40.4), { open: true, top: 40, height: 516 });
  });

  it('ignore ce qui n’est pas un clavier', () => {
    assert.equal(keyboardState(852, 852, 0).open, false);
    assert.equal(keyboardState(852, 790, 0).open, false, 'une barre d’outils');
    assert.equal(keyboardState(852, 0, 0).open, false, 'une mesure absurde');
  });

  it('garde la feuille en bas sans clavier, la cale en haut de la zone visible avec', () => {
    assert.deepEqual(keyboardFrameStyles(keyboardState(852, 852, 0)), {
      frame: { justifyContent: 'flex-end' },
      sheet: { maxHeight: '92%' },
    });
    assert.deepEqual(keyboardFrameStyles(keyboardState(852, 516, 40)), {
      frame: { justifyContent: 'flex-start', paddingTop: 46 },
      sheet: { maxHeight: 504 },
    });
  });
});

describe('le clavier sur iPhone', () => {
  it('se reconnaît même quand innerHeight suit la zone visible', () => {
    // iOS a réduit innerHeight avec le clavier : l'écart a disparu…
    assert.equal(keyboardState(516, 516, 0).open, false);
    // …mais la plus grande zone visible mesurée, elle, s'en souvient.
    assert.equal(referenceHeight(516, 852), 852);
    assert.equal(keyboardState(referenceHeight(516, 852), 516, 0).open, true);
    assert.equal(referenceHeight(852, undefined), 852);
  });

  it('fait défiler la feuille jusqu’au champ, et seulement s’il le faut', () => {
    const zone = { top: 100, bottom: 500, scrollTop: 200 };
    // Champ sous le bas de la zone : on descend de ce qui manque, marge comprise.
    assert.equal(revealScrollTop(zone, { top: 520, bottom: 560 }), 276);
    // Champ au-dessus : on remonte.
    assert.equal(revealScrollTop(zone, { top: 60, bottom: 100 }), 144);
    // Déjà visible : rien.
    assert.equal(revealScrollTop(zone, { top: 300, bottom: 340 }), null);
    // Plus haut que la zone : on montre son début.
    assert.equal(revealScrollTop(zone, { top: 450, bottom: 1000 }), 534);
    assert.equal(
      revealScrollTop({ top: 0, bottom: 100, scrollTop: 0 }, { top: -50, bottom: -10 }),
      0,
    );
  });

  it('résume ses mesures pour le panneau « À propos »', () => {
    assert.equal(
      describeKeyboard({
        inner: 852,
        reference: 852,
        visible: 516,
        top: 0,
        open: true,
        field: [300, 340],
      }),
      'CLAVIER · INNER 852 · RÉF 852 · VISIBLE 516 · HAUT 0 · OUVERT · CHAMP 300–340',
    );
  });
});
