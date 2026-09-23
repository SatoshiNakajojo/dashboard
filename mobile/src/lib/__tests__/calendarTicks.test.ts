/**
 * Les dates de l'axe des temps.
 *
 * Une graduation décalée d'un jour ne lève rien : elle fait simplement lire la
 * mauvaise date sous une courbe. D'où ces tests, sur le fuseau de Nouméa et
 * sur le nombre d'étiquettes qui tiennent à l'écran.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calendarTicks } from '@/lib/calendarTicks';

const DAY = 86_400_000;
/** Minuit à Nouméa, le 20 septembre 2026 : 13 h UTC la veille. */
const MINUIT_20_SEPT = Date.UTC(2026, 8, 19, 13);

describe('graduations en jours', () => {
  it('tombent sur minuit à Nouméa', () => {
    const ticks = calendarTicks(MINUIT_20_SEPT + 5 * 3_600_000, 10);
    // Le premier minuit après l'origine est celui du 21.
    assert.equal(ticks[0]!.label, '21');
    assert.ok(Math.abs(ticks[0]!.day - 19 / 24) < 1e-9);
  });

  it('en posent assez peu pour rester lisibles', () => {
    const ticks = calendarTicks(MINUIT_20_SEPT, 10);
    assert.ok(ticks.length >= 4 && ticks.length <= 6, `${ticks.length}`);
  });
});

describe('graduations en mois', () => {
  it('tombent sur le premier du mois, à Nouméa', () => {
    const ticks = calendarTicks(MINUIT_20_SEPT, 124);
    assert.deepEqual(
      ticks.map((t) => t.label),
      ['OCT', 'NOV', 'DÉC', '2027'],
    );
    // Le 1er octobre à minuit à Nouméa : onze jours après l'origine.
    assert.ok(Math.abs(ticks[0]!.day - 11) < 1e-9);
  });

  it('écrivent l’année à la place de janvier', () => {
    const labels = calendarTicks(MINUIT_20_SEPT, 485).map((t) => t.label);
    assert.ok(
      labels.some((label) => /^20\d\d$/.test(label)),
      labels.join(' '),
    );
  });

  it('sautent des mois quand la fenêtre est longue', () => {
    const ticks = calendarTicks(MINUIT_20_SEPT, 485);
    assert.ok(ticks.length <= 6, `${ticks.length} graduations`);
  });
});

describe('graduations en années', () => {
  it('sur dix ans, tiennent à l’écran', () => {
    const ticks = calendarTicks(MINUIT_20_SEPT - 360 * DAY, 4010);
    assert.ok(ticks.length >= 4 && ticks.length <= 6, `${ticks.length}`);
    assert.ok(ticks.every((t) => /^20\d\d$/.test(t.label)));
  });

  it('restent dans la fenêtre', () => {
    const days = 2185;
    for (const t of calendarTicks(MINUIT_20_SEPT, days)) {
      assert.ok(t.day >= 0 && t.day <= days, `${t.label} à ${t.day}`);
    }
  });
});

describe('entrées absurdes', () => {
  it('ne rendent rien plutôt que de boucler', () => {
    assert.deepEqual(calendarTicks(Number.NaN, 90), []);
    assert.deepEqual(calendarTicks(MINUIT_20_SEPT, 0), []);
    assert.deepEqual(calendarTicks(MINUIT_20_SEPT, -5), []);
  });
});
