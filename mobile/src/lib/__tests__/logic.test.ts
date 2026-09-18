/**
 * Tests des règles pures — géométrie du repère, formatage français, perfs.
 *
 * Exécution : `npm test`. Pas de moteur de rendu, pas de mock : ces fonctions
 * sont les seules du projet où une erreur est silencieuse à l'écran.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DAYS,
  PMAX,
  PMIN,
  appendDrawPoint,
  clampToCanvas,
  interpolateY,
  meanAbsoluteGap,
  priceAt,
  toAreaPath,
  toSvgPath,
  x,
  y,
  type Point,
} from '../chart.ts';
import {
  formatCountdown,
  formatPercent,
  formatPrice,
  formatThousands,
  formatUsd,
} from '../format.ts';
import {
  LEADERBOARD,
  desaturate,
  performancePercent,
  rektFace,
  romanRank,
  splitLeaderboards,
  vsBitcoinPercent,
} from '../performance.ts';

/** Espace insécable étroite — celle qu'attend la typographie française. */
const NB = ' ';

describe('repère de l’Oracle', () => {
  it('projette les bornes du domaine sur celles du repère', () => {
    assert.equal(x(0), 34);
    assert.equal(x(DAYS), 354);
    assert.equal(y(PMAX), 10);
    // 10 + 230, la hauteur utile du repère. `SPEC_ECRANS.md` §5.3 annote « 10 → 250 »
    // en commentaire, mais la formule qu'il donne — et que le prototype exécute —
    // donne bien 240 : `H - PAD.t - PAD.b - 12` vaut 230, pas 240.
    assert.equal(y(PMIN), 240);
  });

  it('inverse y() sans dérive', () => {
    for (const price of [80_000, 120_911, 164_000, 200_000]) {
      assert.ok(Math.abs(priceAt(y(price)) - price) < 1e-6, `prix ${price}`);
    }
  });

  it('borne un point du geste dans le repère', () => {
    assert.deepEqual(clampToCanvas(-50, -50), [34, 10]);
    assert.deepEqual(clampToCanvas(9999, 9999), [354, 232]);
    assert.deepEqual(clampToCanvas(200, 120), [200, 120]);
  });
});

describe('capture du tracé', () => {
  it('refuse un point qui ne progresse pas d’au moins 4 en X', () => {
    const points: Point[] = [[34, 100]];
    assert.equal(appendDrawPoint(points, [36, 90]), null, '2 unités : refusé');
    assert.equal(appendDrawPoint(points, [38, 90]), null, '4 unités : refusé');
    assert.deepEqual(appendDrawPoint(points, [39, 90]), [
      [34, 100],
      [39, 90],
    ]);
  });

  it('refuse un retour en arrière — le tracé est monotone en X', () => {
    const points: Point[] = [[34, 100], [120, 80]];
    assert.equal(appendDrawPoint(points, [60, 90]), null);
  });

  it('accepte le premier point quel qu’il soit', () => {
    assert.deepEqual(appendDrawPoint([], [200, 50]), [[200, 50]]);
  });
});

describe('chemins SVG', () => {
  it('produit une polyligne', () => {
    assert.equal(toSvgPath([[34, 100], [120, 80]]), 'M 34.0 100.0 L 120.0 80.0');
  });

  it('renvoie une chaîne vide sans point', () => {
    assert.equal(toSvgPath([]), '');
    assert.equal(toAreaPath([]), '');
  });

  it('referme l’aire sur la ligne de base', () => {
    assert.equal(
      toAreaPath([[34, 100], [120, 80]]),
      'M 34.0 100.0 L 120.0 80.0 L 120.0 252 L 34.0 252 Z',
    );
  });
});

describe('écart à la courbe réelle', () => {
  it('vaut zéro pour deux courbes identiques', () => {
    const curve: Point[] = [[34, 100], [120, 80], [200, 60]];
    const gap = meanAbsoluteGap(curve, curve);
    assert.ok(gap !== null && gap < 1e-9, `écart attendu nul, obtenu ${gap}`);
  });

  it('croît avec l’éloignement', () => {
    const actual: Point[] = [[34, 100], [354, 100]];
    const near: Point[] = [[34, 105], [354, 105]];
    const far: Point[] = [[34, 160], [354, 160]];
    const gapNear = meanAbsoluteGap(near, actual)!;
    const gapFar = meanAbsoluteGap(far, actual)!;
    assert.ok(gapFar > gapNear, `${gapFar} doit dépasser ${gapNear}`);
  });

  it('renvoie null quand les plages ne se recouvrent pas', () => {
    assert.equal(meanAbsoluteGap([[34, 10], [100, 10]], [[200, 10], [300, 10]]), null);
    assert.equal(meanAbsoluteGap([[34, 10]], [[34, 10], [300, 10]]), null);
  });

  it('interpole entre deux points', () => {
    assert.equal(interpolateY([[0, 0], [10, 100]], 5), 50);
    assert.equal(interpolateY([[0, 0], [10, 100]], -5), 0, 'avant le début : borné');
    assert.equal(interpolateY([[0, 0], [10, 100]], 50), 100, 'après la fin : borné');
  });
});

