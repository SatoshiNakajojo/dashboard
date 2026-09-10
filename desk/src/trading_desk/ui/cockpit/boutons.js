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
 * Les gachettes des joysticks. Le brief les voulait sur « acheter » et
 * « vendre ». Cette interface ne le peut pas : elle ne passe AUCUN ordre,
 * par construction, et un test du depot verifie qu'aucune route d'ordre
 * n'apparait dans la page. Un tableau de bord qui peut ouvrir une position
 * est un tableau de bord qu'on peut cliquer par erreur — et deux gachettes
 * sous les pouces sont exactement le pire endroit pour ca.
 *
 * (La photo du 10 septembre a retire les manches : ces deux boutons n'ont
 * plus de support. La regle, elle, ne depend pas de la photo.)
 *
 * On ne cite pas le chemin de la route ici. Une chaine ecartee qui traine
 * dans un fichier d'interface finit recopiee par quelqu'un qui la prend
 * pour une valeur — et elle a fait echouer ce test-la, ce qui etait juste.
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
  /* Une commande photographiee : deux PNG cadres a l'identique, l'un pose
   * sur l'autre, et on change l'opacite. Rien ne bouge d'un pixel entre les
   * deux etats — c'est tout l'interet d'une paire par rapport a une image
   * unique qu'on deplacerait.
   *
   * Si les fichiers manquent, la piece retombe sur son dessin vectoriel :
   * une image absente ne doit jamais faire un trou dans le tableau de bord.
   */
  function habiller(b, nom) {
    const base = M().CHEMIN + "assets/commandes/" + nom + "-";
    const off = M().creer("img", "cmd off", b);
    const on = M().creer("img", "cmd on", b);
    off.alt = ""; on.alt = "";
    let manquant = 0;
    const rate = () => { if (++manquant === 1) b.classList.remove("photo"); };
    off.addEventListener("error", rate);
    on.addEventListener("error", rate);
    off.addEventListener("load", () => b.classList.add("photo"));
    off.src = base + "off.png";
    on.src = base + "on.png";
  }

  function inverseur(couche, cle, r, action) {
    const { creer, poser } = M();
    const n = r.n || 2;
    const b = creer("button", "inverseur", couche);
    b.id = cle; b.type = "button";
    poser(b, r);
    if (r.image) habiller(b, r.image);
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

  /* Le vocabulaire des commandes.
   *
   * Chaque bouton porte son action DANS LA CARTE ; ce module ne fait que
   * traduire. La version precedente tenait la liste des cles en dur ici :
   * la photo a change, les cles avec, et le cockpit s'est retrouve avec un
   * seul bouton sur quarante-six — sans qu'aucun test ne le voie, puisqu'ils
   * verifient des rectangles, pas des branchements.
   */
  function agir(verbe) {
    const [nom, a, b] = String(verbe).split(":");
    switch (nom) {
      // On passe par la STATION du secteur : la loupe cadre d'abord
      // l'instrument concerne, et c'est le choix fait dessus qui envoie vers
      // l'ecran central. Sauter directement au PFD ferait du cockpit une
      // barre de menus.
      case "secteur":            return () => window.CockpitStations
                                   ? window.CockpitStations.aller(a)
                                   : D().montrer(a);
      case "secteur-suivant":    return () => secteurVoisin(1);
      case "secteur-precedent":  return () => secteurVoisin(-1);
      case "fermer":             return () => window.cockpitFermerSecteur &&
                                              window.cockpitFermerSecteur();
      case "loupe":              return () => window.cockpitLoupe &&
                                              window.cockpitLoupe(a);
      case "hud":                return () => window.cockpitHud();
      case "calibrage":          return () => document.getElementById("cockpit")
                                                .classList.toggle("debug");
      case "theme":              return () => document.getElementById("theme").click();
      case "recharger":          return () => location.reload();
      // Le coupe-circuit delegue au bouton existant, qui porte deja la
      // confirmation en deux temps. Un second chemin d'arret serait moins
      // teste que celui qu'on veut voir marcher.
      case "kill":               return () => document.getElementById("kill").click();
      case "arm":                return () => D().post("/api/arm");
      case "campagnes":          return () => window.CockpitCampagnes &&
                                              window.CockpitCampagnes.ouvrir();
      case "campagne-stop":      return () => window.CockpitCampagnes &&
                                              window.CockpitCampagnes.arreter();
      case "cycle":              return () => cycler(a, Number(b) || 1);
      default:                   return null;
    }
  }

  function verbeDe(r) {
    if (r.action) return r.action;
    if (r.secteur) return "secteur:" + r.secteur;
    return null;
  }

  function monter() {
    const { CARTE, hotspots: couche, hotas, creer, poser } = M();
    void creer; void poser;

    // Les zones cliquables du tableau de bord.
    for (const [cle, r] of Object.entries(CARTE.hotspots || {})) {
      const action = agir(verbeDe(r));
      if (!action) continue;
      hotspot(couche, cle, r, { titre: r.label || cle, action });
    }

    // Les commandes physiques : pupitres, molettes, inverseurs.
    for (const [cle, r] of Object.entries(CARTE.hotas || {})) {
      if (r.type === "inverseur") {
        // Un inverseur ouvre un secteur, comme l'onglet qu'il double : sur un
        // vrai poste, plusieurs commandes menent au meme systeme.
        const action = agir(verbeDe(r));
        inverseur(hotas, cle, r, (p) => { if (p && action) action(); });
        continue;
      }
      const action = agir(verbeDe(r));
      if (!action) continue;
      hotspot(hotas, cle, r, { titre: r.label || cle, action });
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

  window.CockpitBoutons = { monter, rafraichir, agir };
})();
