import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { floorTo, planSpot, replay, type DayBar, type SpotAccount } from "./btc-rule.ts";

const DAY = 86_400_000;
const R = { entryDays: 3, exitDays: 2 };

/** Barres plates à 100 (haut 101, bas 99), puis celles données. */
function bars(extra: Partial<DayBar>[], flat = 3): DayBar[] {
  const out: DayBar[] = [];
  for (let i = 0; i < flat; i++) out.push({ t: i * DAY, o: 100, h: 101, l: 99, c: 100 });
  extra.forEach((b, j) => out.push({ t: (flat + j) * DAY, o: 100, h: 101, l: 99, c: 100, ...b }));
  return out;
}

describe("replay — la variante A de la recherche, à l'identique", () => {
  it("n'agit pas avant d'avoir assez d'historique", () => {
    const s = replay(bars([], 2), R);
    assert.equal(s.long, false);
    assert.equal(s.levels, null);
  });

  it("entre au niveau du canal quand le plus haut le franchit", () => {
    const s = replay(bars([{ o: 100.5, h: 103, l: 100, c: 102 }]), R);
    assert.equal(s.long, true);
    assert.equal(s.entryPx, 101);
    assert.deepEqual(s.levels, { entry: 101, exit: 99 });
  });

  it("entre à l'ouverture quand elle ouvre déjà au-dessus du niveau", () => {
    const s = replay(bars([{ o: 105, h: 106, l: 104, c: 105 }]), R);
    assert.equal(s.entryPx, 105);
  });

  it("ne sort pas le jour de l'entrée, même si le plus bas passe sous le niveau de sortie", () => {
    const s = replay(bars([{ o: 100, h: 103, l: 98, c: 101 }]), R);
    assert.equal(s.long, true);
    assert.equal(s.trades.length, 0);
  });

  it("sort au pire de l'ouverture et du niveau, gap compris", () => {
    const s = replay(
      bars([
        { o: 100, h: 104, l: 100, c: 103 },
        { o: 103, h: 105, l: 102, c: 104 },
        { o: 90, h: 91, l: 88, c: 89 },
      ]),
      R,
    );
    assert.equal(s.long, false);
    assert.equal(s.trades.length, 1);
    assert.equal(s.trades[0].exitPx, 90);
    assert.equal(s.lastExitT, 5 * DAY);
  });

  it("ne rentre pas le jour d'une sortie, même si le plus haut refranchit le canal", () => {
    const s = replay(
      bars([
        { o: 100, h: 104, l: 100, c: 103 },
        { o: 103, h: 105, l: 102, c: 104 },
        { o: 103, h: 110, l: 99, c: 104 },
      ]),
      R,
    );
    assert.equal(s.long, false);
    assert.equal(s.trades.length, 1);
  });

  it("calcule les niveaux sur les barres précédentes, jamais sur celle en cours", () => {
    const s = replay(bars([{ o: 100, h: 100.5, l: 99.5, c: 100 }]), R);
    assert.deepEqual(s.levels, { entry: 101, exit: 99 });
    assert.deepEqual(s.nextLevels, { entry: 101, exit: 99 });
  });
});

const ACC: SpotAccount = { base: 0, quote: 47, markPx: 84_000, perpPosition: 0, perpOrders: [] };
const OPT = { step: 0.00001, minNotional: 10 };

describe("planSpot — ce que le compte doit porter, au comptant", () => {
  it("la règle en position, le compte à plat : achat de tout le compte, frais réservés", () => {
    const a = planSpot({ long: true }, ACC, OPT);
    assert.equal(a.length, 1);
    assert.equal(a[0].kind, "buy");
    const { size, limitPx } = a[0] as { size: number; limitPx: number };
    assert.equal(limitPx, 84_000 * 1.005);
    assert.equal(size, floorTo((47 * 0.998) / (84_000 * 1.005), 0.00001));
    assert.ok(size * limitPx <= 47);
  });

  it("la règle sortie, le compte en BTC : vente de tout l'UBTC", () => {
    const a = planSpot({ long: false }, { ...ACC, base: 0.000559, quote: 0.3 }, OPT);
    assert.deepEqual(
      a.map((x) => x.kind),
      ["sell"],
    );
    assert.equal((a[0] as { size: number }).size, 0.00055);
    assert.equal((a[0] as { limitPx: number }).limitPx, 84_000 * 0.995);
  });

  it("rien à faire quand le compte suit déjà la règle", () => {
    assert.deepEqual(
      planSpot({ long: true }, { ...ACC, base: 0.00055, quote: 0.2 }, OPT).map((x) => x.kind),
      ["hold"],
    );
    assert.deepEqual(
      planSpot({ long: false }, ACC, OPT).map((x) => x.kind),
      ["hold"],
    );
  });

  it("une miette d'UBTC sous le minimum de l'exchange ne compte pas comme une position", () => {
    const a = planSpot({ long: true }, { ...ACC, base: 0.00005 }, OPT);
    assert.deepEqual(
      a.map((x) => x.kind),
      ["buy"],
    );
  });

  it("refuse un achat sous le minimum de l'exchange", () => {
    assert.deepEqual(
      planSpot({ long: true }, { ...ACC, quote: 8 }, OPT).map((x) => x.kind),
      ["none"],
    );
  });

  it("referme d'abord la position perp et ses ordres, avant tout achat au comptant", () => {
    const a = planSpot(
      { long: true },
      { ...ACC, quote: 23, perpPosition: 0.00055, perpOrders: [555012993231] },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["cancelPerp", "closePerp"],
    );
    assert.deepEqual((a[0] as { oids: number[] }).oids, [555012993231]);
    assert.equal((a[1] as { size: number }).size, 0.00055);
  });

  it("annule les ordres perp orphelins même sans position", () => {
    const a = planSpot({ long: false }, { ...ACC, perpOrders: [7] }, OPT);
    assert.deepEqual(
      a.map((x) => x.kind),
      ["cancelPerp", "hold"],
    );
  });
});

describe("floorTo — une taille arrondie vers le bas, jamais au-dessus du compte", () => {
  it("coupe au pas de l'actif", () => {
    assert.equal(floorTo(0.000559999, 0.00001), 0.00055);
    assert.equal(floorTo(0, 0.00001), 0);
  });
});