describe('formatage français', () => {
  it('met une espace insécable avant % et $', () => {
    assert.equal(formatUsd(120911), `120${NB}911${NB}$`);
    assert.equal(formatPercent(14.9), `+14,9${NB}%`);
    assert.equal(formatPercent(-61), `-61,0${NB}%`);
    assert.equal(formatThousands(164000), `164${NB}k$`);
  });

  it('donne deux décimales sous 1 000 $, aucune au-dessus', () => {
    assert.equal(formatPrice(1.84), `1,84${NB}$`);
    assert.equal(formatPrice(412), `412,00${NB}$`);
    assert.equal(formatPrice(103200), `103${NB}200${NB}$`);
  });

  it('tient le compte à rebours sur une ligne', () => {
    assert.equal(formatCountdown((2 * 86400 + 7 * 3600 + 41 * 60) * 1000), '2j 07:41:00');
    assert.equal(formatCountdown(0), '0j 00:00:00');
    assert.equal(formatCountdown(-5000), '0j 00:00:00', 'le verrouillage ne recule pas');
  });
});

describe('performances', () => {
  it('reproduit les chiffres du design', () => {
    assert.equal(Math.round(performancePercent(412, 463.088)! * 10) / 10, 12.4);
    assert.equal(Math.round(performancePercent(1.84, 0.7176)! * 10) / 10, -61);
  });

  it('renvoie null sans prix courant — jamais zéro', () => {
    assert.equal(performancePercent(412, null), null);
    assert.equal(performancePercent(0, 100), null, 'prix d’entrée nul');
  });

  it('mesure la perf vs ₿ comme un ratio, pas une soustraction', () => {
    // +12,4 % pendant que BTC fait +15,3 % : on a perdu 2,5 % vs ₿.
    const vs = vsBitcoinPercent(412, 463.088, 104882.53, 120911);
    assert.equal(Math.round(vs! * 10) / 10, -2.5);
  });

  it('renvoie null si une jambe manque', () => {
    assert.equal(vsBitcoinPercent(412, 463, null, 120911), null);
    assert.equal(vsBitcoinPercent(412, null, 104882, 120911), null);
  });
});

describe('classements', () => {
  const call = (id: string, perf: number | null, vs: number | null, cls = 'ALT') =>
    ({
      id,
      assetClass: cls,
      performancePercent: perf,
      vsBtcPercent: vs,
    }) as never;

  /** Score du référentiel actif — les tests suivent `REFERENCE`, pas l'inverse. */
  const scored = (value: number) =>
    LEADERBOARD.reference === 'usd' ? call('x', value, 0) : call('x', 0, value);

  it('classe au-dessus du seuil et ignore juste en dessous', () => {
    const above = { ...(scored(LEADERBOARD.fameThreshold) as object), id: 'pile' } as never;
    const below = { ...(scored(LEADERBOARD.fameThreshold - 0.1) as object), id: 'sous' } as never;
    const { fame } = splitLeaderboards([above, below]);
    assert.deepEqual(fame.map((c) => c.id), ['pile'], 'le seuil est inclusif');
  });

  it('reproduit le Hall of Fame du design', () => {
    // Les trois lignes des fixtures : +96 %, +74 % (+31 % vs ₿), +63 % (+19 % vs ₿).
    const { fame } = splitLeaderboards([
      call('btc', 96, null, 'BTC'),
      call('nvda', 74, 31),
      call('mstr', 63, 19),
      call('eth', 21.8, 6.9),
    ]);
    assert.deepEqual(
      fame.map((c) => c.id),
      ['btc', 'nvda', 'mstr'],
      'les trois lignes du design, et elles seules',
    );
  });

  it('envoie au Rekt Board sur la perf en dollars', () => {
    const { rekt } = splitLeaderboards([
      call('wif', -61, -66.4),
      call('ethw', -48, -50),
      call('gme', -22, -30),
      call('ok', -19.9, -25),
    ]);
    assert.deepEqual(rekt.map((c) => c.id), ['wif', 'ethw', 'gme']);
  });

  it('juge un call BTC sur sa perf en dollars — il est le référentiel', () => {
    const { fame } = splitLeaderboards([call('btc', 96, null, 'BTC')]);
    assert.deepEqual(fame.map((c) => c.id), ['btc']);
  });

  it('ignore un call sans prix courant plutôt que de le classer à zéro', () => {
    const { fame, rekt } = splitLeaderboards([call('inconnu', null, null)]);
    assert.equal(fame.length, 0);
    assert.equal(rekt.length, 0);
  });

  it('numérote la gloire en chiffres romains', () => {
    assert.deepEqual([0, 1, 2].map(romanRank), ['I', 'II', 'III']);
  });

  it('donne des frimousses monospace au Rekt Board', () => {
    assert.deepEqual([0, 1, 2].map(rektFace), ['x_x', 'T_T', '>_<']);
  });
});

describe('désaturation des avatars du Rekt Board', () => {
  it('rapproche la couleur de son gris perçu', () => {
    // Luminance Rec. 601 de #E8A33D : 0,299·232 + 0,587·163 + 0,114·61 = 172.
    assert.equal(desaturate('#E8A33D', 1), '#acacac');
    assert.equal(desaturate('#E8A33D', 0), '#e8a33d');
  });

  it('laisse passer une entrée qui n’est pas une couleur', () => {
    assert.equal(desaturate('transparent'), 'transparent');
  });
});
