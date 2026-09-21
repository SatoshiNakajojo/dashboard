/**
 * Thèmes d'une soirée.
 *
 * La liste est ouverte — le club invente ses thèmes — mais la base borne, et
 * un doublon de casse produirait deux étiquettes pour une même idée.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  KNOWN_THEMES,
  MAX_THEMES,
  formatThemes,
  normalizeThemes,
  suggestThemes,
} from '@/lib/nightThemes';

describe('nettoyage d’une liste de thèmes', () => {
  it('coupe les blancs et écarte les vides', () => {
    assert.deepEqual(normalizeThemes([' Crypto Night ', '', '   ']), ['Crypto Night']);
  });

  it('écarte les doublons sans tenir compte de la casse', () => {
    // Sinon « Pizza Night » et « pizza night » coexistent au bout d'un mois.
    assert.deepEqual(normalizeThemes(['Crypto Night', 'crypto night', 'CRYPTO NIGHT']), [
      'Crypto Night',
    ]);
  });

  it('garde l’ordre de saisie — c’est celui de la carte', () => {
    assert.deepEqual(normalizeThemes(['Stock Night', 'Crypto Night']), [
      'Stock Night',
      'Crypto Night',
    ]);
  });

  it('borne au maximum que la base accepte', () => {
    const trop = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    assert.equal(normalizeThemes(trop).length, MAX_THEMES);
  });

  it('borne aussi la longueur d’un thème', () => {
    const [long] = normalizeThemes(['x'.repeat(200)]);
    assert.equal(long!.length, 40);
  });
});

describe('affichage', () => {
  it('sépare les thèmes par un point médian', () => {
    assert.equal(formatThemes(['Crypto Night', 'Stock Night']), 'Crypto Night · Stock Night');
  });

  it('reste lisible sur un seul thème', () => {
    assert.equal(formatThemes(['Crypto Night']), 'Crypto Night');
  });
});

describe('propositions', () => {
  it('offre d’abord les trois du club', () => {
    assert.deepEqual(suggestThemes([]), [...KNOWN_THEMES]);
  });

  it('reprend ce que les membres ont inventé, sans le dupliquer', () => {
    const proposed = suggestThemes(['Pizza Night', 'crypto night', 'Pizza Night']);
    assert.deepEqual(proposed, [...KNOWN_THEMES, 'Pizza Night']);
  });
});
