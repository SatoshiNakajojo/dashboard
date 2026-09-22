import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyHl, marginCeiling, orderNotional, orderTarget, planSize } from "./sizing.ts";
import {
  GSD_LEVERAGE,
  GSD_MAX_BOOK_PCT,
  GSD_MIN_NOTIONAL,
  GSD_RISK_PCT,
} from "./bot.ts";

/**
 * Chaque test nomme le défaut de production qu'il empêche de revenir.
 * Les chiffres viennent du compte 0x04E4…16a2 au 22/09/2026.
 */

const EQUITE = 47.33;

function taille(o: { equity?: number; free?: number; entry: number; stop: number; book?: number }) {
  return planSize({
    equity: o.equity ?? EQUITE,
    free: o.free ?? EQUITE,
    entry: o.entry,
    stop: o.stop,
    bookNotional: o.book ?? 0,
  });
}

describe("planSize — le risque en dollars ne dépend pas de la distance au stop", () => {
  it("risque le même montant, que le stop soit à 3 % ou à 12 %", () => {
    const proche = taille({ equity: 500, free: 500, entry: 100, stop: 97 });
    const loin = taille({ equity: 500, free: 500, entry: 100, stop: 88 });
    assert.ok(proche.ok && loin.ok);

    // Si un plafond mord, le test ne mesure plus le risque : on l'exige.
    assert.equal(proche.plan.bind, "risque");
    assert.equal(loin.plan.bind, "risque");

    // Le défaut d'origine : mêmes 40 % du compte dans les deux cas.
    assert.ok(loin.plan.notional < proche.plan.notional, "un stop lointain doit donner une position plus petite");

    const attendu = GSD_RISK_PCT * 500;
    assert.ok(Math.abs(proche.plan.risqueUsd - attendu) < 0.01);
    assert.ok(Math.abs(loin.plan.risqueUsd - attendu) < 0.01);
  });

  it("le notionnel est inversement proportionnel à la distance au stop", () => {
    const a = taille({ equity: 500, free: 500, entry: 100, stop: 97 });
    const b = taille({ equity: 500, free: 500, entry: 100, stop: 94 });
    assert.ok(a.ok && b.ok);
    assert.equal(a.plan.bind, "risque");
    assert.equal(b.plan.bind, "risque");
    // stop deux fois plus loin → position deux fois plus petite
    assert.ok(Math.abs(a.plan.notional / b.plan.notional - 2) < 0.02);
  });
});

