/**
 * Grille d'un mois.
 *
 * Une grille décalée d'un jour est invisible jusqu'à ce que quelqu'un rate la
 * soirée. Les cas limites — début de mois un dimanche, février bissextile,
 * soirée de fin de journée — sont exactement ceux qui décalent.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseClubDateTime } from '@/lib/clubTime';
import {
  WEEKDAYS,
  buildMonth,
  clubDayKey,
  currentMonth,
  monthLabel,
  monthPrefix,
  shiftMonth,
} from '@/lib/monthGrid';

describe('rattachement d’une soirée à un jour', () => {
  it('range une soirée du soir au bon jour', () => {
    // 19 h 30 à Nouméa, c'est 08 h 30 UTC le même jour — mais 23 h bascule.
    assert.equal(clubDayKey(parseClubDateTime('03/10/2026', '19:30')!), '2026-10-03');
    assert.equal(clubDayKey(parseClubDateTime('03/10/2026', '23:30')!), '2026-10-03');
    assert.equal(clubDayKey(parseClubDateTime('03/10/2026', '00:30')!), '2026-10-03');
  });

  it('reste muet sur une date illisible', () => {
    assert.equal(clubDayKey('pas une date'), '');
  });
});

describe('construction de la grille', () => {
  it('fait toujours six semaines de sept jours', () => {
    for (const [y, m] of [
      [2026, 2],
      [2026, 10],
      [2027, 8],
    ] as const) {
      const weeks = buildMonth(y, m);
      assert.equal(weeks.length, 6, `${m}/${y}`);
      for (const week of weeks) assert.equal(week.length, 7);
    }
  });

  it('commence un lundi', () => {
    // Le 1er octobre 2026 est un jeudi : la grille démarre le lundi 28 septembre.
    const weeks = buildMonth(2026, 10);
    assert.equal(weeks[0]![0]!.key, '2026-09-28');
    assert.equal(weeks[0]![0]!.inMonth, false);
    assert.equal(weeks[0]![3]!.key, '2026-10-01');
    assert.equal(weeks[0]![3]!.inMonth, true);
  });

  it('gère un mois qui commence un lundi sans ligne vide', () => {
    // Juin 2026 commence un lundi : la première case est le 1er.
    const weeks = buildMonth(2026, 6);
    assert.equal(weeks[0]![0]!.key, '2026-06-01');
    assert.equal(weeks[0]![0]!.inMonth, true);
  });

  it('compte les vingt-neuf jours d’un février bissextile', () => {
    const days = buildMonth(2028, 2)
      .flat()
      .filter((d) => d.inMonth);
    assert.equal(days.length, 29);
    assert.equal(days.at(-1)!.key, '2028-02-29');
  });

  it('marque aujourd’hui à l’heure du club', () => {
    // 21 septembre 22 h UTC : il est déjà le 22 à Nouméa.
    const weeks = buildMonth(2026, 9, Date.UTC(2026, 8, 21, 22, 0));
    const today = weeks.flat().filter((d) => d.isToday);
    assert.equal(today.length, 1);
    assert.equal(today[0]!.key, '2026-09-22');
  });

  it('n’a qu’un seul aujourd’hui, ou aucun', () => {
    const autre = buildMonth(2027, 3, Date.UTC(2026, 8, 21, 10, 0));
    assert.equal(autre.flat().filter((d) => d.isToday).length, 0);
  });
});

describe('navigation', () => {
  it('passe l’année dans les deux sens', () => {
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth(2026, 10, 0), { year: 2026, month: 10 });
  });

  it('supporte un saut de plusieurs mois', () => {
    assert.deepEqual(shiftMonth(2026, 10, 15), { year: 2028, month: 1 });
    assert.deepEqual(shiftMonth(2026, 2, -14), { year: 2024, month: 12 });
  });

  it('nomme le mois en français', () => {
    assert.equal(monthLabel(2026, 10), 'OCTOBRE 2026');
    assert.equal(monthLabel(2026, 2), 'FÉVRIER 2026');
  });

  it('démarre sur le mois calédonien', () => {
    assert.deepEqual(currentMonth(Date.UTC(2026, 8, 30, 22, 0)), { year: 2026, month: 10 });
  });
});

describe('en-tête de semaine', () => {
  it('commence le lundi', () => {
    assert.equal(WEEKDAYS.length, 7);
    assert.equal(WEEKDAYS[0], 'L');
    assert.equal(WEEKDAYS[6], 'D');
  });
});

describe('mois d’une soirée', () => {
  it('rattache une soirée au mois que la grille affiche', () => {
    const prefix = monthPrefix(2026, 10);
    assert.equal(prefix, '2026-10');
    assert.ok(clubDayKey(parseClubDateTime('03/10/2026', '19:30')!).startsWith(prefix));
    assert.ok(!clubDayKey(parseClubDateTime('18/09/2026', '20:00')!).startsWith(prefix));
  });

  it('range une soirée de fin de mois dans le mois du club, pas celui d’UTC', () => {
    // 1er novembre 00 h 30 à Nouméa, c'est encore le 31 octobre en UTC. La
    // soirée appartient à novembre — c'est là que ses invités la chercheront.
    const key = clubDayKey(parseClubDateTime('01/11/2026', '00:30')!);
    assert.equal(key, '2026-11-01');
    assert.ok(key.startsWith(monthPrefix(2026, 11)));
    assert.ok(!key.startsWith(monthPrefix(2026, 10)));
  });

  it('garde le zéro devant les mois d’un chiffre', () => {
    assert.equal(monthPrefix(2027, 3), '2027-03', 'sinon « 2027-3 » ne préfixe rien');
  });
});
