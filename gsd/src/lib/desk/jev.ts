/**
 * Jev (TypeSafe System One) — les petites décisions du GSD, typées.
 *
 * Jev n'écrit pas : il répond à des questions dont toutes les réponses sont
 * définies d'avance (un choix, une note sur une échelle, une probabilité de
 * « oui »). Ce module est pur — il construit la requête, lit la réponse et
 * chiffre son coût — pour être testé sans réseau. L'appel lui-même vit dans
 * `jev.server.ts`.
 *
 * Une probabilité élevée dit que Jev est sûr, pas qu'il a raison. Ses
 * réponses sont journalisées et restent en ombre tant qu'elles n'ont pas été
 * mesurées contre ce qui s'est passé.
 */

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
/** Tarif public au lancement : entrée seulement, la sortie n'est pas facturée. */
export const JEV_USD_PER_MTOK = 0.042;
export const JEV_TIMEOUT_MS = 4_000;

type Instructions = string | Record<string, unknown>;

export type JevQuestion =
  | { type: "noul"; instructions: Instructions }
  | { type: "choice"; instructions: Instructions; criteria: Record<string, string | null> }
  | { type: "score"; instructions: Instructions; criteria: string[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number | null }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence?: number | null };

export type JevParsed = {
  model: string;
  answers: Record<string, JevAnswer>;
  inputTokens: number;
};

export function jevBody(state: unknown, questions: Record<string, JevQuestion>, model = JEV_MODEL) {
  return { model, state, questions };
}

export function jevCostUsd(inputTokens: number) {
  return Number.isFinite(inputTokens) && inputTokens > 0 ? (inputTokens / 1e6) * JEV_USD_PER_MTOK : 0;
}

function probs(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

/**
 * Lit la réponse de l'API. Chaque question posée doit avoir sa réponse, du
 * type demandé : une réponse manquante ou d'un autre type lève une erreur
 * plutôt que de laisser le GSD décider sur un trou.
 */
export function parseJevResponse(json: unknown, questions: Record<string, JevQuestion>, fallbackModel = JEV_MODEL): JevParsed {
  if (!json || typeof json !== "object") throw new Error("Jev : réponse illisible");
  const body = json as { model?: unknown; answers?: unknown; usage?: { input_tokens?: unknown } | null };
  if (!body.answers || typeof body.answers !== "object") throw new Error("Jev : pas de réponses");
  const raw = body.answers as Record<string, Record<string, unknown>>;
  const answers: Record<string, JevAnswer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw[id];
    if (!a || a.type !== q.type) throw new Error(`Jev : réponse « ${id} » absente ou d'un autre type`);
    if (q.type === "noul") {
      const p = Number(a.noul);
      if (!Number.isFinite(p)) throw new Error(`Jev : probabilité « ${id} » illisible`);
      answers[id] = { type: "noul", noul: p };
      continue;
    }
    const pr = probs(a.probabilities);
    if (!pr) throw new Error(`Jev : probabilités « ${id} » illisibles`);
    const confidence = a.confidence == null ? null : Number(a.confidence);
    if (q.type === "choice") {
      const choice = String(a.choice ?? "");
      if (!(choice in q.criteria)) throw new Error(`Jev : choix « ${choice} » hors de la liste de « ${id} »`);
      answers[id] = { type: "choice", choice, probabilities: pr, confidence };
    } else {
      const score = Number(a.score);
      if (!Number.isFinite(score)) throw new Error(`Jev : note « ${id} » illisible`);
      answers[id] = { type: "score", score, probabilities: pr, confidence };
    }
  }
  const tokens = Number(body.usage?.input_tokens);
  return {
    model: typeof body.model === "string" && body.model ? body.model : fallbackModel,
    answers,
    inputTokens: Number.isFinite(tokens) && tokens > 0 ? tokens : 0,
  };
}

/** Le choix retenu et sa probabilité. */
export function topChoice(a: JevAnswer | undefined): { choice: string; p: number } | null {
  if (!a || a.type !== "choice") return null;
  return { choice: a.choice, p: Number(a.probabilities[a.choice] ?? 0) };
}

/**
 * Le niveau le plus probable d'une échelle. On lit les probabilités plutôt
 * que la note fractionnaire, dont l'origine (0 ou 1) n'est pas documentée.
 */
export function scoreLevel(a: JevAnswer | undefined, levels: string[]): { level: string; index: number; p: number } | null {
  if (!a || a.type !== "score") return null;
  let best = -1;
  let bestP = -1;
  levels.forEach((lv, i) => {
    const p = Number(a.probabilities[lv] ?? -1);
    if (p > bestP) {
      bestP = p;
      best = i;
    }
  });
  return best < 0 || bestP < 0 ? null : { level: levels[best], index: best, p: bestP };
}

export function noulP(a: JevAnswer | undefined): number | null {
  return a && a.type === "noul" ? a.noul : null;
}
