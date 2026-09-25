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
  bandFor,
  editingLabel,
  horizonOf,
  isHorizonKey,
  lookbackDays,
  phaseOf,
  scheduleFor,
  OPEN_HORIZONS,
  formatWeight,
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

  it('couvre ce que le club a demandé (v1.01 : 2 sem. et 1 mois, plus de 5 ni 10 ans)', () => {
    assert.deepEqual(
      OPEN_HORIZONS.map((h) => h.key),
      ['1w', '2w', '1m', '3m', '6m', '12m'],
    );
    // Retirés, mais toujours connus : un pari déjà déposé va à son terme.
    assert.deepEqual(
      HORIZONS.filter((h) => h.retired).map((h) => h.key),
      ['5y', '10y'],
    );
    assert.equal(horizonOf('10y').days, 3650, 'un ancien pari à dix ans garde son calendrier');
  });

  it('pèse d’autant plus que le pari est long, sans toucher aux anciens poids', () => {
    const poids = HORIZONS.map((h) => h.weight);
    assert.deepEqual(
      poids,
      [...poids].sort((a, b) => a - b),
    );
    assert.deepEqual(
      ['1w', '3m', '6m', '12m', '5y', '10y'].map((key) => horizonOf(key).weight),
      [1, 2, 3, 4, 6, 8],
    );
    assert.equal(formatWeight(1.25), '×1,25');
    assert.equal(formatWeight(2), '×2');
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

describe('reconnaissance d’une clé', () => {
  it('accepte les six horizons, et rien d’autre', () => {
    for (const horizon of HORIZONS) assert.ok(isHorizonKey(horizon.key));
    for (const autre of ['20y', '', null, 3, '3M']) assert.equal(isHorizonKey(autre), false);
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

describe('bande de prix minimale', () => {
  it('encadre toujours le cours du jour', () => {
    for (const horizon of HORIZONS) {
      const { low, high } = bandFor(horizon.key);
      assert.ok(low < 1 && high > 1, horizon.key);
    }
  });

  it('s’élargit avec l’horizon', () => {
    // Plus le pari est long, plus on doit pouvoir viser loin.
    const hauts = HORIZONS.map((h) => bandFor(h.key).high);
    assert.deepEqual(
      hauts,
      [...hauts].sort((a, b) => a - b),
    );
  });

  it('laisse tracer un bitcoin à 1 M$ sur dix ans depuis 110 k$', () => {
    assert.ok(110_000 * bandFor('10y').high >= 1_000_000);
  });
});

describe('recul avant aujourd’hui', () => {
  it('montre du passé sur chaque horizon, sans dépasser un an', () => {
    // Un an : la limite de l'historique gratuit de CoinGecko.
    for (const horizon of HORIZONS) {
      const days = lookbackDays(horizon.key);
      assert.ok(days > 0 && days <= 365, `${horizon.key} : ${days} j`);
      assert.ok(days <= horizon.days, `${horizon.key} : plus de passé que d’avenir`);
    }
  });
});

describe('fenêtre de révision, affichée', () => {
  it('parle en heures sous deux jours, en jours au-delà', () => {
    assert.equal(editingLabel('1w'), '24 H');
    assert.equal(editingLabel('3m'), '3 J');
    assert.equal(editingLabel('10y'), '14 J');
  });
});
