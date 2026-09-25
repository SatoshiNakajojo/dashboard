import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeViewport, viewportInfo } from '@/lib/viewportInfo';

describe('mesures d’écran', () => {
  it('se lisent en une ligne', () => {
    assert.equal(
      describeViewport({
        standalone: true,
        screen: 844,
        inner: 797,
        layout: 797,
        gap: 47,
        fits: 6,
      }),
      'ÉCRAN 844 · PAGE 797 · INNER 797 · CALE 47 · 6 MESURES',
    );
    assert.ok(
      describeViewport({
        standalone: true,
        screen: 844,
        inner: 844,
        layout: 844,
        gap: 0,
        fits: 1,
      }).endsWith('1 MESURE'),
    );
  });

  it('n’existent pas hors d’une page', () => {
    assert.equal(viewportInfo(), null);
  });
});
