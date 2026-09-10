/* Les stations : on s'approche de l'instrument avant d'ouvrir le secteur.
 *
 * Cliquer « Soufflerie » ouvrait directement l'ecran central. C'est rapide,
 * et c'est faux : sur un poste, on regarde d'abord l'instrument qui porte le
 * sujet, et on ne bascule sur le grand ecran que pour ce qu'on veut voir en
 * detail. Un bouton qui saute au PFD fait du cockpit une barre de menus.
 *
 * Le trajet est donc en deux temps :
 *
 *   1. la loupe cadre le BLOC du secteur, et sa dalle affiche l'index de ce
 *      secteur — les titres reels de ses panneaux, lus dans le DOM ;
 *   2. choisir une entree ouvre le secteur dans la dalle centrale, s'y
 *      approche, et fait defiler jusqu'au panneau choisi.
 *
 * L'index n'est pas une liste ecrite a la main : ce sont les <h2>/<h3> du
 * secteur. Une liste recopiee ici cesserait d'etre juste au premier panneau
 * ajoute, et personne ne s'en apercevrait.
 */

"use strict";

(function () {
  const M = () => window.Cockpit;
  const D = () => window.Desk;

  let active = null;      // secteur dont la station est ouverte

  /* Le libelle d'un titre, sans ses pastilles.
   * `textContent` recolle tout ce qui pend au titre : le compteur d'un
   * badge, un sous-titre. On obtenait « SOUFFLERIE0 » et « Declencheurs —
   * directiondirection ». On prend donc le premier noeud de TEXTE. */
  function texteDe(el) {
    const n = Array.from(el.childNodes)
      .find((c) => c.nodeType === 3 && c.textContent.trim());
    return (n ? n.textContent : el.textContent).trim();
  }

  function titres(secteur) {
    const sec = document.getElementById("sec-" + secteur);
    if (!sec) return [];
    return Array.from(sec.querySelectorAll("h2, h3"))
      .filter((h) => texteDe(h))
      .slice(0, 8);
  }

  function fermer() {
    if (!active) return;
    const st = M().CARTE.stations[active];
    const dalle = document.getElementById("screen-" + st.ecran);
    if (dalle) dalle.classList.remove("station");
    M().ecrans.style.zIndex = "";
    active = null;
    // La dalle reprend son affichage propre au prochain rafraichissement.
    if (window.CockpitEcrans) window.CockpitEcrans.rendre();
  }

  /* Aller a la station d'un secteur. Si le secteur n'a pas de dalle a lui —
   * ou si c'est deja la dalle centrale — on ouvre directement : une station
   * qui renvoie sur elle-meme serait un detour sans contenu. */
  function aller(secteur) {
    const { CARTE } = M();
    const st = (CARTE.stations || {})[secteur];
    if (!st || !st.ecran || st.ecran === "main") { ouvrir(secteur); return; }

    const corps = window.CockpitEcrans && window.CockpitEcrans.corps(st.ecran);
    const dalle = document.getElementById("screen-" + st.ecran);
    if (!corps || !dalle) { ouvrir(secteur); return; }

    const onglet = document.querySelector(`#nav button[data-sec="${secteur}"]`);
    const nom = onglet ? texteDe(onglet) : secteur;
    const liste = titres(secteur);
    corps.innerHTML =
      `<h4><span>${D().esc(nom)}</span><b>${liste.length}</b></h4>` +
      (liste.length
        ? `<div class="index">` + liste.map((h, i) =>
            `<button type="button" class="ix" data-i="${i}">` +
            `${D().esc(texteDe(h))}</button>`).join("") + `</div>`
        : `<div class="mut" style="font-size:9px">Ce secteur n'a pas de panneau.</div>`) +
      `<button type="button" class="ix tout" data-i="-1">Tout ouvrir dans le PFD</button>`;

    corps.querySelectorAll(".ix").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        ouvrir(secteur, Number(b.dataset.i));
      });
    });

    // La dalle passe au-dessus de sa zone cliquable, sinon le hotspot qui la
    // recouvre avalerait les clics de l'index — c'est exactement le bug de
    // la couche des mains, en plus petit.
    if (active) fermer();
    dalle.classList.add("station");
    // La COUCHE des dalles passe au-dessus de celle des boutons. Monter la
    // dalle seule ne suffit pas : elle est dans un autre contexte
    // d'empilement, et son z-index ne se compare pas a celui des hotspots.
    // Trouve en essayant de cliquer l'index pour de vrai — le hotspot qui
    // recouvre la dalle avalait tout.
    M().ecrans.style.zIndex = "8";
    active = secteur;
    if (window.cockpitLoupe) window.cockpitLoupe(st.bloc);
  }

  /* Ouvrir pour de bon : le secteur va dans la dalle centrale, la loupe s'y
   * approche, et on defile jusqu'au panneau choisi. */
  function ouvrir(secteur, indice) {
    fermer();
    D().montrer(secteur);            // enrobe : ouvre le PFD et cadre « desk »
    if (indice == null || indice < 0) return;
    const cible = titres(secteur)[indice];
    const pan = document.getElementById("panneaux");
    if (!cible || !pan) return;
    // On attend que la dalle ait sa taille avant de calculer le defilement.
    requestAnimationFrame(() => {
      const carte = cible.closest("section, .card, article") || cible;
      pan.scrollTop = Math.max(0, carte.offsetTop - 8);
      carte.classList.add("vise");
      setTimeout(() => carte.classList.remove("vise"), 1600);
    });
  }

  window.CockpitStations = { aller, ouvrir, fermer,
                             get active() { return active; } };
})();
