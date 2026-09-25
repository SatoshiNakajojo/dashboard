import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keyboardFrameStyles, keyboardState } from '@/lib/keyboardFrame';

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
