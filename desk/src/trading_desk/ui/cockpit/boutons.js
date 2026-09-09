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
    hotspot(couche, "btn-debit", H["btn-debit"], {
      titre: "Débit des flux", action: () => D().montrer("telemetrie"),
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

    hotspot(hotas, "joy-l-trigger", T["joy-l-trigger"],
            { cls: "trigger", raison: mort });
    hotspot(hotas, "joy-r-trigger", T["joy-r-trigger"],
            { cls: "trigger", raison: mort });

    hotspot(hotas, "joy-l-hat", T["joy-l-hat"], {
      titre: "Intervalle du backtest", action: () => cycler("cbIv", 1) });
    hotspot(hotas, "joy-r-hat", T["joy-r-hat"], {
      titre: "Actif du backtest", action: () => cycler("cbActif", 1) });

    const couronne = [
      ["joy-l-crown-r", "Tout arrêter", () => document.getElementById("kill").click()],
      ["joy-l-crown-y", "Réarmer le desk", () => D().post("/api/arm")],
      ["joy-l-crown-g", "Rafraîchir", () => location.reload()],
      ["joy-l-crown-b", "Thème", () => document.getElementById("theme").click()],
      ["joy-r-crown-r", "Secteur précédent", () => secteurVoisin(-1)],
      ["joy-r-crown-y", "Secteur suivant", () => secteurVoisin(1)],
      ["joy-r-crown-g", "Mode HUD", () => window.cockpitHud()],
      ["joy-r-crown-b", "Calibrage", () => document.getElementById("cockpit")
                                             .classList.toggle("debug")],
    ];
    for (const [cle, titre, action] of couronne) {
      hotspot(hotas, cle, T[cle], { titre, action });
    }

    hotspot(hotas, "thr-left", T["thr-left"], {
      titre: "Stratégie précédente", action: () => cycler("cbStrat", -1) });
    hotspot(hotas, "thr-right", T["thr-right"], {
      titre: "Stratégie suivante", action: () => cycler("cbStrat", 1) });

    const gaz = [
      ["thr-btn-r", "Pré-vol", "prevol"], ["thr-btn-y", "Soufflerie", "soufflerie"],
      ["thr-btn-g", "Vols", "vols"], ["thr-btn-b", "Systèmes", "systemes"],
    ];
    for (const [cle, titre, secteur] of gaz) {
      hotspot(hotas, cle, T[cle], { titre, action: () => D().montrer(secteur) });
    }
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
