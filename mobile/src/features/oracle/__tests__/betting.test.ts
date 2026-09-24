/**
 * Les paris et leur repère commun.
 *
 * Un décalage d'un jour dans l'alignement des courbes ne lève rien : il fausse
 * silencieusement la justesse de chacun, dans un jeu où sept personnes se
 * comparent. D'où ces tests, sur les seules règles qui décident de ce qu'on
 * voit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DAY_MS,
  MAX_PATH_POINTS,
  betFromRow,
  myOpenBet,
  openBets,
  pathForSave,
  phaseOfBet,
  resolvedBets,
  seriesForBet,
  shiftPath,
  targetOf,
  unshiftPath,
  upsertBet,
  windowFor,
  withdrawable,
  type Bet,
} from '@/features/oracle/betting';
import { scheduleFor, type HorizonKey } from '@/lib/horizons';

const NOW = Date.UTC(2026, 8, 23, 0, 0, 0);

const bet = (id: string, userId: string, horizon: HorizonKey, openedAt: number): Bet => {
  const s = scheduleFor(horizon, openedAt);
  return {
    id,
    userId,
    horizon,
    openedAt: s.openedAt,
    lockedAt: s.locksAt,
    resolvesAt: s.resolvesAt,
    path: [
      [0, 100_000],
      [horizon === '1w' ? 7 : 90, 120_000],
    ],
    hash: null,
  };
};

const JOHN = 'john';
const ALEX = 'alex';

describe('paris en cours et paris clos', () => {
  const paris = [
    bet('a', JOHN, '3m', NOW - 34 * DAY_MS),
    bet('b', ALEX, '3m', NOW - 10 * DAY_MS),
    bet('c', JOHN, '1w', NOW - 2 * DAY_MS),
    bet('d', ALEX, '1w', NOW - 20 * DAY_MS), // clos depuis 13 jours
    bet('e', JOHN, '1w', NOW - 9 * DAY_MS), // clos depuis 2 jours
  ];

  it('ne garde que l’horizon demandé', () => {
    assert.deepEqual(
      openBets(paris, '3m', NOW).map((b) => b.id),
      ['a', 'b'],
    );
  });

  it('écarte les paris clos des paris en cours', () => {
    assert.deepEqual(
      openBets(paris, '1w', NOW).map((b) => b.id),
      ['c'],
    );
  });

  it('retrouve mon pari en cours, et seulement le mien', () => {
    assert.equal(myOpenBet(paris, JOHN, '3m', NOW)?.id, 'a');
    assert.equal(myOpenBet(paris, ALEX, '1w', NOW), null, 'celui d’Alex est clos');
    assert.equal(myOpenBet(paris, null, '3m', NOW), null);
  });

  it('range l’historique du plus récent au plus ancien', () => {
    assert.deepEqual(
      resolvedBets(paris, NOW).map((b) => b.id),
      ['e', 'd'],
    );
  });

  it('donne la bonne phase à chaque pari', () => {
    assert.equal(
      phaseOfBet(paris[2]!, NOW),
      'locked',
      'un 1w ouvert il y a 2 j est verrouillé',
    );
    assert.equal(phaseOfBet(bet('f', JOHN, '1w', NOW - 3_600_000), NOW), 'open');
    assert.equal(phaseOfBet(paris[3]!, NOW), 'resolved');
  });
});

describe('fenêtre du repère', () => {
  it('commence à la plus ancienne ouverture en vue', () => {
    const w = windowFor([bet('a', JOHN, '3m', NOW - 34 * DAY_MS)], '3m', NOW);
    assert.equal(w.origin, NOW - 34 * DAY_MS);
    assert.ok(Math.abs(w.today - 34) < 1e-9, 'maintenant est au jour 34');
  });

  it('va jusqu’au bout du pari qu’on ouvrirait maintenant', () => {
    // Sans ça, un membre qui n'a pas encore parié verrait un repère qui
    // s'arrête avant la fin de son propre futur pari.
    const w = windowFor([bet('a', ALEX, '3m', NOW - 34 * DAY_MS)], '3m', NOW);
    assert.ok(Math.abs(w.days - (34 + 90)) < 1e-9, `${w.days} jours`);
  });

  it('montre un peu de passé quand personne n’a parié', () => {
    // On ne prolonge pas une courbe qu'on ne voit pas : trois jours de cours
    // avant un pari d'une semaine.
    const w = windowFor([], '1w', NOW);
    assert.equal(w.origin, NOW - 3 * DAY_MS);
    assert.equal(w.today, 3);
    assert.equal(w.days, 10);
  });

  it('remonte au pari le plus ancien, même au-delà du recul par défaut', () => {
    const w = windowFor([bet('a', JOHN, '1w', NOW - 5 * DAY_MS)], '1w', NOW);
    assert.equal(w.origin, NOW - 5 * DAY_MS);
  });
});

describe('alignement des tracés', () => {
  it('décale un tracé de l’écart entre son ouverture et l’origine', () => {
    const décalé = shiftPath([[0, 100_000]], NOW - 10 * DAY_MS, NOW - 34 * DAY_MS);
    assert.ok(Math.abs(décalé[0]![0] - 24) < 1e-9, 'ouvert 24 jours après l’origine');
    assert.equal(décalé[0]![1], 100_000, 'le prix ne bouge pas');
  });

  it('s’inverse sans dérive', () => {
    // C'est ce qui garantit qu'un tracé dessiné sur le repère se range
    // correctement relativement à sa propre ouverture.
    const tracé: [number, number][] = [
      [0, 100_000],
      [45.5, 150_000],
    ];
    const origine = NOW - 34 * DAY_MS;
    const aller = shiftPath(tracé, NOW, origine);
    const retour = unshiftPath(aller, NOW, origine);
    retour.forEach(([day, price], i) => {
      assert.ok(Math.abs(day - tracé[i]![0]) < 1e-9);
      assert.equal(price, tracé[i]![1]);
    });
  });
});

describe('le cours vu depuis un pari', () => {
  const série = Array.from({ length: 35 }, (_, day) => ({ day, price: 100_000 + day * 1_000 }));
  const origine = NOW - 34 * DAY_MS;

  it('re-date la série dans la base du pari', () => {
    const vue = seriesForBet(série, origine, NOW - 10 * DAY_MS);
    assert.equal(vue[0]![0], 0, 'le pari commence au jour 0');
    assert.equal(vue[0]![1], 124_000, 'et le cours de ce jour-là');
  });

  it('écarte ce qui précède l’ouverture du pari', () => {
    // Un pari ne se juge pas sur ce qui s'est passé avant lui.
    const vue = seriesForBet(série, origine, NOW - 10 * DAY_MS);
    assert.ok(vue.every(([day]) => day >= 0));
    assert.equal(vue.length, 11);
  });
});

describe('prix visé', () => {
  it('est celui du dernier point', () => {
    assert.equal(
      targetOf([
        [0, 100_000],
        [90, 163_000],
      ]),
      163_000,
    );
  });

  it('n’existe pas pour un tracé vide', () => {
    // Zéro se lirait comme une prédiction d'effondrement.
    assert.equal(targetOf([]), null);
  });
});

describe('lecture d’une ligne de la base', () => {
  const ligne = {
    id: 'x',
    user_id: JOHN,
    horizon: '6m',
    opened_at: '2026-09-01T00:00:00Z',
    locked_at: '2026-09-06T00:00:00Z',
    resolves_at: '2027-03-02T00:00:00Z',
    path_data: [
      [0, 110_000],
      [90, 150_000],
    ],
    hash: 'AB12',
  };

  it('en fait un pari', () => {
    const pari = betFromRow(ligne);
    assert.equal(pari?.horizon, '6m');
    assert.equal(pari?.openedAt, Date.UTC(2026, 8, 1));
    assert.equal(pari?.path.length, 2);
  });

  it('écarte un horizon inconnu plutôt que de le ranger ailleurs', () => {
    assert.equal(betFromRow({ ...ligne, horizon: '20y' }), null);
  });

  it('écarte une date illisible', () => {
    assert.equal(betFromRow({ ...ligne, resolves_at: 'demain' }), null);
  });

  it('ignore les points mal formés sans perdre le pari', () => {
    const pari = betFromRow({
      ...ligne,
      path_data: [[0, 110_000], 'x', [1], [5, -3], [10, 120_000]],
    });
    assert.deepEqual(pari?.path, [
      [0, 110_000],
      [10, 120_000],
    ]);
  });
});

describe('tracé prêt à enregistrer', () => {
  it('reste dans les bornes du pari', () => {
    const prêt = pathForSave(
      [
        [-0.2, 110_000],
        [3, 115_000],
        [9, 130_000],
      ],
      7,
    );
    assert.deepEqual(prêt, [
      [0, 110_000],
      [3, 115_000],
      [7, 130_000],
    ]);
  });

  it('garde des jours strictement croissants après bornage', () => {
    const prêt = pathForSave(
      [
        [-2, 100_000],
        [-1, 101_000],
        [0.5, 102_000],
      ],
      7,
    );
    assert.deepEqual(
      prêt.map(([day]) => day),
      [0, 0.5],
    );
  });

  it('arrondit au dollar et au millième de jour', () => {
    const [point] = pathForSave([[1.23456, 110_000.7]], 7);
    assert.deepEqual(point, [1.235, 110_001]);
  });

  it('ne dépasse jamais ce que la base accepte', () => {
    const long = Array.from({ length: 900 }, (_, i) => [i / 10, 100_000] as [number, number]);
    assert.equal(pathForSave(long, 3650).length, MAX_PATH_POINTS);
  });
});

describe('mise à jour de la liste', () => {
  it('remplace un pari connu sans le dupliquer', () => {
    // L'écho temps réel de sa propre écriture arrive après la réponse.
    const a = bet('a', JOHN, '3m', NOW);
    const b = bet('b', ALEX, '3m', NOW);
    const mis = upsertBet([a, b], { ...a, hash: 'FFFF' });
    assert.equal(mis.length, 2);
    assert.equal(mis[0]!.hash, 'FFFF');
  });

  it('ajoute un pari inconnu', () => {
    assert.equal(upsertBet([], bet('a', JOHN, '3m', NOW)).length, 1);
  });
});

describe('retrait d’un pari', () => {
  const mien = bet('m', JOHN, '3m', NOW - 10 * DAY_MS); // verrouillé (72 h)

  it('toujours possible tant qu’il est révisable', () => {
    const frais = bet('f', JOHN, '1w', NOW - 3_600_000);
    assert.equal(withdrawable(frais, [frais, bet('x', ALEX, '1w', NOW)], NOW), true);
  });

  it('possible une fois verrouillé si personne d’autre n’a parié', () => {
    assert.equal(withdrawable(mien, [mien], NOW), true);
  });

  it('impossible une fois verrouillé si un autre membre a parié', () => {
    // Le verrou protège la sincérité du pari face aux autres.
    const autre = bet('a', ALEX, '3m', NOW - 5 * DAY_MS);
    assert.equal(withdrawable(mien, [mien, autre], NOW), false);
  });

  it('ne compte ni les autres horizons, ni les paris clos, ni les tracés vides', () => {
    const autreHorizon = bet('h', ALEX, '1w', NOW - DAY_MS);
    const clos = bet('c', ALEX, '3m', NOW - 200 * DAY_MS);
    const vide = { ...bet('v', ALEX, '3m', NOW - DAY_MS), path: [] };
    assert.equal(withdrawable(mien, [mien, autreHorizon, clos, vide], NOW), true);
  });

  it('toujours possible pour un pari au tracé vide', () => {
    // Un reste de l'ancienne saison : il bloquait l'horizon sans rien parier.
    const vide = { ...mien, path: [] };
    assert.equal(withdrawable(vide, [vide, bet('a', ALEX, '3m', NOW - DAY_MS)], NOW), true);
  });

  it('jamais pour un pari résolu', () => {
    const clos = bet('c', JOHN, '1w', NOW - 30 * DAY_MS);
    assert.equal(withdrawable(clos, [clos], NOW), false);
  });
});