describe("planSize — les signaux impossibles à dimensionner sont refusés", () => {
  it("refuse le stop AVAX à −36 %, qui avait été pris en pleine taille", () => {
    const r = taille({ entry: 11.2536, stop: 7.169 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /36[.,]3 %.*refusé/);
  });

  it("refuse un stop collé au prix, qui donnerait une position absurde", () => {
    const r = taille({ equity: 10_000, free: 10_000, entry: 100, stop: 99.9 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /trop proche/);
  });

  it("refuse un stop absent plutôt que d'en inventer un", () => {
    const r = taille({ entry: 100, stop: 0 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /stop absent/);
  });
});

describe("planSize — la marge libre borne, et le dit", () => {
  it("refuse d'envoyer quand la marge est épuisée, au lieu d'envoyer une miette", () => {
    // L'état réel du compte au moment de l'audit : marge à 108 %, retirable 0.
    const r = taille({ equity: EQUITE, free: 0, entry: 0.094139, stop: 0.088 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /marge/);
    // Le défaut d'origine : un ordre de 433 DOGE part, 1,0 s'exécute.
  });

  it("nomme la contrainte qui a décidé de la taille", () => {
    const r = taille({ equity: 100_000, free: 100_000, entry: 100, stop: 99 });
    assert.ok(r.ok);
    assert.equal(r.plan.bind, "plafond");
  });

  it("garde une réserve de marge — n'engage jamais tout le disponible", () => {
    const libre = 100;
    assert.ok(marginCeiling(libre) < libre * GSD_LEVERAGE, "la réserve doit réduire le plafond de marge");
  });
});

describe("planSize — le livre ne peut pas dépasser son plafond", () => {
  it("refuse une entrée quand le livre est déjà plein", () => {
    const plein = EQUITE * GSD_MAX_BOOK_PCT;
    const r = taille({ equity: EQUITE, free: EQUITE, entry: 100, stop: 99, book: plein });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /livre/);
  });

  it("cinq positions au plafond laissent toujours de la marge libre", () => {
    // Le défaut racine : `eq * GSD_SLOT_PCT * 2` faisait consommer 100 % du
    // compte en marge par cinq créneaux, sans réserve pour un mouvement adverse.
    const margeMax = (EQUITE * GSD_MAX_BOOK_PCT) / GSD_LEVERAGE;
    assert.ok(margeMax < EQUITE, `le livre plein doit tenir sous l'équité (${margeMax} vs ${EQUITE})`);
  });
});

describe("plafonds affichés au pupitre", () => {
  it("orderTarget ne dépasse jamais l'équité sur un petit compte", () => {
    assert.ok(orderTarget(EQUITE) < EQUITE);
  });

  it("orderNotional retient le plus contraignant des deux plafonds", () => {
    assert.equal(orderNotional(EQUITE, 0), 0);
    assert.equal(orderNotional(EQUITE, 1e9), orderTarget(EQUITE));
  });

  it("ne rend jamais un négatif", () => {
    assert.ok(orderNotional(-5, -5) >= 0);
    assert.ok(marginCeiling(Number.NaN) >= 0);
  });
});

describe("plancher d'exécution", () => {
  it("tout plan retenu tient au-dessus du minimum de l'exchange", () => {
    for (const eq of [50, 200, 1000, 5000]) {
      for (const d of [0.01, 0.03, 0.08, 0.14]) {
        const r = planSize({ equity: eq, free: eq, entry: 100, stop: 100 * (1 - d), bookNotional: 0 });
        if (r.ok) assert.ok(r.plan.notional >= GSD_MIN_NOTIONAL, `${eq}$ / stop ${d}`);
      }
    }
  });
});

describe("classifyHl — l'équité est le perp PLUS le spot libre", () => {
  /*
   * Deux relevés réels du compte 0x04E4…16a2, le 22/09/2026.
   * Entre les deux, quatre positions ont été coupées : `accountValue` est
   * passé de 47,33 à 0,32, non pas parce que l'argent avait disparu, mais
   * parce qu'il ne mesurait plus que la marge immobilisée.
   */

  it("avant la coupe : tout le collatéral est immobilisé", () => {
    const b = classifyHl(47.334176, 47.32868, 0, 50.885546, 47.32868);
    assert.ok(Math.abs(b.trading - 47.334176) < 0.01, `équité lue ${b.trading}`);
    assert.equal(b.spotFree, 0);
    assert.equal(b.free, 0, "marge saturée : rien de libre");
    assert.equal(b.unified, true);
  });

  it("après la coupe : 0,32 $ immobilisé, mais 47 $ d'équité", () => {
    const b = classifyHl(0.322794, 47.078827, 0, 0.323339, 0.323338);
    assert.ok(Math.abs(b.trading - 47.078283) < 0.01, `équité lue ${b.trading}`);
    assert.ok(b.trading > 40, "le bug lisait 0,32 $ et refusait tout");
    assert.ok(Math.abs(b.spotFree - 46.755489) < 0.01);
  });

  it("ne compte jamais deux fois le collatéral immobilisé", () => {
    // Le spot retenu garantit déjà la marge perp : l'additionner doublerait.
    const b = classifyHl(10, 10, 0, 10, 10);
    assert.equal(b.trading, 10);
  });

  it("le spot libre n'est pas de la marge utilisable tout de suite", () => {
    const b = classifyHl(0.32, 47.08, 0, 0.32, 0.32);
    assert.ok(b.free < 1, "il faut un usdClassTransfer avant de s'en servir");
    // Donc planSize refuse, et c'est le bon comportement.
    const r = planSize({ equity: b.trading, free: b.free, entry: 100, stop: 97, bookNotional: 0 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /marge/);
  });

  it("une fois le transfert fait, la taille se calcule normalement", () => {
    const b = classifyHl(47.08, 0, 47.08, 0, 0);
    assert.ok(Math.abs(b.trading - 47.08) < 0.01);
    assert.ok(b.free > 40);
    const r = planSize({ equity: b.trading, free: b.free, entry: 100, stop: 97, bookNotional: 0 });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(r.plan.bind, "risque");
    assert.ok(Math.abs(r.plan.risqueUsd - 0.4708) < 0.01, "1 % de 47,08 $");
  });

  it("encaisse des valeurs absurdes sans produire de NaN", () => {
    for (const b of [classifyHl(Number.NaN, Number.NaN), classifyHl(-5, -5, -5, -5, -5), classifyHl(0, 0)]) {
      assert.ok(Number.isFinite(b.trading) && b.trading >= 0);
      assert.ok(Number.isFinite(b.free) && b.free >= 0);
      assert.ok(Number.isFinite(b.spotFree) && b.spotFree >= 0);
    }
  });
});
