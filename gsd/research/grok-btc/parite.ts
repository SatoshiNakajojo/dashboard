/**
 * Parité : le moteur que le bot exécute (`src/lib/desk/btc-rule.ts`) doit
 * retrouver, trade par trade, la variante A testée par `regle_grok.py`.
 *
 *    node --experimental-strip-types research/grok-btc/parite.ts \
 *         <hl_btc_1d.json> <trades_python.json> [fin AAAA-MM-JJ]
 *
 * `trades_python.json` : [[entrée_ms, sortie_ms, px_entrée, px_sortie], …],
 * produit par `regle_grok.jouer(hl, 25, 10, "A")`. Frais : 4,5 bps par côté.
 */
import { readFileSync } from "node:fs";
import { replay, type DayBar } from "../../src/lib/desk/btc-rule.ts";

const FEE = 0.00045;
const DAY = 86_400_000;

const [fichier, pythonTrades, finArg] = process.argv.slice(2);
const brut = JSON.parse(readFileSync(fichier, "utf8")) as {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
}[];
const fin = finArg ? Date.parse(`${finArg}T00:00:00Z`) : Number.POSITIVE_INFINITY;
const bars: DayBar[] = brut
  .map((b) => ({ t: Number(b.t), o: Number(b.o), h: Number(b.h), l: Number(b.l), c: Number(b.c) }))
  .filter((b) => b.t <= fin);

const s = replay(bars);

// Courbe d'équité quotidienne, comme regle_grok.py : entrée et sortie aux prix
// de la règle, position valorisée à la clôture.
let E = 1;
let units = 0;
let pic = 1;
let repli = 0;
let enPosition = 0;
const parEntree = new Map(s.trades.map((x) => [x.entryT, x]));
const parSortie = new Map(s.trades.map((x) => [x.exitT, x]));
for (const b of bars) {
  const sortie = parSortie.get(b.t);
  if (sortie && units > 0) {
    E = units * sortie.exitPx * (1 - FEE);
    units = 0;
  }
  if (units > 0) enPosition += 1;
  const entree =
    parEntree.get(b.t) ?? (s.long && s.entryT === b.t ? { entryPx: s.entryPx as number } : null);
  if (entree && units === 0) units = (E * (1 - FEE)) / entree.entryPx;
  const eq = units > 0 ? units * b.c : E;
  pic = Math.max(pic, eq);
  repli = Math.min(repli, eq / pic - 1);
}
const final = units > 0 ? units * bars[bars.length - 1].c : E;
const rs = s.trades.map((x) => (x.exitPx / x.entryPx) * (1 - FEE) ** 2 - 1).sort((a, b) => a - b);
const mediane =
  rs.length % 2 ? rs[(rs.length - 1) / 2] : (rs[rs.length / 2 - 1] + rs[rs.length / 2]) / 2;

console.log(
  `moteur du bot, ${bars.length} barres jusqu'au ${new Date(bars[bars.length - 1].t).toISOString().slice(0, 10)}`,
);
console.log(
  `  total ${((final - 1) * 100).toFixed(0)} % · repli ${(repli * 100).toFixed(0)} % · ${s.trades.length} trades clos` +
    ` · réussite ${((rs.filter((r) => r > 0).length / rs.length) * 100).toFixed(0)} % · médian ${(mediane * 100).toFixed(1)} %` +
    ` · en position ${((enPosition / bars.length) * 100).toFixed(0)} % du temps`,
);
console.log(
  `  état : ${s.long ? `en position depuis le ${new Date(s.entryT as number).toISOString().slice(0, 10)} à ${s.entryPx}` : "à plat"}` +
    ` · niveaux du jour : entrée ${s.levels?.entry} · sortie ${s.levels?.exit}`,
);

if (pythonTrades) {
  const py = JSON.parse(readFileSync(pythonTrades, "utf8")) as [number, number, number, number][];
  const ts = s.trades.map((x) => [x.entryT, x.exitT, x.entryPx, x.exitPx]);
  const ecarts = [];
  for (let i = 0; i < Math.max(py.length, ts.length); i++) {
    const a = py[i];
    const b = ts[i];
    if (!a || !b || a.some((v, k) => Math.abs(v - b[k]) > (k < 2 ? 0 : 1e-6 * Math.abs(v))))
      ecarts.push({ i, python: a, bot: b });
  }
  console.log(
    `  trades : Python ${py.length}, bot ${ts.length} · ${ecarts.length ? `${ecarts.length} ÉCARTS` : "identiques un à un"}`,
  );
  for (const e of ecarts.slice(0, 5)) console.log("   ", JSON.stringify(e));
  if (ecarts.length) process.exitCode = 1;
}
void DAY;
