/* Les instruments peints de la photo, rendus vivants.
 *
 * Cinq panneaux ne sont pas des ecrans : deux cadrans a aiguille dans
 * « Amplitude », deux dans « Declencheurs », deux dans « Flux », des
 * bargraphes verticaux dans « Distribution des scores », des logements
 * numeriques dans « Regime commute ».
 *
 * Les recouvrir d'un rectangle noir tuait ce qui fait la photo. Ce module
 * garde le decor entier et n'ajoute QUE la lumiere. Le cadran, sa graduation,
 * le verre bombe et la vis de fixation restent ceux de l'image ; seule
 * l'aiguille tourne.
 *
 * Chaque valeur est BORNEE et normalisee dans [0, 1] avant d'atteindre une
 * aiguille. Une aiguille qui depasse sa butee est un bug qui se voit ; une
 * qui sature a la butee est un instrument qui dit « au-dela de ce que je
 * mesure », ce qui est vrai.
 */

"use strict";

(function () {
  const M = () => window.Cockpit;
  const D = () => window.Desk;
  const aiguilles = {}, temoins = {}, afficheurs = {}, barres = {}, colonnes = {};

  // Debattement d'un cadran : 250 degres, de -125 (butee gauche) a +125.
  // C'est la course d'un galvanometre reel ; 180 aurait l'air d'un demi-tour
  // de jauge de carburant.
  const COURSE = 125;

  function borne(v, max) {
    if (v === null || v === undefined || !isFinite(v) || !max) return 0;
    return Math.max(0, Math.min(1, v / max));
  }

  function monter() {
    const { CARTE, fit, creer } = M();
    const inst = CARTE.instruments;
    if (!inst) return;
    const couche = creer("div", "instruments", fit);
    // Chaque logement reprend la couleur du verre eteint qu'il recouvre,
    // relevee sur le JPEG. Un noir arbitraire ferait une piece rapportee.
    for (const [nom, rgb] of Object.entries(inst.teintes || {})) {
      couche.style.setProperty("--verre-" + nom, "rgb(" + rgb + ")");
    }

    // Un cadran est ROND. Sa largeur est un % de la largeur du plateau, sa
    // hauteur un % de sa hauteur : sans le rapport des deux, un rayon de 2 %
    // donne une ellipse — et l'aiguille sort du cadran d'un cote. Le facteur
    // etait ecrit 1.6 en dur, la valeur du plateau 16:10 ; la photo est
    // passee en 16:9 et les aiguilles se sont posees a cote.
    const ratio = CARTE.design.w / CARTE.design.h;
    for (const [cle, r] of Object.entries(inst.aiguilles)) {
      const el = creer("div", "aiguille", couche);
      el.style.left = (r.cx - r.r) + "%";
      el.style.top = (r.cy - r.r * ratio) + "%";
      el.style.width = (r.r * 2) + "%";
      el.style.height = (r.r * 2 * ratio) + "%";
      el.title = r.nom;
      el.innerHTML =
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
        '<line class="brin" x1="50" y1="50" x2="50" y2="14"/>' +
        '<circle class="moyeu" cx="50" cy="50" r="4.5"/></svg>';
      // Une aiguille sans chiffre ne dit rien : on lit qu'elle a bouge, pas
      // de combien. Le cadran peint porte une graduation inventee, donc
      // inutilisable — la valeur s'inscrit en clair sous le moyeu.
      const lecture = creer("b", "lecture", el);
      aiguilles[cle] = { el: el.querySelector(".brin"), src: r.src,
                         lecture, unite: r.unite || "", boite: el, nom: r.nom };
    }

    for (const [cle, r] of Object.entries(inst.temoins)) {
      const el = creer("div", "temoin", couche);
      M().poser(el, r);
      temoins[cle] = { el, src: r.src, dernier: null };
    }

    for (const [cle, r] of Object.entries(inst.afficheurs)) {
      const el = creer("div", "afficheur" + (r.gros ? " gros" : "")
                       + (cle.startsWith("flu") ? " flux" : ""), couche);
      M().poser(el, r);
      // Le logement suit le plan de son panneau, comme les etiquettes.
      if (r.plan) { el.dataset.plan = r.plan; M().incliner(el, r.plan); }
      afficheurs[cle] = { el, span: creer("span", null, el), src: r.src };
    }

    for (const [cle, r] of Object.entries(inst.bargraphes)) {
      const el = creer("div", "bargraphe" + (r.ton === "ok" ? " ok" : ""), couche);
      M().poser(el, r);
      const i = creer("i", null, el);
      barres[cle] = { el: i, src: r.src };
    }

    // Une colonne n'est pas une plaque : la photo la decoupe deja en sept
    // logements separes par du metal. On pose sept rectangles a leurs
    // hauteurs relevees, et le metal reste visible entre eux.
    for (const [cle, r] of Object.entries(inst.colonnes)) {
      const num = r.src.endsWith("num");
      const lignes = r.lignes.map((t) => {
        const el = creer("div", "logement" + (num ? " num" : ""), couche);
        M().poser(el, { l: r.l, t, w: r.w, h: r.h });
        return el;
      });
      colonnes[cle] = { lignes, src: r.src, num };
    }
  }

  /* ------------------------------------------------------------ valeurs */

  function rafraichir(s, rech) {
    if (!s) return;
    const a = s.account, lim = s.limits;
    const expo = a ? Number(a.gross_notional_usd) : 0;
    const lev = a ? Number(a.effective_leverage) : 0;
    const plafondE = Number(lim.max_gross_notional_usd) || 1;
    const plafondL = Number(lim.max_effective_leverage) || 1;
    const ages = (s.feeds || []).map((f) => f.age_ms).filter((x) => x != null);
    const latence = ages.length ? Math.max(...ages) : null;
    const maxAge = Math.max(1, ...(s.feeds || []).map((f) => f.max_age_ms || 1));
    const passes = (s.checks || []).filter((c) => c.passed).length;
    const total = (s.checks || []).length || 1;
    const m = s.mandate;

    const part = {
      expo: borne(expo, plafondE),
      levier: borne(lev, plafondL),
      invariants: passes / total,
      // Un mandat proche de l'expiration fait retomber l'aiguille : c'est
      // exactement ce qu'un instrument de bord doit montrer sans qu'on lise.
      mandat: m && m.ttl_ms ? borne(m.remaining_ms, m.ttl_ms) : 0,
      latence: 1 - borne(latence, maxAge),
      budget: borne(s.budget.ip_pct, 100),
    };
    // La valeur brute derriere chaque aiguille, dans son unite. C'est elle
    // qu'on inscrit : la fraction sert a placer l'aiguille, pas a informer.
    const brut = {
      expo: a ? D().usd(a.gross_notional_usd) : "—",
      levier: a ? Number(a.effective_leverage).toFixed(2) + "×" : "—",
      invariants: passes + "/" + total,
      mandat: m && m.remaining_ms ? D().dur(m.remaining_ms) : "aucun",
      latence: latence == null ? "—" : latence + " ms",
      budget: s.budget.reserve_pct + " %",
    };
    for (const [, g] of Object.entries(aiguilles)) {
      const p = part[g.src] || 0;
      g.el.style.transform = "rotate(" + (-COURSE + p * COURSE * 2).toFixed(1) + "deg)";
      const v = brut[g.src] || "—";
      if (g.lecture.textContent !== v) g.lecture.textContent = v;
      g.boite.title = g.nom + " — " + v;
      // Au-dela de la butee l'instrument le dit : une aiguille collee au
      // maximum sans le signaler laisse croire qu'elle mesure encore.
      g.boite.dataset.butee = p >= 0.999 ? "1" : "0";
    }

    const etats = {
      ws: [s.ws_connected, "vert"],
      halt: [s.halted, "rouge"],
      stops: [!!a && a.positions.every((p) => p.protected), "vert"],
      recon: [!s.blocking.includes("I01_RECONCILED"), "vert"],
      "expo-ok": [expo <= plafondE, "ambre"],
      "lev-ok": [lev <= plafondL, "ambre"],
      "feeds-ok": [!s.blocking.includes("I09_FRESH_DATA"), "vert"],
      sain: [s.healthy, "vert"],
    };
    for (const [, t] of Object.entries(temoins)) {
      const [actif, ton] = etats[t.src] || [false, "vert"];
      t.el.className = "temoin " + ton + (actif ? " on" : "");
      if (t.dernier !== null && t.dernier !== actif) {
        t.el.style.animation = "none";
        void t.el.offsetWidth;
        t.el.style.animation = "clignote 400ms steps(2, end) 1";
      }
      t.dernier = actif;
    }

    const ms = (v) => (v == null ? "—" : v + " ms");
    const f = s.feeds || [];
    const valeurs = {
      equite: a ? D().usd(a.equity_usd) : "—",
      "expo-usd": a ? D().usd(a.gross_notional_usd) : "—",
      positions: a ? String(a.positions.length) : "—",
      mandats: String(lim.mandates_today),
      "lat-1": ms(f[0] && f[0].age_ms), "lat-2": ms(f[1] && f[1].age_ms),
      "lat-3": ms(f[2] && f[2].age_ms), "lat-4": ms(f[3] && f[3].age_ms),
      "budget-n": s.budget.ip_used + "/" + s.budget.ip_limit,
      reserve: s.budget.reserve_pct + " %",
      pnl: a && a.day_pnl_usd != null ? D().usd(a.day_pnl_usd) : "—",
      "reserve-n": s.budget.reserve_left + " r",
    };
    for (const [, af] of Object.entries(afficheurs)) {
      const v = valeurs[af.src];
      if (v !== undefined && af.span.textContent !== v) {
        af.span.textContent = v;
        tenir(af);
      }
    }

    // Les bargraphes de la distribution des scores : ce qui reste sous le
    // seuil a gauche, ce qui l'atteint a droite. Le second est vide depuis
    // le debut du projet, et c'est precisement l'information.
    const q = rech && rech.consommation && rech.consommation.qualite;
    if (q && q.scores && q.scores.length) {
      const seuil = rech.consommation.seuil_conviction;
      const tot = q.scores.reduce((n, b) => n + b.n, 0) || 1;
      const sous = q.scores.filter((b) => b.borne < seuil).reduce((n, b) => n + b.n, 0);
      if (barres["sc-1"]) barres["sc-1"].el.style.height = (100 * sous / tot) + "%";
      if (barres["sc-2"]) barres["sc-2"].el.style.height = (100 * (tot - sous) / tot) + "%";
      rendreColonnes(q.scores);
    }
  }

  // Un nombre plus large que son logement serait coupe, et un nombre coupe
  // ment. On le reduit jusqu'a ce qu'il tienne — l'instrument reste lisible
  // et le logement garde ses bords.
  function tenir(af) {
    af.span.style.transform = "none";
    const dispo = af.el.clientWidth - 3, large = af.span.scrollWidth;
    if (large > dispo && large > 0) {
      af.span.style.transform = "scale(" + Math.max(.45, dispo / large).toFixed(3) + ")";
    }
  }

  function rendreColonnes(seaux) {
    const hmax = Math.max(...seaux.map((b) => b.n)) || 1;
    const lignes = seaux.slice().reverse().slice(0, 7);
    for (const [, c] of Object.entries(colonnes)) {
      c.lignes.forEach((el, k) => {
        const b = lignes[k];
        // Un logement sans valeur reste un logement eteint, pas un vide :
        // on garde ses six LED noires plutot que d'effacer la ligne.
        if (!b) {
          const eteint = c.num ? "" : '<u></u>'.repeat(6);
          if (el.innerHTML !== eteint) el.innerHTML = eteint;
          return;
        }
        if (c.num) {
          const v = String(b.n);
          if (el.textContent !== v) el.textContent = v;
          return;
        }
        const n = Math.round(6 * b.n / hmax);
        const veut = Array.from({ length: 6 },
          (_, j) => '<u class="' + (j < n ? "on" : "") + '"></u>').join("");
        if (el.innerHTML !== veut) el.innerHTML = veut;
      });
    }
  }

  window.CockpitInstruments = { monter, rafraichir };
})();
