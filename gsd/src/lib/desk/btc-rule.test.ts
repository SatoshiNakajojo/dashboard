import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { floorTo, plan, replay, type Account, type DayBar } from "./btc-rule.ts";

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

const ACC: Account = { position: 0, orders: [], equity: 47, markPx: 84_000 };
const OPT = { step: 0.00001, minNotional: 10 };

describe("plan — ce que le compte doit porter", () => {
  it("à plat : pose un stop d'achat au plus haut, pour tout le compte", () => {
    const a = plan(
      { long: false, exitedToday: false, levels: { entry: 85_000, exit: 79_000 } },
      ACC,
      OPT,
    );
    assert.deepEqual(a, [
      {
        kind: "stop",
        buy: true,
        triggerPx: 85_000,
        size: floorTo(47 / 85_000, 0.00001),
        reduceOnly: false,
        why: "stop d'entrée au plus haut des 25 jours",
      },
    ]);
  });

  it("garde un stop d'entrée déjà bon, et annule le reste", () => {
    const size = floorTo(47 / 85_000, 0.00001);
    const a = plan(
      { long: false, exitedToday: false, levels: { entry: 85_000, exit: 79_000 } },
      {
        ...ACC,
        orders: [
          { oid: 1, isBuy: true, reduceOnly: false, isTrigger: true, triggerPx: 85_010, size },
          {
            oid: 2,
            isBuy: false,
            reduceOnly: true,
            isTrigger: true,
            triggerPx: 70_000,
            size: 0.001,
          },
        ],
      },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => [x.kind, "oid" in x ? x.oid : null]),
      [
        ["cancel", 2],
        ["keep", 1],
      ],
    );
  });

  it("remplace le stop d'entrée quand le niveau du jour a changé", () => {
    const a = plan(
      { long: false, exitedToday: false, levels: { entry: 86_000, exit: 79_000 } },
      {
        ...ACC,
        orders: [
          {
            oid: 1,
            isBuy: true,
            reduceOnly: false,
            isTrigger: true,
            triggerPx: 85_000,
            size: 0.00055,
          },
        ],
      },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["cancel", "stop"],
    );
  });

  it("en position : un stop de sortie reduce-only au plus bas, sur toute la position", () => {
    const a = plan(
      { long: true, exitedToday: false, levels: { entry: 86_000, exit: 79_500 } },
      {
        ...ACC,
        position: 0.00056,
        orders: [
          {
            oid: 7,
            isBuy: true,
            reduceOnly: false,
            isTrigger: true,
            triggerPx: 85_000,
            size: 0.00055,
          },
        ],
      },
      OPT,
    );
    assert.deepEqual(a, [
      { kind: "cancel", oid: 7, why: "remplacé par le stop du jour" },
      {
        kind: "stop",
        buy: false,
        triggerPx: 79_500,
        size: 0.00056,
        reduceOnly: true,
        why: "stop de sortie au plus bas des 10 jours",
      },
    ]);
  });

  it("la règle est en position, le compte non : entrée au marché", () => {
    const a = plan(
      { long: true, exitedToday: false, levels: { entry: 86_000, exit: 79_500 } },
      ACC,
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["market"],
    );
    assert.deepEqual(
      [(a[0] as { buy: boolean }).buy, (a[0] as { purpose: string }).purpose],
      [true, "entrée"],
    );
  });

  it("la règle est sortie, le compte non : sortie au marché de toute la position", () => {
    const a = plan(
      { long: false, exitedToday: true, levels: { entry: 86_000, exit: 79_500 } },
      { ...ACC, position: 0.00056 },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["market"],
    );
    assert.deepEqual(
      [
        (a[0] as { buy: boolean }).buy,
        (a[0] as { size: number }).size,
        (a[0] as { purpose: string }).purpose,
      ],
      [false, 0.00056, "sortie"],
    );
  });

  it("pas de stop d'entrée le jour d'une sortie", () => {
    const a = plan(
      { long: false, exitedToday: true, levels: { entry: 86_000, exit: 79_500 } },
      ACC,
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["none"],
    );
  });

  it("refuse un ordre sous le minimum de l'exchange", () => {
    const a = plan(
      { long: false, exitedToday: false, levels: { entry: 86_000, exit: 79_500 } },
      { ...ACC, equity: 8 },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["none"],
    );
  });

  it("referme une position courte inattendue : la règle est long seul", () => {
    const a = plan(
      { long: false, exitedToday: false, levels: { entry: 86_000, exit: 79_500 } },
      { ...ACC, position: -0.001 },
      OPT,
    );
    assert.deepEqual(
      a.map((x) => x.kind),
      ["market"],
    );
    assert.equal((a[0] as { buy: boolean }).buy, true);
  });
});

describe("floorTo — une taille arrondie vers le bas, jamais au-dessus du compte", () => {
  it("coupe au pas de l'actif", () => {
    assert.equal(floorTo(0.000559999, 0.00001), 0.00055);
    assert.equal(floorTo(0, 0.00001), 0);
  });
});
