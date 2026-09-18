/**
 * Amorçage d'un profil — les deux fonctions pures.
 *
 * Elles décident de ce qu'un membre voit de lui-même partout dans l'app :
 * ses initiales sur son avatar, sa couleur sur sa courbe de l'Oracle.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PALETTE, initialsFrom, pickColor } from '@/features/auth/profile';
import { MEMBER_LIST } from '@/mocks/members';

describe('initiales dérivées du prénom', () => {
  it('prend la première lettre de deux mots', () => {
    assert.equal(initialsFrom('John Doe'), 'JD');
  });

  it('traite un prénom composé comme un seul mot', () => {
    assert.equal(initialsFrom('Jean-Marc Dupont'), 'JD', 'pas JM');
    assert.equal(initialsFrom('N’Golo Kanté'), 'NK');
  });

  it('retire les accents plutôt que de les laisser passer', () => {
    assert.equal(initialsFrom('Léa'), 'LE');
    assert.equal(initialsFrom('Éric Ünal'), 'EU');
  });

  it('complète un prénom seul sur deux lettres', () => {
    assert.equal(initialsFrom('Léa'), 'LE');
    assert.equal(initialsFrom('A'), 'AX');
  });

  it('ne rend jamais une chaîne vide — la contrainte base exige deux lettres', () => {
    for (const input of ['', '   ', '42', '💎🙌']) {
      const result = initialsFrom(input);
      assert.match(result, /^[A-ZÀ-Ý]{2}$/, `entrée ${JSON.stringify(input)} → ${result}`);
    }
  });

  it('ignore les mots vides après nettoyage', () => {
    assert.equal(initialsFrom('  Léa   Martin  '), 'LM');
  });
});

describe('attribution de couleur', () => {
  it('prend la première libre', () => {
    assert.equal(pickColor([]), '#E8A33D');
    assert.equal(pickColor(['#E8A33D']), '#6E9A78');
  });

  it('ignore la casse — la base stocke ce qu’on lui donne', () => {
    assert.equal(pickColor(['#e8a33d', '#6E9A78']), '#8C7BA8');
  });

  it('donne sept couleurs distinctes à un club de sept', () => {
    const taken: string[] = [];
    for (let i = 0; i < MEMBER_LIST.length; i++) taken.push(pickColor(taken));
    assert.equal(new Set(taken).size, MEMBER_LIST.length, 'aucune collision');
  });

  it('recycle au-delà de la palette plutôt que de renvoyer null', () => {
    const full = [...PALETTE];
    assert.equal(pickColor(full), '#E8A33D', 'la palette épuisée est un signal, pas un crash');
  });

  it('reproduit la palette du design', () => {
    const taken: string[] = [];
    const assigned = MEMBER_LIST.map(() => {
      const color = pickColor(taken);
      taken.push(color);
      return color;
    });
    assert.deepEqual(
      assigned,
      MEMBER_LIST.map((m) => m.color),
      'l’ordre de la palette suit celui des membres du design',
    );
  });
});
