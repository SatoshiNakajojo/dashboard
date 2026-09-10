/* Les commandes photographiees.
 *
 * Un bouton dessine en CSS ne rejoint jamais tout a fait le grain et
 * l'eclairage de la photo. Une piece photographiee, si — c'est le meme
 * monde. Chacune est une paire d'images cadrees a l'identique, superposees,
 * dont on change l'opacite : rien ne bouge d'un pixel entre les deux etats.
 *
 * Deux details qui font toute la difference :
 *
 * **L'etat eteint peut etre DERIVE.** Quand seule l'image allumee existe, on
 * la desature et on l'assombrit plutot que d'exiger un second fichier. Deux
 * fichiers a garder alignes, c'est deux occasions de les desaligner.
 *
 * **Un voyant sur fond noir se compose en `screen`.** Detourer une lueur lui
 * coupe son halo, et le halo est precisement ce qui la rend credible. En
 * `screen`, le noir disparait tout seul.
 *
 * Chaque voyant suit un booleen REEL. Un voyant decoratif est pire qu'un
 * voyant absent : on apprend a ne plus le regarder, et le jour ou il dit
 * quelque chose, personne ne le voit.
 */

"use strict";

(function () {
  const M = () => window.Cockpit;
  const D = () => window.Desk;
  const poses = {};

  /* L'empreinte a effacer sous une piece.
   *
   * Par defaut un peu plus large que la piece — ce qu'elle recouvre depasse
   * presque toujours. `etendue` dans la carte donne le facteur, ou un
   * rectangle complet quand le voisinage interdit d'elargir : les huit
   * icones du bandeau de droite se touchent, y effacer trop mangerait la
   * voisine et laisserait un trou dans la rangee.
   */
  const ETENDUE_PAR_DEFAUT = 1.55;
  function etendue(r) {
    const e = r.etendue;
    if (e && typeof e === "object") return e;
    const k = typeof e === "number" ? e : ETENDUE_PAR_DEFAUT;
    return { l: r.l - r.w * (k - 1) / 2, t: r.t - r.h * (k - 1) / 2,
             w: r.w * k, h: r.h * k };
  }

  function monter() {
    const { CARTE, hotspots: couche, creer, poser } = M();
    const liste = CARTE.voyants || {};
    for (const [cle, r] of Object.entries(liste)) {
      const b = creer("button", "voyant", couche);
      b.id = cle; b.type = "button";
      b.title = r.label || cle;
      b.setAttribute("aria-label", r.label || cle);
      poser(b, r);

      // Effacer AVANT de poser : sans ca la molette, l'icone ou la lampe que
      // la photo peint a cet endroit deborde autour de la piece, et l'oeil
      // lit « vignette collee » avant de lire « voyant du cockpit ».
      // `etendue` dit quelle empreinte effacer : plus large que la piece pour
      // une molette qui deborde, plus etroite pour un voyant qu'on glisse
      // DANS un cerclage peint qu'on veut garder.
      const cache = creer("i", "cache", b);
      M().cacher(cache, r, etendue(r));
      // Une piece d'aplomb sur une console qui fuit se voit autant qu'une
      // molette qui depasse. Le plan vient de la carte, comme les etiquettes.
      if (r.plan) { b.dataset.plan = r.plan; M().incliner(b, r.plan); }

      const base = M().CHEMIN + "assets/commandes/" + r.image + "-";
      // Les variantes reellement livrees sont declarees dans la carte. On
      // les lisait autrefois en demandant les trois fichiers et en rattrapant
      // les 404 : ca marchait, mais ca faisait quatre requetes perdues a
      // chaque chargement et, sur la page publiee, quatre erreurs serveur
      // pour des fichiers qu'on savait absents depuis le debut.
      const dispo = (CARTE.commandes || {})[r.image] || ["on", "off", "alerte"];
      const on = creer("img", "cmd on", b);
      on.alt = ""; on.src = base + "on.png";
      const off = creer("img", "cmd off", b);
      off.alt = "";
      if (dispo.indexOf("off") >= 0) {
        off.src = base + "off.png";
      } else {
        // Pas d'image eteinte : on derive de l'allumee. Meme cadrage, garanti.
        off.src = on.src;
        off.classList.add("derive");
      }
      // Le filet reste : un fichier declare mais illisible ne doit pas
      // laisser un trou noir a la place du voyant.
      off.addEventListener("error", () => {
        off.src = on.src;
        off.classList.add("derive");
      });
      if (dispo.indexOf("alerte") >= 0) {
        const alerte = creer("img", "cmd alerte", b);
        alerte.alt = ""; alerte.src = base + "alerte.png";
        alerte.addEventListener("error", () => alerte.remove());
      }
      // Sans piece d'alerte, la feuille de style fait clignoter l'allumee :
      // l'etat reste lisible, il n'est pas perdu.
      // Si meme l'image allumee manque, la piece disparait plutot que de
      // laisser un cadre vide sur le tableau de bord.
      on.addEventListener("error", () => b.remove());

      const action = window.CockpitBoutons && window.CockpitBoutons.agir(r.action);
      if (action) b.addEventListener("click", action);
      else b.disabled = true;
      poses[cle] = { el: b, etat: r.etat, dernier: null };
    }
  }

  /* Les etats. Tous lus dans l'instantane du desk, aucun inventé. */
  function rafraichir(s, rech) {
    if (!s) return;
    const a = s.account, b = s.budget || {};
    const etats = {
      ws: s.ws_connected ? "on" : "off",
      halt: s.halted ? "alerte" : "off",
      sain: s.healthy ? "on" : "off",
      mandat: s.halted ? "alerte" : (s.mandate ? "on" : "off"),
      actif: s.uptime_s > 0 ? "on" : "off",
      "budget-bas": b.reserve_pct == null ? "off"
        : (b.reserve_pct < 10 ? "alerte" : (b.reserve_pct < 30 ? "on" : "off")),
      recherche: rech ? "on" : "off",
      journal: rech && rech.navigation && rech.navigation.positions
        && rech.navigation.positions.length ? "on" : "off",
      "expo-ok": a && Number(a.gross_notional_usd) > 0 ? "on" : "off",
    };
    for (const [, v] of Object.entries(poses)) {
      const e = etats[v.etat] || "off";
      if (e === v.dernier) continue;
      v.dernier = e;
      v.el.dataset.etat = e;
    }
  }

  window.CockpitVoyants = { monter, rafraichir };
})();
