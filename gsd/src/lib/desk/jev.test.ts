import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jevBody, jevCostUsd, noulP, parseJevResponse, scoreLevel, topChoice, type JevQuestion } from "./jev.ts";

const Q: Record<string, JevQuestion> = {
  prendre: { type: "noul", instructions: "Prendre ce signal ?" },
  famille: {
    type: "choice",
    instructions: "Quelle famille ?",
    criteria: { S1_TREND: "tendance", S2_REVERSION: "retournement", OTHER: null },
  },
  taille: { type: "score", instructions: "Quelle taille ?", criteria: ["0,5×", "1×", "1,5×"] },
};

const OK = {
  model: "jev-1.13",
  answers: {
    prendre: { type: "noul", noul: 0.62 },
    famille: { type: "choice", choice: "S1_TREND", probabilities: { S1_TREND: 0.81, S2_REVERSION: 0.15, OTHER: 0.04 } },
    taille: { type: "score", score: 1.2, probabilities: { "0,5×": 0.1, "1×": 0.7, "1,5×": 0.2 }, confidence: 0.9 },
  },
  usage: { input_tokens: 1200, output_tokens: 0 },
};

describe("parseJevResponse — le GSD ne décide jamais sur un trou", () => {
  it("lit les trois types de réponse et le modèle réellement servi", () => {
    const r = parseJevResponse(OK, Q);
    assert.equal(r.model, "jev-1.13");
    assert.equal(r.inputTokens, 1200);
    assert.equal(noulP(r.answers.prendre), 0.62);
    assert.deepEqual(topChoice(r.answers.famille), { choice: "S1_TREND", p: 0.81 });
    assert.deepEqual(scoreLevel(r.answers.taille, ["0,5×", "1×", "1,5×"]), { level: "1×", index: 1, p: 0.7 });
  });

  it("refuse une réponse manquante", () => {
    const { prendre: _omis, ...reste } = OK.answers;
    assert.throws(() => parseJevResponse({ ...OK, answers: reste }, Q), /prendre/);
  });

  it("refuse une réponse d'un autre type que la question", () => {
    const faux = { ...OK, answers: { ...OK.answers, prendre: { type: "score", score: 1, probabilities: {} } } };
    assert.throws(() => parseJevResponse(faux, Q), /prendre/);
  });

  it("refuse un choix hors de la liste définie", () => {
    const faux = { ...OK, answers: { ...OK.answers, famille: { ...OK.answers.famille, choice: "MM" } } };
    assert.throws(() => parseJevResponse(faux, Q), /hors de la liste/);
  });

  it("garde le nom de modèle demandé si l'API ne le renvoie pas", () => {
    const { model: _m, ...sans } = OK;
    assert.equal(parseJevResponse(sans, Q).model, "jev-latest");
  });
});

describe("coût — le compteur additionne ce qui est facturé, pas un tarif projeté", () => {
  it("0,042 $ par million de jetons d'entrée, sortie gratuite", () => {
    assert.equal(jevCostUsd(1_000_000), 0.042);
    assert.equal(jevCostUsd(1200), 0.0000504);
    assert.equal(jevCostUsd(0), 0);
    assert.equal(jevCostUsd(Number.NaN), 0);
  });
});

describe("jevBody — le format attendu par l'API", () => {
  it("envoie le modèle, l'état et les questions tels quels", () => {
    const b = jevBody({ a: 1 }, Q);
    assert.equal(b.model, "jev-latest");
    assert.deepEqual(b.state, { a: 1 });
    assert.equal(b.questions, Q);
  });
});

describe("scoreLevel — lit les probabilités, pas la note", () => {
  it("prend le niveau le plus probable, quelle que soit l'origine de l'échelle", () => {
    const a = { type: "score" as const, score: 0.1, probabilities: { "4 h": 0.2, "24 h": 0.5, "72 h": 0.3 } };
    assert.equal(scoreLevel(a, ["4 h", "24 h", "72 h"])?.level, "24 h");
  });
  it("ignore une réponse d'un autre type", () => {
    assert.equal(scoreLevel({ type: "noul", noul: 0.5 }, ["a"]), null);
    assert.equal(topChoice({ type: "noul", noul: 0.5 }), null);
    assert.equal(noulP(undefined), null);
  });
});
