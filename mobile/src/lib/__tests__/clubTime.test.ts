/**
 * Lecture d'une date de Crypto Night.
 *
 * Une date mal lue s'écrit en base et décale la soirée pour tout le club. Les
 * cas limites ici ne sont pas théoriques : le 31 avril se découpe parfaitement
 * en trois nombres, et un fuseau implicite déplace l'heure d'un membre en
 * déplacement.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CLUB_OFFSET_SUFFIX, parseClubDateTime, todayInClub } from '@/lib/clubTime';
import { formatTime, splitEventDate } from '@/lib/format';

describe('lecture d’une date de soirée', () => {
  it('lit le format français', () => {
    assert.equal(parseClubDateTime('03/10/2026', '19:30'), '2026-10-03T19:30:00+11:00');
  });

  it('tolère les séparateurs et les zéros manquants', () => {
    for (const date of ['3/10/2026', '03-10-2026', '03.10.2026', ' 03/10/2026 ']) {
      assert.equal(parseClubDateTime(date, '19:30'), '2026-10-03T19:30:00+11:00', date);
    }
    for (const time of ['19h30', '19H30', '9:05']) {
      assert.ok(parseClubDateTime('03/10/2026', time), time);
    }
    assert.equal(parseClubDateTime('03/10/2026', '9:05'), '2026-10-03T09:05:00+11:00');
  });

  it('ancre l’heure à Nouméa, pas au fuseau de l’appareil', () => {
    // Le décalage est écrit dans la chaîne : aucun `new Date` local ne peut le
    // déplacer entre la saisie et la base.
    assert.ok(parseClubDateTime('03/10/2026', '19:30')!.endsWith(CLUB_OFFSET_SUFFIX));
  });

  it('refuse une date qui n’existe pas', () => {
    // Elle se découpe pourtant sans la moindre erreur.
    assert.equal(parseClubDateTime('31/04/2026', '19:30'), null);
    assert.equal(parseClubDateTime('30/02/2026', '19:30'), null);
    assert.equal(parseClubDateTime('00/10/2026', '19:30'), null);
    assert.equal(parseClubDateTime('03/13/2026', '19:30'), null);
  });

  it('accepte le 29 février d’une année bissextile', () => {
    assert.equal(parseClubDateTime('29/02/2028', '20:00'), '2028-02-29T20:00:00+11:00');
    assert.equal(parseClubDateTime('29/02/2027', '20:00'), null);
  });

  it('refuse une heure impossible', () => {
    assert.equal(parseClubDateTime('03/10/2026', '24:00'), null);
    assert.equal(parseClubDateTime('03/10/2026', '19:60'), null);
  });

  it('refuse une saisie incomplète', () => {
    assert.equal(parseClubDateTime('', '19:30'), null);
    assert.equal(parseClubDateTime('03/10/2026', ''), null);
    assert.equal(parseClubDateTime('3 octobre', '19:30'), null);
  });
});

describe('date du jour au club', () => {
  it('donne le jour calédonien, pas le jour UTC', () => {
    // 21 septembre 2026, 22 h UTC — il est déjà le 22 à Nouméa.
    assert.equal(todayInClub(Date.UTC(2026, 8, 21, 22, 0)), '22/09/2026');
    assert.equal(todayInClub(Date.UTC(2026, 8, 21, 10, 0)), '21/09/2026');
  });

  it('se relit lui-même', () => {
    const today = todayInClub(Date.UTC(2026, 9, 3, 6, 0));
    assert.ok(parseClubDateTime(today, '19:30'));
  });
});

describe('affichage d’une soirée', () => {
  it('rend l’heure saisie, quel que soit le fuseau qui la lit', () => {
    // Ce test tourne en UTC. Sans ancrage, `19:30+11` se lirait « 08:30 » —
    // et la carte contredirait la saisie à une minute d'intervalle.
    const iso = parseClubDateTime('03/10/2026', '19:30')!;
    assert.equal(formatTime(iso), '19:30');
    assert.deepEqual(splitEventDate(iso), { day: '03', month: 'OCT' });
  });

  it('ne fait pas changer la soirée de jour', () => {
    // 23 h à Nouméa, c'est encore midi la veille en UTC : lu sans ancrage, le
    // bloc date afficherait le 2 octobre.
    const iso = parseClubDateTime('03/10/2026', '23:00')!;
    assert.equal(splitEventDate(iso).day, '03');
    assert.equal(formatTime(iso), '23:00');
  });

  it('reste lisible sur une date absente', () => {
    assert.equal(formatTime('pas une date'), '--:--');
    assert.deepEqual(splitEventDate(''), { day: '--', month: '' });
  });
});
