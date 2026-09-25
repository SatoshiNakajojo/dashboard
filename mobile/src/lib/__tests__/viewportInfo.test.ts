import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeViewport, viewportInfo } from '@/lib/viewportInfo';

describe('mesures d’écran', () => {
  const base = { standalone: true, screen: 844, inner: 797, layout: 797, gap: 47 };

  it('se lisent en une ligne', () => {
    assert.equal(
      describeViewport({ ...base, fits: 6, toggles: 1, frozen: false }),
      'ÉCRAN 844 · INNER 797 · PAGE 797 · CALE 47 · 6 MESURES · 1 BASCULE',
    );
  });

  it('disent quand le coupe-circuit a figé la page', () => {
    assert.ok(
      describeViewport({ ...base, layout: null, fits: 9, toggles: 4, frozen: true }).endsWith(
        'PAGE — · CALE 47 · 9 MESURES · 4 BASCULES · FIGÉ',
      ),
    );
  });

  it('n’existent pas hors d’une page', () => {
    assert.equal(viewportInfo(), null);
  });
});
