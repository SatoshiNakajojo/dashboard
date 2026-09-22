/**
 * Horizons de pari.
 *
 * C'est le calendrier de paris qui engagent sept personnes sur dix ans. Un
 * verrouillage qui tombe au mauvais moment, ou une résolution décalée, ne se
 * rattrape pas : les tracés sont déjà déposés.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_HORIZON,
  HORIZONS,
  elapsedFraction,
  historyDaysFor,
  horizonOf,
  phaseOf,
  scheduleFor,
  timeTicks,
} from '@/lib/horizons';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 22, 0, 0, 0);

describe('le catalogue', () => {
  it('va du plus court au plus long, sans doublon', () => {
    const jours = HORIZONS.map((h) => h.days);
    assert.deepEqual(
      jours,
      [...jours].sort((a, b) => a - b),
    );
    assert.equal(new Set(HORIZONS.map((h) => h.key)).size, HORIZONS.length);
  });

  it('couvre ce que le club a demandé', () => {
    assert.deepEqual(
      HORIZONS.map((h) => h.key),
      ['1w', '3m', '6m', '12m', '5y', '10y'],
    );
  });

  it('ne laisse jamais réviser plus longtemps que le pari ne dure', () => {
    // Dix jours pour réviser un pari d'une semaine, et le pari serait fini
    // avant d'être scellé.
    for (const horizon of HORIZONS) {
      assert.ok(
        horizon.editingHours * 3_600_000 < horizon.days * DAY,
        `${horizon.key} : ${horizon.editingHours} h pour ${horizon.days} j`,
      );
    }
  });

  it('laisse d’autant plus de temps que le pari est long', () => {
    const fenêtres = HORIZONS.map((h) => h.editingHours);
    assert.deepEqual(
      fenêtres,
      [...fenêtres].sort((a, b) => a - b),
    );
  });
});

describe('résolution d’une clé', () => {
  it('retrouve chaque horizon', () => {
    for (const horizon of HORIZONS) assert.equal(horizonOf(horizon.key).key, horizon.key);
  });

  it('retombe sur le défaut plutôt que de lever', () => {
    // Une clé inconnue vient d'une ligne écrite par une version plus récente :
    // un axe un peu faux vaut mieux qu'un écran vide.
    for (const inconnue of ['', '42y', null, undefined, 'JAMAIS']) {
      assert.equal(horizonOf(inconnue).key, DEFAULT_HORIZON);
    }
  });
});

describe('calendrier d’un pari', () => {
  it('verrouille avant de résoudre', () => {
    for (const horizon of HORIZONS) {
      const s = scheduleFor(horizon.key, T0);
      assert.ok(s.openedAt < s.locksAt, horizon.key);
      assert.ok(s.locksAt < s.resolvesAt, horizon.key);
    }
  });

  it('résout à la bonne date', () => {
    assert.equal(scheduleFor('1w', T0).resolvesAt, T0 + 7 * DAY);
    assert.equal(scheduleFor('10y', T0).resolvesAt, T0 + 3650 * DAY);
  });

  it('donne à deux paris ouverts ensemble des calendriers différents', () => {
    // Le cœur de la demande : ils ne doivent pas se verrouiller ni se résoudre
    // en même temps.
    const semaine = scheduleFor('1w', T0);
    const dixAns = scheduleFor('10y', T0);
    assert.notEqual(semaine.locksAt, dixAns.locksAt);
    assert.notEqual(semaine.resolvesAt, dixAns.resolvesAt);
  });
});

describe('état d’un pari', () => {
  const s = scheduleFor('3m', T0);

  it('suit les trois phases dans l’ordre', () => {
    assert.equal(phaseOf(s, T0), 'open');
    assert.equal(phaseOf(s, s.locksAt - 1), 'open');
    assert.equal(phaseOf(s, s.locksAt), 'locked');
    assert.equal(phaseOf(s, s.resolvesAt - 1), 'locked');
    assert.equal(phaseOf(s, s.resolvesAt), 'resolved');
  });

  it('dit « résolu », pas « verrouillé », sur un pari clos depuis longtemps', () => {
    // Les deux instants sont dépassés : c'est le plus avancé qui l'emporte.
    assert.equal(phaseOf(s, s.resolvesAt + 5 * 365 * DAY), 'resolved');
  });
});

describe('part écoulée', () => {
  const s = scheduleFor('12m', T0);

  it('va de zéro à un', () => {
    assert.equal(elapsedFraction(s, T0), 0);
    assert.ok(Math.abs(elapsedFraction(s, T0 + 182.5 * DAY) - 0.5) < 0.01);
    assert.equal(elapsedFraction(s, s.resolvesAt), 1);
  });

  it('reste bornée quand l’horloge sort du cadre', () => {
    // Une horloge qui recule ne doit pas sortir le trait « aujourd'hui » du
    // repère.
    assert.equal(elapsedFraction(s, T0 - 400 * DAY), 0);
    assert.equal(elapsedFraction(s, s.resolvesAt + 400 * DAY), 1);
  });
});

describe('graduations de l’axe', () => {
  it('compte en jours sur une semaine, en mois sur un an, en années sur dix', () => {
    assert.ok(timeTicks('1w').every((t) => /^J\+/.test(t.label)));
    assert.ok(timeTicks('12m').some((t) => /^M\+/.test(t.label)));
    assert.ok(timeTicks('10y').some((t) => /^A\+/.test(t.label)));
  });

  it('en pose assez pour lire, pas assez pour se chevaucher', () => {
    // Le repère fait 320 points de large : au-delà de sept repères, ils se
    // touchent.
    for (const horizon of HORIZONS) {
      const ticks = timeTicks(horizon.key);
      assert.ok(ticks.length >= 3, `${horizon.key} : ${ticks.length}`);
      assert.ok(ticks.length <= 7, `${horizon.key} : ${ticks.length}`);
    }
  });

  it('ne place jamais une graduation hors du pari', () => {
    for (const horizon of HORIZONS) {
      for (const tick of timeTicks(horizon.key)) {
        assert.ok(tick.day >= 0 && tick.day <= horizon.days, `${horizon.key} → ${tick.day}`);
      }
    }
  });

  it('commence toujours à l’origine', () => {
    for (const horizon of HORIZONS) {
      assert.equal(timeTicks(horizon.key)[0]!.day, 0, horizon.key);
    }
  });
});

describe('historique à demander', () => {
  it('ne demande que ce qui est écoulé', () => {
    assert.equal(historyDaysFor('10y', T0, T0 + 30 * DAY), 30);
  });

  it('ne dépasse pas la durée du pari', () => {
    assert.equal(historyDaysFor('1w', T0, T0 + 400 * DAY), 7);
  });

  it('en demande au moins deux jours', () => {
    // CoinGecko rend une série vide en deçà, et un repère sans courbe réelle
    // n'a rien à quoi se comparer.
    assert.equal(historyDaysFor('3m', T0, T0), 2);
    assert.equal(historyDaysFor('3m', T0, T0 - 10 * DAY), 2);
  });
});
