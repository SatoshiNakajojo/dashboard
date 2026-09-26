/**
 * Annonces de présence.
 *
 * Une annonce mal formulée est pire qu'aucune : « undefined vient à undefined »
 * fait douter de tout le reste de l'app.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_NOTICES,
  noticeText,
  pushNotice,
  type AttendanceNotice,
} from '@/lib/attendanceNotice';

const notice = (id: string, arriving = true): AttendanceNotice => ({
  id,
  eventId: id.split(':')[0]!,
  userId: id.split(':')[1]!,
  arriving,
});

describe('formulation', () => {
  it('nomme qui vient et à quoi', () => {
    assert.equal(
      noticeText({ arriving: true }, 'Alex', 'Grillades & Halving Talk'),
      'Alex vient à Grillades & Halving Talk',
    );
  });

  it('dit aussi le contraire', () => {
    assert.equal(
      noticeText({ arriving: false }, 'Léa', 'Night Trading Session'),
      'Léa ne vient plus à Night Trading Session',
    );
  });

  it('se rabat sur « un membre » plutôt que sur un trou', () => {
    assert.equal(noticeText({ arriving: true }, null, 'Pastaga'), 'Un membre vient à Pastaga');
    assert.equal(noticeText({ arriving: true }, '   ', 'Pastaga'), 'Un membre vient à Pastaga');
    assert.equal(
      noticeText({ arriving: true }, undefined, 'Pastaga'),
      'Un membre vient à Pastaga',
    );
  });

  it('se rabat sur « une soirée » quand le titre n’est pas encore arrivé', () => {
    // La soirée peut avoir été créée dans la même seconde : la présence arrive
    // avant que la liste ne soit relue.
    assert.equal(noticeText({ arriving: true }, 'Marco', null), 'Marco vient à une soirée');
    assert.equal(
      noticeText({ arriving: false }, null, ''),
      'Un membre ne vient plus à une soirée',
    );
  });
});

describe('pile d’annonces', () => {
  it('met la plus récente en tête', () => {
    const stack = pushNotice(pushNotice([], notice('e1:u1')), notice('e1:u2'));
    assert.deepEqual(
      stack.map((n) => n.id),
      ['e1:u2', 'e1:u1'],
    );
  });

  it('remplace l’annonce d’un membre qui se ravise', () => {
    // « Je viens », puis non : une seule ligne, la dernière.
    const stack = pushNotice(pushNotice([], notice('e1:u1', true)), notice('e1:u1', false));
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.arriving, false);
  });

  it('ne laisse pas l’écran se remplir', () => {
    let stack: AttendanceNotice[] = [];
    for (let i = 0; i < MAX_NOTICES + 4; i++) stack = pushNotice(stack, notice(`e1:u${i}`));
    assert.equal(stack.length, MAX_NOTICES);
    assert.equal(stack[0]!.id, `e1:u${MAX_NOTICES + 3}`, 'la plus récente survit');
  });

  it('ne modifie pas la pile qu’on lui donne', () => {
    const before: AttendanceNotice[] = [notice('e1:u1')];
    pushNotice(before, notice('e1:u2'));
    assert.equal(before.length, 1);
  });
});

describe('« Viens pas »', () => {
  it('se dit autrement que se décommander', () => {
    assert.equal(
      noticeText({ arriving: false, declining: true }, 'Marco', 'Grillades & Halving Talk'),
      'Marco ne viendra pas à Grillades & Halving Talk',
    );
  });
});
