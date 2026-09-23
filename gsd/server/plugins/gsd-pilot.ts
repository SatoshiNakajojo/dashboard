/**
 * Démarre la boucle de trading AU BOOT DU SERVEUR.
 *
 * Le crochet de démarrage vivait au bas de `pilot.server.ts`, mais ce module
 * n'était chargé que par un `await import()` déclenché par une requête client.
 * Sans onglet de navigateur ouvert, il n'était jamais importé : ni entrée, ni
 * revue, ni coupe. Le 21/09/2026 le compte a passé près de sept heures avec
 * six positions à levier et personne pour les surveiller — la règle de coupe
 * n'était pas cassée, rien ne l'exécutait.
 *
 * Nitro exécute les plugins de `serverDir` une fois, au démarrage du process.
 * C'est le seul endroit où ce démarrage ne dépend de personne.
 */
export default function gsdPilotPlugin() {
  void (async () => {
    const clesPresentes = Boolean(process.env.HL_AGENT_KEY && process.env.HL_MASTER);
    try {
      const m = await import("../../src/lib/desk/pilot.server");
      m.startPilot();
      console.log(
        `[gsd] pilote démarré au boot du serveur · clés Hyperliquid ${clesPresentes ? "présentes" : "ABSENTES"}`,
      );
      if (!clesPresentes) {
        console.warn("[gsd] HL_AGENT_KEY / HL_MASTER manquantes — le pilote tournera à vide.");
      }
    } catch (e) {
      // Un échec ici rend le bot inerte sans qu'aucune requête ne le signale :
      // il se hurle dans le journal du conteneur.
      console.error("[gsd] PILOTE NON DÉMARRÉ —", e instanceof Error ? e.stack : e);
    }
  })();
}
