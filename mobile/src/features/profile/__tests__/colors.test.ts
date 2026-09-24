/**
 * La palette du club, et le choix d'une couleur.
 *
 * Une couleur ajoutée à la légère peut ressembler à une autre — deux courbes
 * de l'Oracle qu'on ne distingue plus — ou rendre des initiales illisibles.
 * Ces tests mesurent les deux, au lieu de s'en remettre à l'œil.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COLORS, PALETTE, colorName } from '@/features/auth/profile';
import { colorChoices } from '@/features/profile/colors';
import { c } from '@/theme/tokens';
import type { Member } from '@/types/domain';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** Écart perçu (CIE76, en Lab). Sous ~10, deux couleurs se confondent sur une courbe fine. */
const lab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)] as const;
};
const deltaE = (a: string, b: string) => {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe('la palette', () => {
  it('offre de quoi choisir : deux fois plus de couleurs que de membres', () => {
    assert.equal(COLORS.length, 14);
    assert.equal(new Set(PALETTE.map((h) => h.toLowerCase())).size, 14, 'pas de doublon');
    assert.equal(new Set(COLORS.map((co) => co.name)).size, 14, 'un nom par couleur');
  });

  it('garde les sept couleurs du design en tête, dans leur ordre', () => {
    assert.deepEqual(PALETTE.slice(0, 7), [
      '#E8903D',
      '#6E9A78',
      '#8C7BA8',
      '#B3574F',
      '#5B8A9A',
      '#C9A227',
      '#F2EBDD',
    ]);
  });

  it('distingue chaque couleur de toutes les autres', () => {
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        const d = deltaE(PALETTE[i]!, PALETTE[j]!);
        assert.ok(
          d >= 15,
          `${COLORS[i]!.name} et ${COLORS[j]!.name} trop proches (ΔE ${d.toFixed(1)})`,
        );
      }
    }
  });

  it('garde les initiales lisibles et la couleur visible sur le fond', () => {
    // 3:1 : le seuil WCAG des éléments d'interface et du texte en gros (1.4.3
    // et 1.4.11). Deux initiales ne sont pas un paragraphe, et « Brique »,
    // couleur du design d’origine, est à 3,97.
    for (const { hex, name } of COLORS) {
      assert.ok(contrast(hex, c.onAvatar) >= 3, `${name} : initiales illisibles`);
      assert.ok(contrast(hex, c.ink) >= 3, `${name} : se perd sur le fond`);
    }
  });

  it('nomme une couleur, sans tenir compte de la casse', () => {
    assert.equal(colorName('#c7788f'), 'Rose');
    assert.equal(colorName('#123456'), null);
  });
});

describe('le choix d’une couleur', () => {
  const member = (id: string, color: string): Member => ({
    id,
    displayName: id,
    initials: id.slice(0, 2).toUpperCase(),
    color,
    avatarUrl: null,
    links: [],
  });

  it('dit qui porte déjà chaque couleur', () => {
    const choices = colorChoices([member('moi', '#E8903D'), member('alex', '#6e9a78')], 'moi');
    assert.equal(choices.find((ch) => ch.name === 'Sauge')?.takenBy?.id, 'alex');
    assert.equal(choices.find((ch) => ch.name === 'Rose')?.takenBy, null);
  });

  it('ne compte pas ma propre couleur comme prise', () => {
    const choices = colorChoices([member('moi', '#E8903D')], 'moi');
    assert.equal(choices.find((ch) => ch.name === 'Or')?.takenBy, null);
  });
});
