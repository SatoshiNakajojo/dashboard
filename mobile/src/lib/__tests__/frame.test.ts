/**
 * Repère paramétrable de l'Oracle.
 *
 * Tant que le repère était figé, une erreur de projection se voyait tout de
 * suite. Maintenant qu'il change avec chaque pari, une projection fausse
 * décale une courbe sans que rien ne casse — le pire genre de défaut dans un
 * écran où sept personnes comparent leurs tracés.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_FRAME,
  PAD,
  W,
  compactPrice,
  dayAt,
  frameFor,
  niceStep,
  priceAt,
  priceTicks,
  toCanvas,
  toPrices,
  x,
  y,
  type Frame,
  type PricePoint,
} from '@/lib/chart';

const DIX_ANS: Frame = { days: 3650, pmin: 0, pmax: 2_000_000 };

describe('projection dans un repère quelconque', () => {
  it('garde le repère historique par défaut', () => {
    // Les appelants qui ne passent pas de repère ne doivent rien voir changer.
    assert.equal(x(0), x(0, DEFAULT_FRAME));
    assert.equal(y(120_000), y(120_000, DEFAULT_FRAME));
  });

  it('place les bornes du domaine sur les bornes de la toile', () => {
    assert.equal(x(0, DIX_ANS), PAD.l);
    assert.equal(x(3650, DIX_ANS), W - PAD.r);
    assert.equal(y(2_000_000, DIX_ANS), PAD.t);
  });

  it('s’inverse sans dérive, quel que soit le repère', () => {
    for (const frame of [DEFAULT_FRAME, DIX_ANS, { days: 7, pmin: 95_000, pmax: 130_000 }]) {
      for (const price of [frame.pmin, (frame.pmin + frame.pmax) / 2, frame.pmax]) {
        assert.ok(Math.abs(priceAt(y(price, frame), frame) - price) < 1e-6, `${price}`);
      }
      for (const day of [0, frame.days / 3, frame.days]) {
        assert.ok(Math.abs(dayAt(x(day, frame), frame) - day) < 1e-9, `${day}`);
      }
    }
  });

  it('ne divise pas par zéro sur un repère dégénéré', () => {
    const plat: Frame = { days: 0, pmin: 100, pmax: 100 };
    assert.ok(Number.isFinite(x(5, plat)));
    assert.ok(Number.isFinite(y(100, plat)));
  });
});

describe('aller-retour prix ↔ toile', () => {
  it('rend le tracé qu’on lui a donné', () => {
    // C'est la garantie qui permet de stocker en prix : ce qu'on dessine et ce
    // qu'on relit doivent être la même courbe.
    const tracé: PricePoint[] = [
      [0, 110_000],
      [400, 180_000],
      [3650, 1_200_000],
    ];
    const relu = toPrices(toCanvas(tracé, DIX_ANS), DIX_ANS);
    tracé.forEach(([day, price], i) => {
      assert.ok(Math.abs(relu[i]![0] - day) < 1e-6);
      assert.ok(Math.abs(relu[i]![1] - price) < 1e-3);
    });
  });

  it('rend deux tracés comparables même dessinés dans deux repères', () => {
    // Le cœur du passage en prix : deux membres qui voient des bandes
    // différentes parlent quand même du même prix.
    const a: Frame = { days: 90, pmin: 80_000, pmax: 200_000 };
    const b: Frame = { days: 90, pmin: 50_000, pmax: 400_000 };
    const point: PricePoint = [45, 150_000];
    const viaA = toPrices(toCanvas([point], a), a)[0]!;
    const viaB = toPrices(toCanvas([point], b), b)[0]!;
    assert.ok(Math.abs(viaA[1] - viaB[1]) < 1e-3);
  });
});

describe('bande de prix', () => {
  it('contient tout ce qu’on affiche, avec de la marge', () => {
    const prix = [95_000, 121_000, 180_000];
    const frame = frameFor(90, prix, 120_000);
    for (const p of prix) {
      assert.ok(p > frame.pmin && p < frame.pmax, `${p} hors de ${frame.pmin}–${frame.pmax}`);
    }
  });

  it('laisse voir un tracé très optimiste sur dix ans', () => {
    // Avec l'ancienne bande figée, un bitcoin à 2 M$ était coupé au bord.
    const frame = frameFor(3650, [110_000, 2_000_000], 110_000);
    assert.ok(frame.pmax > 2_000_000, `plafond ${frame.pmax}`);
  });

  it('garde la bande plancher, même quand les données sont serrées', () => {
    // À l'ouverture d'un pari à dix ans, le cours ne couvre que quelques jours :
    // sans plancher, on ne pourrait pas viser au-delà de quelques pour cent.
    const frame = frameFor(3650, [109_000, 111_000], 110_000, { low: 0.3, high: 12 });
    assert.ok(frame.pmax >= 1_320_000, `plafond ${frame.pmax}`);
    assert.ok(frame.pmin <= 33_000, `plancher ${frame.pmin}`);
  });

  it('se centre sur le cours quand il n’y a rien à montrer', () => {
    const frame = frameFor(7, [], 120_000);
    assert.ok(frame.pmin < 120_000 && frame.pmax > 120_000);
  });

  it('reste valide sur des entrées absurdes', () => {
    for (const prix of [[], [0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
      const frame = frameFor(90, prix, Number.NaN);
      assert.ok(frame.pmax > frame.pmin, JSON.stringify(frame));
      assert.ok(frame.pmin >= 0);
      assert.ok(Number.isFinite(frame.pmax));
    }
  });

  it('tombe sur des valeurs rondes', () => {
    const frame = frameFor(90, [97_312, 143_877], 120_000);
    const step = niceStep((frame.pmax - frame.pmin) / 4);
    assert.equal(frame.pmin % step, 0);
    assert.equal(frame.pmax % step, 0);
  });
});

describe('graduations', () => {
  it('prend des pas en 1, 2 ou 5', () => {
    assert.equal(niceStep(12_000), 20_000);
    assert.equal(niceStep(40_000), 50_000);
    assert.equal(niceStep(80_000), 100_000);
    assert.equal(niceStep(0.3), 0.5);
  });

  it('en pose un nombre lisible, dans la bande', () => {
    for (const frame of [DEFAULT_FRAME, DIX_ANS, frameFor(7, [101_000, 104_000], 102_000)]) {
      const ticks = priceTicks(frame);
      assert.ok(ticks.length >= 3 && ticks.length <= 7, `${ticks.length} graduations`);
      for (const t of ticks) assert.ok(t >= frame.pmin && t <= frame.pmax);
    }
  });

  it('écrit les prix de façon compacte', () => {
    assert.equal(compactPrice(120_000), '120k');
    assert.equal(compactPrice(2_000_000), '2M');
    assert.equal(compactPrice(1_500_000), '1,5M', 'virgule décimale, comme partout dans l’app');
    assert.equal(compactPrice(850), '850');
  });
});
