/**
 * Superviseur du conteneur VPS.
 *
 * Il fait deux choses que le serveur seul ne fait pas :
 *
 * 1. Il relance le serveur s'il meurt. `restart: unless-stopped` de Docker ne
 *    couvre que la mort du PID 1 ; un serveur qui reste debout sans rien faire
 *    lui paraît sain.
 * 2. Il pique le serveur périodiquement. Le plugin Nitro
 *    `server/plugins/gsd-pilot.ts` démarre déjà la boucle au boot — cette pique
 *    est la ceinture par-dessus les bretelles, et sa trace dans le journal
 *    prouve que le process répond encore.
 *
 * Ce fichier existait mais n'était branché nulle part : le Dockerfile lançait
 * `.output/server/index.mjs` en direct. C'est corrigé.
 */
import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3000";
const PIQUE_MS = 5 * 60 * 1000;
const MAX_REDEMARRAGES = 20;

let redemarrages = 0;
let enfant = null;

const horodate = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const dire = (m) => console.log(`[superviseur ${horodate()}] ${m}`);

function lancer() {
  enfant = spawn("node", [".output/server/index.mjs"], { stdio: "inherit" });
  dire(`serveur lancé (pid ${enfant.pid})`);

  enfant.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      dire(`serveur arrêté par ${signal} — on ne relance pas`);
      process.exit(0);
    }
    redemarrages += 1;
    if (redemarrages > MAX_REDEMARRAGES) {
      dire(`serveur mort ${redemarrages} fois — on abandonne, à Docker de jouer`);
      process.exit(code ?? 1);
    }
    const attente = Math.min(60_000, 2000 * 2 ** Math.min(redemarrages - 1, 5));
    dire(`serveur mort (code ${code}, signal ${signal}) — relance dans ${attente / 1000} s`);
    setTimeout(lancer, attente);
  });
}

async function piquer() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(20_000) });
    dire(`pique HTTP ${r.status}`);
  } catch (e) {
    dire(`pique échouée — ${e instanceof Error ? e.message : e}`);
  }
}

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    dire(`${sig} reçu — arrêt du serveur`);
    enfant?.kill(sig);
  });
}

lancer();
setTimeout(piquer, 15_000);
setInterval(piquer, PIQUE_MS);
