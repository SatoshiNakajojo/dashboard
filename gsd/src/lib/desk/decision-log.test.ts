import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compact,
  parseDecisionLines,
  spendByModel,
  summarize,
  summarizeLegacyCommittee,
  summarizeLegacyGate,
  type DecisionRow,
} from "./decision-log.ts";

const row = (o: Partial<DecisionRow>): DecisionRow => ({
  t: 1,
  stage: "J1",
  decider: "règle",
  question: "q",
  answer: "passe",
  applied: true,
  ...o,
});

describe("parseDecisionLines — une ligne tronquée ne casse pas l'écran", () => {
  it("garde les lignes valides, ignore le reste", () => {
    const txt = [
      JSON.stringify(row({ t: 5 })),
      '{"t": 6, "stage": "J1", "decid',
      JSON.stringify({ t: 7, stage: "INCONNU" }),
      "",
      JSON.stringify(row({ t: 8, stage: "J2", decider: "jev" })),
    ].join("\n");
    assert.deepEqual(
      parseDecisionLines(txt).map((r) => r.t),
      [5, 8],
    );
  });
});

describe("summarize — des comptes, jamais une projection", () => {
  it("compte par étape, par réponse et par décideur, et garde la dernière décision", () => {
    const s = summarize([
      row({ t: 10, stage: "J1", answer: "bloque", applied: true }),
      row({ t: 20, stage: "J1", answer: "passe" }),
      row({ t: 15, stage: "J2", decider: "jev", answer: "prendre", applied: false, usd: 0.0001, ms: 120 }),
      row({ t: 30, stage: "J2", decider: "jev", answer: "passer", applied: false, usd: 0.0002, ms: 80 }),
    ]);
    assert.equal(s.total, 4);
    assert.equal(s.since, 10);
    assert.deepEqual(s.stages.J1.answers, { bloque: 1, passe: 1 });
    assert.equal(s.stages.J1.last?.t, 20);
    assert.equal(s.stages.J2.applied, 0);
    assert.equal(s.jev.calls, 2);
    assert.ok(Math.abs(s.jev.usd - 0.0003) < 1e-12);
    assert.equal(s.jev.msMedian, 100);
    assert.equal(s.stages.ORDRE.total, 0);
  });
});

describe("spendByModel — la dépense réelle, modèle par modèle", () => {
  it("additionne ce qui a été facturé et ignore les montants invalides", () => {
    const m = spendByModel([
      { t: 1, usd: 0.02, model: "grok-4.5" },
      { t: 2, usd: 0.03, model: "grok-4.5" },
      { t: 3, usd: 0.00005, model: "jev-1.13" },
      { t: 4, usd: Number.NaN, model: "jev-1.13" },
      { t: 5, usd: -1, model: "grok-4.5" },
    ]);
    assert.equal(m[0].model, "grok-4.5");
    assert.equal(m[0].calls, 2);
    assert.ok(Math.abs(m[0].usdPerCall - 0.025) < 1e-12);
    assert.equal(m[1].calls, 1);
    assert.equal(m[1].first, 3);
  });
});

describe("journaux d'avant", () => {
  it("résume le J1 et ses raisons de blocage", () => {
    const g = summarizeLegacyGate([
      { t: 3, allow: false, reasons: ["REGIME_UNKNOWN", "REGIME_BLOCKS_ALL"] },
      { t: 2, allow: false, reasons: ["REGIME_UNKNOWN"] },
      { t: 4, allow: true, reasons: [] },
    ]);
    assert.deepEqual({ total: g.total, pass: g.pass, block: g.block, since: g.since }, { total: 3, pass: 1, block: 2, since: 2 });
    assert.equal(g.reasons.REGIME_UNKNOWN, 2);
  });
  it("résume le vote d'ombre J2 par source", () => {
    const c = summarizeLegacyCommittee([
      { source: "grok-4.5", pm: { recommend_allow: true } },
      { source: "local", pm: { recommend_allow: false } },
      { source: "skip_j1" },
    ]);
    assert.deepEqual(c.bySource, { "grok-4.5": 1, local: 1, skip_j1: 1 });
    assert.equal(c.recommendAllow, 1);
  });
});

describe("compact — la routine tient en une ligne, les décisions de Jev jamais", () => {
  it("fusionne les régimes fermés consécutifs et garde la plage horaire", () => {
    const c = compact([
      row({ t: 30, stage: "J0", answer: "non", detail: "REGIME_UNKNOWN" }),
      row({ t: 20, stage: "J0", answer: "non", detail: "REGIME_UNKNOWN" }),
      row({ t: 10, stage: "J0", answer: "non", detail: "REGIME_UNKNOWN" }),
      row({ t: 5, stage: "J0", answer: "oui", detail: "TREND/BULL" }),
    ]);
    assert.equal(c.length, 2);
    assert.deepEqual({ count: c[0].count, t: c[0].t, tFirst: c[0].tFirst }, { count: 3, t: 30, tFirst: 10 });
  });
  it("fusionne « tenir » malgré un détail qui change, et garde le plus récent", () => {
    const c = compact([
      row({ t: 2, stage: "GESTION", asset: "SOL", answer: "tenir", detail: "ROE 2,1 %" }),
      row({ t: 1, stage: "GESTION", asset: "SOL", answer: "tenir", detail: "ROE 1,4 %" }),
    ]);
    assert.equal(c.length, 1);
    assert.equal(c[0].detail, "ROE 2,1 %");
  });
  it("ne fusionne ni deux actifs différents, ni deux avis de Jev", () => {
    const c = compact([
      row({ t: 4, stage: "GESTION", asset: "SOL", answer: "tenir" }),
      row({ t: 3, stage: "GESTION", asset: "ETH", answer: "tenir" }),
      row({ t: 2, stage: "J2", decider: "jev", answer: "passer", p: 0.4, applied: false }),
      row({ t: 1, stage: "J2", decider: "jev", answer: "passer", p: 0.4, applied: false }),
    ]);
    assert.equal(c.length, 4);
  });
});
