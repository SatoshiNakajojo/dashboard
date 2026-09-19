/**
 * Saisons du club.
 *
 * Une saison donne deux choses : l'étiquette écrite dans `predictions.season`
 * — soumise à une contrainte d'unicité par membre — et l'ancrage du repère de
 * l'Oracle. Se tromper sur la première empêche un membre de rejouer ; se
 * tromper sur le second lui laisse une toile sans avenir.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DAYS } from '@/lib/chart';
import { toRoman } from '@/lib/format';
import { romanRank } from '@/lib/performance';
import { SEASON_EPOCH, historyDays, seasonAt } from '@/lib/season';

const DAY = 86_400_000;
const at = (days: number, hours = 0) => SEASON_EPOCH + days * DAY + hours * 3_600_000;

describe('ouverture du club', () => {
  it('démarre à la saison I, jour 0', () => {
    const season = seasonAt(SEASON_EPOCH);
    assert.equal(season.ordinal, 1);
    assert.equal(season.roman, 'I');
    assert.equal(season.day, 0);
    assert.equal(season.code, '2026-S1');
  });

  it('tombe bien un 19 septembre à Nouméa, pas un 18', () => {
    // Le club est en UTC+11 : une saison doit tourner à minuit ici.
    const local = new Date(SEASON_EPOCH + 11 * 3_600_000).toISOString();
    assert.match(local, /^2026-09-19T00:00/);
  });

  it('ne recule pas avant l’ouverture', () => {
    // Horloge de téléphone mal réglée : mieux vaut la saison I que le rang 0,
    // qui deviendrait une clé de ligne.
    const season = seasonAt(SEASON_EPOCH - 400 * DAY);
    assert.equal(season.ordinal, 1);
    assert.equal(season.day, 0);
  });
});

describe('déroulement d’une saison', () => {
  it('avance d’un jour par jour', () => {
    assert.equal(seasonAt(at(0, 23)).day, 0, 'encore le jour 0 à 23 h');
    assert.equal(seasonAt(at(1)).day, 1);
    assert.equal(seasonAt(at(34)).day, 34);
  });

  it('laisse toujours un avenir à prédire', () => {
    // Le défaut corrigé : aujourd'hui tombait au jour 90 sur 90, la courbe
    // réelle couvrait la toile et il ne restait rien à tracer.
    for (const day of [0, 1, 45, 89]) {
      assert.ok(seasonAt(at(day)).day < DAYS, `jour ${day}`);
    }
  });

  it('tourne au 90e jour, pas avant', () => {
    assert.equal(seasonAt(at(89)).ordinal, 1);
    assert.equal(seasonAt(at(89)).day, 89);

    const next = seasonAt(at(90));
    assert.equal(next.ordinal, 2);
    assert.equal(next.day, 0);
    assert.equal(next.code, '2026-S2');
  });

  it('change d’année quand la saison commence dans l’année suivante', () => {
    // Saison III : 180 jours après le 19 septembre 2026, donc en mars 2027.
    const third = seasonAt(at(180));
    assert.equal(third.ordinal, 3);
    assert.equal(third.code, '2027-S3');
    assert.equal(third.roman, 'III');
  });

  it('donne une étiquette distincte à chaque saison', () => {
    const codes = [0, 90, 180, 270, 360, 450].map((d) => seasonAt(at(d)).code);
    assert.equal(new Set(codes).size, codes.length, codes.join(' '));
  });
});

describe('historique à demander', () => {
  it('ne demande jamais une fenêtre vide', () => {
    // CoinGecko refuse `days=0`, et le premier jour doit tout de même afficher
    // un point.
    assert.equal(historyDays(seasonAt(at(0)), at(0)), 1);
  });

  it('demande les jours écoulés, pas quatre-vingt-dix', () => {
    const now = at(34, 5);
    assert.equal(historyDays(seasonAt(now), now), 35);
  });

  it('reste borné par la durée d’une saison', () => {
    const now = at(89, 23);
    assert.ok(historyDays(seasonAt(now), now) <= DAYS);
  });
});

describe('chiffres romains', () => {
  it('écrit les rangs du club', () => {
    assert.deepEqual([1, 3, 4, 9, 10].map(toRoman), ['I', 'III', 'IV', 'IX', 'X']);
  });

  it('ne retombe pas sur un chiffre arabe passé dix', () => {
    // L'ancienne table s'arrêtait à X et rendait « 11 » au onzième rang.
    assert.equal(toRoman(11), 'XI');
    assert.equal(toRoman(14), 'XIV');
    assert.equal(romanRank(10), 'XI', 'romanRank est indexé à zéro');
  });

  it('reste indexé à zéro pour les classements', () => {
    assert.deepEqual([0, 1, 2].map(romanRank), ['I', 'II', 'III']);
  });
});
