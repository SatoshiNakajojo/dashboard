/* Le lanceur de campagnes, cable sur le quadrant des gaz.
 *
 * Une campagne tourne des minutes a des heures ; l'interface, elle, doit
 * rester vive — c'est par elle que passe le coupe-circuit. Ce module ne fait
 * donc qu'envoyer un ordre et lire un etat : tout le travail est cote
 * serveur, dans un processus separe qu'on peut tuer.
 *
 * Il s'ouvre en panneau plein ecran plutot que dans une dalle : choisir une
 * campagne, regler ses tirages et lire sa sortie ne tient pas dans 280 px de
 * large. Le cockpit reste dessous, et le panneau se ferme.
 */

"use strict";

(function () {
  const D = () => window.Desk;
  let etat = null, ouvert = false, timer = null, panneau = null;

  function bati() {
    if (panneau) return panneau;
    panneau = document.createElement("div");
    panneau.id = "campagnes";
    panneau.hidden = true;
    panneau.innerHTML =
      '<div class="cadre">' +
      '<h2>Campagnes<button type="button" class="fermer" ' +
      'aria-label="Fermer">✕</button></h2>' +
      '<div class="corps"><div class="liste"></div>' +
      '<div class="sortie"><pre></pre></div></div></div>';
    document.body.appendChild(panneau);
    panneau.querySelector(".fermer").addEventListener("click", fermer);
    panneau.addEventListener("click", (e) => { if (e.target === panneau) fermer(); });
    return panneau;
  }

  async function lire() {
    try {
      etat = await fetch("/api/campagnes").then((r) => r.json());
      rendre();
    } catch (_) { /* le flux principal signale deja la panne */ }
  }

  function rendre() {
    if (!panneau || !etat) return;
    const liste = panneau.querySelector(".liste");
    const enCours = etat.en_cours;

    liste.innerHTML =
      (etat.refus && !enCours
        ? `<p class="refus">${D().esc(etat.refus)}</p>` : "") +
      etat.catalogue.map((c) => {
        const active = enCours && etat.cle === c.cle;
        const params = Object.entries(c.parametres).map(([n, p]) =>
          `<label>${D().esc(n)}` +
          `<input type="number" id="camp-${c.cle}-${n}" data-camp="${c.cle}" ` +
          `data-nom="${n}" value="${p.defaut}" min="${p.min}" max="${p.max}" ` +
          `step="100"${enCours ? " disabled" : ""}></label>`).join("");
        return `<article class="camp${active ? " active" : ""}">` +
          `<h3>${D().esc(c.titre)}${active ? '<b class="tag">en cours</b>' : ""}</h3>` +
          `<p>${D().esc(c.quoi)}</p>` +
          `<div class="pied"><span class="duree">${D().esc(c.duree)}</span>` +
          params +
          (active
            ? `<button type="button" class="stop" data-stop="1">Arrêter</button>`
            : `<button type="button" class="go" data-go="${c.cle}"` +
              `${enCours || etat.refus ? " disabled" : ""}>Lancer</button>`) +
          `</div></article>`;
      }).join("");

    const pre = panneau.querySelector("pre");
    const auBas = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24;
    pre.textContent = (etat.lignes || []).join("\n") ||
      "Aucune campagne lancée depuis le démarrage.";
    // On ne suit la sortie que si on etait deja en bas : sinon on arrache
    // sous les yeux la ligne que quelqu'un est en train de lire.
    if (auBas) pre.scrollTop = pre.scrollHeight;

    panneau.querySelector("h2").firstChild.textContent =
      enCours
        ? `Campagne — ${etat.titre} · ${Math.floor((etat.depuis_s || 0) / 60)} min ` +
          `${String((etat.depuis_s || 0) % 60).padStart(2, "0")} s`
        : etat.code === null ? "Campagnes"
        : `Campagnes — dernière terminée, code ${etat.code}`;

    liste.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => lancer(b.dataset.go)));
    liste.querySelectorAll("[data-stop]").forEach((b) =>
      b.addEventListener("click", arreter));
  }

  async function lancer(cle) {
    const parametres = {};
    for (const i of panneau.querySelectorAll(`[data-camp="${cle}"]`)) {
      parametres[i.dataset.nom] = Number(i.value);
    }
    const r = await D().post("/api/campagnes/lancer", { cle, parametres });
    if (r && !r.lance) alert(r.raison);
    lire();
  }

  async function arreter() {
    await D().post("/api/campagnes/arreter");
    lire();
  }

  function ouvrir() {
    bati().hidden = false;
    ouvert = true;
    lire();
    // Deux secondes : une campagne n'avance pas plus vite parce qu'on la
    // regarde, et un sondage rapide volerait du CPU a ce qu'on mesure.
    clearInterval(timer);
    timer = setInterval(lire, 2000);
  }
  function fermer() {
    if (panneau) panneau.hidden = true;
    ouvert = false;
    clearInterval(timer);
    timer = null;
  }

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ouvert) fermer();
  });

  /* Le quadrant des gaz : lancer, arreter, ouvrir. Cable par `boutons.js`,
   * qui nous passe sa fabrique de hotspots plutot que de la dupliquer. */
  function cabler(couche, T, hotspot) {
    if (T["gaz-1"]) hotspot(couche, "gaz-1", T["gaz-1"],
      { titre: "Campagnes — lancer", action: ouvrir });
    if (T["gaz-2"]) hotspot(couche, "gaz-2", T["gaz-2"],
      { titre: "Arrêter la campagne", action: arreter });
    if (T["gaz-3"]) hotspot(couche, "gaz-3", T["gaz-3"],
      { titre: "Soufflerie", action: () => D().montrer("soufflerie") });
    if (T["thr-left"]) hotspot(couche, "thr-left", T["thr-left"],
      { titre: "Campagnes", action: ouvrir });
    if (T["thr-right"]) hotspot(couche, "thr-right", T["thr-right"],
      { titre: "Campagnes", action: ouvrir });
  }

  window.CockpitCampagnes = { cabler, ouvrir, fermer };
})();
