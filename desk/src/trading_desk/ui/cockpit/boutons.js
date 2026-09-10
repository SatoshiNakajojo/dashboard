/* Les boutons physiques de la photo, rendus cliquables un par un.
 *
 * Aucun handler neuf. Chaque hotspot appelle une fonction qui existe deja
 * dans `desk.js` — c'est la regle du brief, et c'est aussi la seule facon
 * d'eviter que le cockpit devienne une seconde application avec ses propres
 * bugs.
 *
 * QUAND UN HANDLER N'EXISTE PAS, le bouton est visible et DESACTIVE, avec
 * l'infobulle qui dit pourquoi. Deux cas dans ce cockpit, et le deuxieme
 * merite d'etre lu :
 *
 * Les gachettes des joysticks. Le brief les veut sur « acheter » et
 * « vendre ». Cette interface ne le peut pas : elle ne passe AUCUN ordre,
 * par construction, et un test du depot le verifie
 * (`assert "/api/order" not in r.text`). Un tableau de bord qui peut ouvrir
 * une position est un tableau de bord qu'on peut cliquer par erreur — et
 * deux gachettes sous les pouces sont exactement le pire endroit pour ca.
 * Elles restent donc mortes, et le disent.
 */

"use strict";

(function () {
  const M = () => window.Cockpit;
  const D = () => window.Desk;

  function hotspot(couche, cle, r, options) {
    const { creer, poser } = M();
    const b = creer("button", "hotspot" + (options.cls ? " " + options.cls : ""), couche);
    b.id = cle;
    b.type = "button";
    poser(b, r);
    b.setAttribute("aria-label", r.label || options.label || cle);
    b.title = options.titre || r.label || "";
    if (options.action) {
      b.addEventListener("click", options.action);
    } else {
      b.disabled = true;
      b.title = options.raison || "non branché";
      b.setAttribute("aria-disabled", "true");
    }
    return b;
  }

  /* Les selecteurs de la Soufflerie sont pilotes depuis les manettes. Faire
   * defiler un `<select>` existant plutot que dupliquer sa logique : le
   * backtest se relance par son propre evenement `change`. */
  function cycler(id, sens) {
    const sel = document.getElementById(id);
    if (!sel || !sel.options.length) return;
    const n = sel.options.length;
    sel.selectedIndex = (sel.selectedIndex + (sens > 0 ? 1 : n - 1)) % n;
    sel.dispatchEvent(new Event("change"));
  }

  function secteurVoisin(sens) {
    const S = D().secteurs;
    const actuel = document.querySelector('#nav button[aria-selected="true"]');
    const i = S.findIndex(([id]) => id === (actuel && actuel.dataset.sec));
    const j = ((i < 0 ? 0 : i) + (sens > 0 ? 1 : S.length - 1)) % S.length;
    D().montrer(S[j][0]);
  }

  /* Un inverseur a deux ou trois positions. Le levier est un dessin
   * vectoriel : net a n'importe quel zoom, alors qu'une animation matricielle
   * deviendrait floue precisement quand on zoome pour regarder de pres. */
  function inverseur(couche, cle, r, action) {
    const { creer, poser } = M();
    const n = r.n || 2;
    const b = creer("button", "inverseur", couche);
    b.id = cle; b.type = "button";
    poser(b, r);
    b.dataset.p = "0"; b.dataset.on = "0"; b.dataset.n = String(n);
    b.title = r.label || cle;
    b.setAttribute("aria-label", (r.label || cle) + " — position 1 sur " + n);
    // Le cache prend le metal exact du panneau qu'il recouvre : sans lui on
    // verrait DEUX leviers, celui de la photo et le mien. Avec un noir choisi
    // a l'oeil, on voyait une vignette collee sur une belle piece.
    M().metal(b, r);
    const crans = Array.from({ length: n }, (_, i) =>
      `<circle cx="${30 - (n - 1) * 9 + i * 18}" cy="16" r="2.6" ` +
      `fill="rgba(0,0,0,.32)"/>`).join("");
    b.innerHTML =
      '<svg viewBox="0 0 60 92" aria-hidden="true">' +
      '<rect class="halo" x="2" y="2" width="56" height="88" rx="6"/>' +
      crans +
      '<ellipse cx="30" cy="70" rx="13" ry="10" fill="rgba(0,0,0,.34)"/>' +
      '<g class="lev"><rect x="26" y="26" width="8" height="40" rx="4" ' +
      'fill="#6e7d85"/><circle cx="30" cy="27" r="7.5" fill="#98a8af"/>' +
      '<circle cx="30" cy="27" r="3" fill="#cbd9dd"/></g>' +
      '<ellipse cx="30" cy="70" rx="9.5" ry="7" fill="#141b1f"/></svg>';
    b.addEventListener("click", () => {
      const p = (+b.dataset.p + 1) % n;
      b.dataset.p = String(p);
      b.dataset.on = p ? "1" : "0";
      b.setAttribute("aria-label",
        (r.label || cle) + " — position " + (p + 1) + " sur " + n);
      if (action) action(p);
    });
    return b;
  }

  function monter() {
    const { CARTE, hotspots: couche, hotas, fx, creer, poser } = M();
    const H = CARTE.hotspots;

    /* ---- rangee haute et colonnes ------------------------------------- */

    hotspot(couche, "btn-sources", H["btn-sources"], {
      titre: "Sources de recherche — campagnes, artefacts, journaux",
      action: () => D().montrer("soufflerie"),
    });
    hotspot(couche, "btn-poste", H["btn-poste"], {
      titre: "Pré-vol — la liste de vérifications",
      action: () => D().montrer("prevol"),
    });
    hotspot(couche, "btn-rail", H["btn-rail"], {
      titre: "Sources de recherche", action: () => D().montrer("soufflerie"),
    });
    hotspot(couche, "btn-desk-left", H["btn-desk-left"], {
      titre: "Pré-vol", action: () => D().montrer("prevol"),
    });
    hotspot(couche, "btn-desk-right", H["btn-desk-right"], {
      titre: "Systèmes", action: () => D().montrer("systemes"),
    });

    const onglets = {
      "tab-poste": "prevol", "tab-telemetrie": "telemetrie",
      "tab-navigation": "navigation", "tab-conso": "consommation",
      "tab-vols": "vols", "tab-systemes": "systemes",
    };
    for (const [cle, secteur] of Object.entries(onglets)) {
      hotspot(couche, cle, H[cle], {
        titre: H[cle].label, action: () => D().montrer(secteur),
      });
    }

    const icones = [
      ["icon-1", "Rafraîchir la recherche", () => location.reload()],
      ["icon-2", "Soufflerie", () => D().montrer("soufflerie")],
      ["icon-3", "Télémétrie", () => D().montrer("telemetrie")],
      ["icon-4", "Navigation", () => D().montrer("navigation")],
      ["icon-5", "Thème", () => document.getElementById("theme").click()],
      ["icon-6", "Mode HUD — dégage les mains", () => window.cockpitHud()],
    ];
    for (const [cle, titre, action] of icones) {
      hotspot(couche, cle, H[cle], { titre, action });
    }

    /* ---- ecrans -------------------------------------------------------- */

    // Le coupe-circuit. Il delegue au bouton existant, qui porte deja la
    // confirmation en deux temps : la reimplémenter ici creerait un second
    // chemin d'arret, moins teste que celui qu'on veut voir marcher.
    hotspot(couche, "btn-kill", H["btn-kill"], {
      titre: "Tout arrêter — deux clics",
      action: () => document.getElementById("kill").click(),
    });
    hotspot(couche, "btn-mandat", H["btn-mandat"], {
      titre: "Mandat en vigueur", action: () => D().montrer("systemes"),
    });

    /* ---- HOTAS --------------------------------------------------------- */

    const T = CARTE.hotas;
    const mort = "Cette interface ne passe aucun ordre. Elle peut arrêter le " +
                 "desk, elle ne peut pas le faire trader.";

    // Les inverseurs ouvrent un secteur, comme les onglets qu'ils doublent :
    // sur un vrai poste, plusieurs commandes menent au meme systeme.
    const SECT = {
      "inv-g-1": "prevol", "inv-g-2": "telemetrie", "inv-g-3": "navigation",
      "inv-d-1": "consommation", "inv-d-2": "vols",
    };
    for (const [cle, secteur] of Object.entries(SECT)) {
      if (T[cle]) inverseur(hotas, cle, T[cle], (p) => { if (p) D().montrer(secteur); });
    }

    hotspot(hotas, "joy-l-trigger", T["joy-l-trigger"],
            { cls: "trigger", raison: mort });
    hotspot(hotas, "joy-r-trigger", T["joy-r-trigger"],
            { cls: "trigger", raison: mort });

    hotspot(hotas, "joy-l-hat", T["joy-l-hat"], {
      titre: "Intervalle du backtest", action: () => cycler("cbIv", 1) });
    hotspot(hotas, "joy-r-hat", T["joy-r-hat"], {
      titre: "Actif du backtest", action: () => cycler("cbActif", 1) });

    const commandes = [
      ["btn-l-1", "Tout arrêter", () => document.getElementById("kill").click()],
      ["btn-l-2", "Réarmer le desk", () => D().post("/api/arm")],
      ["btn-l-3", "Rafraîchir", () => location.reload()],
      ["btn-l-4", "Pré-vol", () => D().montrer("prevol")],
      ["btn-l-5", "Soufflerie", () => D().montrer("soufflerie")],
      ["btn-l-6", "Systèmes", () => D().montrer("systemes")],
      ["btn-r-1", "Secteur précédent", () => secteurVoisin(-1)],
      ["btn-r-2", "Secteur suivant", () => secteurVoisin(1)],
      ["btn-r-3", "Mode HUD", () => window.cockpitHud()],
      ["btn-r-4", "Vols", () => D().montrer("vols")],
      ["btn-r-5", "Navigation", () => D().montrer("navigation")],
      ["btn-r-6", "Calibrage", () => document.getElementById("cockpit")
                                       .classList.toggle("debug")],
      ["mol-red", "Thème", () => document.getElementById("theme").click()],
      ["mol-check", "Rafraîchir", () => location.reload()],
      ["mol-trig-1", "Secteur précédent", () => secteurVoisin(-1)],
      ["mol-trig-2", "Secteur suivant", () => secteurVoisin(1)],
    ];
    for (const [cle, titre, action] of commandes) {
      if (T[cle]) hotspot(hotas, cle, T[cle], { titre, action });
    }

    hotspot(hotas, "thr-left", T["thr-left"], {
      titre: "Stratégie précédente", action: () => cycler("cbStrat", -1) });
    hotspot(hotas, "thr-right", T["thr-right"], {
      titre: "Stratégie suivante", action: () => cycler("cbStrat", 1) });

    // Les trois boutons du quadrant des gaz commandent les campagnes. Le
    // lanceur les cable lui-meme : il connait son etat, pas ce module.
    if (window.CockpitCampagnes) window.CockpitCampagnes.cabler(hotas, T, hotspot);
  }

  /* Les temoins lumineux sont rendus par `ecrans.js`, dans le contenu des
   * ecrans qui recouvrent les panneaux ou la photo les peint. Ils suivent des
   * booleens reels : une LED decorative est pire qu'une LED absente, on
   * apprend a ne plus la regarder et le jour ou elle dit quelque chose,
   * personne ne la voit. */
  function rafraichir(s) {
    if (!s) return;
  }

  window.CockpitBoutons = { monter, rafraichir };
})();
