import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fieldDateFromKey,
  keyFromFieldDate,
  longDateLabel,
  monthOfKey,
  shortDateLabel,
  timeOptions,
} from '@/lib/datePicker';

describe('choisir une date au calendrier', () => {
  it('passe du champ au calendrier et retour', () => {
    assert.equal(keyFromFieldDate('03/10/2026'), '2026-10-03');
    assert.equal(fieldDateFromKey('2026-10-03'), '03/10/2026');
    assert.equal(fieldDateFromKey(keyFromFieldDate('29/02/2028')!), '29/02/2028');
  });

  it('refuse ce qui n’est pas un jour', () => {
    assert.equal(keyFromFieldDate('31/04/2026'), null);
    assert.equal(keyFromFieldDate('3/10/2026'), null);
    assert.equal(keyFromFieldDate(''), null);
    assert.equal(fieldDateFromKey('pas une clé'), '');
  });

  it('ouvre le calendrier sur le mois du jour choisi', () => {
    assert.deepEqual(monthOfKey('2026-10-03'), { year: 2026, month: 10 });
  });

  it('écrit la date en français', () => {
    assert.equal(shortDateLabel('2026-10-03'), 'sam. 3 oct. 2026');
    assert.equal(longDateLabel('2026-10-03'), 'samedi 3 octobre 2026');
    assert.equal(longDateLabel('2026-08-16'), 'dimanche 16 août 2026');
  });
});

describe('choisir une heure au menu', () => {
  it('propose toute la journée, par quart d’heure', () => {
    const options = timeOptions();
    assert.equal(options.length, 96);
    assert.equal(options[0], '00:00');
    assert.equal(options[78], '19:30');
    assert.equal(options.at(-1), '23:45');
  });

  it('garde une heure hors du pas, à sa place', () => {
    const options = timeOptions('19:40');
    assert.equal(options.length, 97);
    assert.equal(options[options.indexOf('19:30') + 1], '19:40');
    assert.equal(timeOptions('19:30').length, 96);
    assert.equal(timeOptions('25:00').length, 96);
  });
});
