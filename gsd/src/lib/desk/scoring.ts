import type { Bar, CounterThesis, RegimeRead, ScoreNote, SetupProposal } from "./types";

const DIMENSIONS: [string, Record<string, number>][] = [
  ["alignement", { REGIME_CONTRE: 0, REGIME_NEUTRE: 0.12, REGIME_AVEC: 0.25 }],
  ["niveau", { NIVEAU_AUCUN: 0, NIVEAU_FLOU: 0.1, NIVEAU_NET: 0.2 }],
  ["invalidation", { STOP_ARBITRAIRE: 0, STOP_PLAUSIBLE: 0.1, STOP_STRUCTUREL: 0.2 }],
  ["confluence", { CONFLUENCE_1: 0, CONFLUENCE_2: 0.1, CONFLUENCE_3P: 0.2 }],
  ["obstacle", { OBSTACLE_AUCUN: 0, OBSTACLE_MINEUR: -0.1, OBSTACLE_MAJEUR: -0.3 }],
];

const POIDS_REGIME = 0.15;
const POIDS_SEVERITE = -0.4;
const FENETRE_RANGE = 120;
const FENETRE_NIVEAU = 200;
const FENETRE_STRUCTURE = 120;
const FENETRE_PROCHE = 40;

export function mesurer(
  setup: SetupProposal,
  bars: Bar[],
  regime: RegimeRead | null,
): string[] {
  if (!setup.side || setup.entry_price == null || bars.length === 0) return [];
  const out: string[] = [];
  const entree = setup.entry_price;
  const hausse = setup.side === "LONG";
  const reg = regime && !regime.abstained ? regime.regime : null;

  if (reg === "TREND_UP") out.push(hausse ? "REGIME_AVEC" : "REGIME_CONTRE");
  else if (reg === "TREND_DOWN") out.push(hausse ? "REGIME_CONTRE" : "REGIME_AVEC");
  else if (reg === "RANGE") {
    const recents = bars.slice(-FENETRE_RANGE);
    const bas = Math.min(...recents.map((b) => b.low));
    const haut = Math.max(...recents.map((b) => b.high));
    const etendue = haut - bas;
    if (etendue <= 0) out.push("REGIME_NEUTRE");
    else {
      const place = (entree - bas) / etendue;
      if ((hausse && place <= 0.33) || (!hausse && place >= 0.67)) out.push("REGIME_AVEC");
      else if ((hausse && place >= 0.67) || (!hausse && place <= 0.33)) out.push("REGIME_CONTRE");
      else out.push("REGIME_NEUTRE");
    }
  } else out.push("REGIME_NEUTRE");

  let touches = 0;
  let dedans = false;
  for (const b of bars.slice(-FENETRE_NIVEAU)) {
    const ici = b.low <= entree && entree <= b.high;
    if (ici && !dedans) touches += 1;
    dedans = ici;
  }
  out.push(touches >= 3 ? "NIVEAU_NET" : touches >= 1 ? "NIVEAU_FLOU" : "NIVEAU_AUCUN");

  if (setup.stop_price != null) {
    const stop = setup.stop_price;
    const longue = bars.slice(-FENETRE_STRUCTURE);
    const courte = bars.slice(-FENETRE_PROCHE);
    const auDela = hausse
      ? stop <= Math.min(...longue.map((b) => b.low))
      : stop >= Math.max(...longue.map((b) => b.high));
    const defendable = hausse
      ? stop <= Math.min(...courte.map((b) => b.low))
      : stop >= Math.max(...courte.map((b) => b.high));
    out.push(auDela ? "STOP_STRUCTUREL" : defendable ? "STOP_PLAUSIBLE" : "STOP_ARBITRAIRE");
  }
  return out;
}

function dimension(table: Record<string, number>, etiquettes: Set<string>): number | null {
  const poids = Object.entries(table)
    .filter(([e]) => etiquettes.has(e))
    .map(([, v]) => v);
  return poids.length ? Math.min(...poids) : null;
}

export function noter(
  setup: SetupProposal,
  bars: Bar[],
  regime: RegimeRead | null,
  counter: CounterThesis | null,
): ScoreNote {
  const presentes = new Set([...setup.evaluation, ...mesurer(setup, bars, regime)]);
  const termes: { nom: string; valeur: number }[] = [];
  const omises: string[] = [];
  for (const [nom, table] of DIMENSIONS) {
    const poids = dimension(table, presentes);
    if (poids == null) omises.push(nom);
    else termes.push({ nom, valeur: poids });
  }
  if (regime && !regime.abstained) {
    termes.push({ nom: "regime", valeur: POIDS_REGIME * regime.confidence });
  }
  if (counter && !counter.abstained) {
    termes.push({ nom: "objection", valeur: POIDS_SEVERITE * counter.severity });
  }
  const brut = termes.reduce((a, t) => a + t.valeur, 0);
  const score = Math.max(0, Math.min(1, brut));
  const explication =
    termes.map((t) => `${t.nom} ${t.valeur >= 0 ? "+" : ""}${t.valeur.toFixed(2)}`).join(", ") +
    (omises.length ? ` ; non évalué : ${omises.join(", ")}` : "");
  return { score, termes, omises, explication };
}

export function rewardRisk(setup: SetupProposal): number | null {
  if (setup.entry_price == null || setup.stop_price == null || setup.target_price == null) {
    return null;
  }
  const risk = Math.abs(setup.entry_price - setup.stop_price);
  if (risk === 0) return null;
  return Math.abs(setup.target_price - setup.entry_price) / risk;
}

export function stopDistanceBps(setup: SetupProposal): number | null {
  if (setup.entry_price == null || setup.stop_price == null) return null;
  return (Math.abs(setup.entry_price - setup.stop_price) / setup.entry_price) * 10000;
}
