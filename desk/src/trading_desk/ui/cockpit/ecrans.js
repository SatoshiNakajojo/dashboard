/* Les dix ecrans peints, remplis par les vraies donnees du desk.
 *
 * Chaque ecran est un rectangle qui recouvre UNIQUEMENT la dalle interieure
 * de la photo : le biseau metallique reste visible tout autour. C'est ce
 * detail qui fait la difference entre un ecran encastre et un rectangle pose
 * par-dessus.
 *
 * Aucune donnee n'est redemandee. `desk.js` emet `desk:snapshot` a chaque
 * trame SSE et `desk:recherche` a chaque relecture des artefacts ; on s'y
 * abonne. Un second appel a `/api/snapshot` doublerait la charge et, pire,
 * afficherait un instant different de celui des panneaux.
 */

"use strict";

(function () {
  const M = () => window.Cockpit;
  const D = () => window.Desk;
  const ecrans = {};
  let snap = null, rech = null;

  function bati(cle) {
    const { CARTE, ecrans: couche, creer, poser } = M();
    const r = CARTE.screens[cle];
    const el = creer("div", "screen", couche);
    el.id = "screen-" + cle;
    el.tabIndex = 0;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", r.titre);
    poser(el, r);
    percer(el, r);
    const corps = creer("div", "corps", el);
    ecrans[cle] = corps;
    return corps;
  }

  /* Percer une dalle aux silhouettes des avant-bras.
   *
   * Le masque est un SVG en une ligne : un rectangle plein, puis la
   * silhouette en sous-chemin. La regle « evenodd » fait du second un trou.
   * Rien n'est recompose — sous le trou, c'est la photo, donc le gant est
   * exactement celui du JPEG.
   *
   * Le contour est volontairement 0,4 point plus large que le gant : s'il
   * etait plus etroit, un liseré de dalle allumee depasserait autour de la
   * main et se verrait de loin. Plus large, il laisse au pire un cheveu du
   * biseau peint, sombre, qu'on ne distingue pas.
   */
  function percer(el, r) {
    const mains = M().CARTE.mains;
    if (!mains) return;
    const local = (pts) => pts.map(([x, y]) =>
      [((x - r.l) / r.w * 100).toFixed(2), ((y - r.t) / r.h * 100).toFixed(2)]);
    const touche = (pts) => pts.some(([x, y]) =>
      x > r.l - 2 && x < r.l + r.w + 2 && y > r.t - 2 && y < r.t + r.h + 2);

    const trous = Object.values(mains).filter(touche).map(
      (pts) => "M" + local(pts).map((p) => p.join(" ")).join("L") + "Z");
    if (!trous.length) return;

    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' "
      + "preserveAspectRatio='none'><path fill='#fff' fill-rule='evenodd' "
      + "d='M0 0H100V100H0Z" + trous.join("") + "'/></svg>";
    const url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    el.style.webkitMaskImage = url; el.style.maskImage = url;
    el.style.webkitMaskSize = "100% 100%"; el.style.maskSize = "100% 100%";
    el.dataset.perce = "1";
  }

  /* Une dalle qui sert d'index de station ne doit pas etre reecrite par la
   * trame suivante : sinon l'index disparait une seconde apres le clic. */
  /* Poser une piece dans le plan de son instrument.
   *
   * La pente vient de `plans` : elle a ete mesuree sur l'axe du grand titre
   * peint du panneau, qui est la ligne de delimitation la plus franche qu'il
   * offre. Une piece sans plan reste d'aplomb — c'est le cas des bandeaux du
   * haut, qui le sont vraiment. */
  function poserPlan(el, r) {
    if (!r.plan) return;
    const plan = (M().CARTE.plans || {})[r.plan];
    if (!plan || !plan.pente) return;
    el.dataset.plan = r.plan;
    el.style.setProperty("--pente", plan.pente + "deg");
  }

  function libre(cle) {
    const el = document.getElementById("screen-" + cle);
    return !el || !el.classList.contains("station");
  }

  function rendre() {
    if (libre("main")) ecranPrincipal(snap);
    if (libre("autopilot")) ecranAutopilot(snap);
    if (libre("left-log")) ecranLog(snap);
    if (libre("minis")) ecranMinis();
    if (libre("feed")) ecranFeed();
    rendreChrome(snap);
  }

  const esc = (s) => D().esc(s);
  const usd = (v) => D().usd(v);
  const num = (v, d) => D().num(v, d);

  function rangee(k, v, cls) {
    return `<div class="rangee"><span class="mut">${esc(k)}</span>` +
           `<b class="${cls || ""}">${v}</b></div>`;
  }
  function barre(part, cls) {
    const p = Math.max(0, Math.min(100, part));
    return `<div class="barre"><i class="${cls || ""}" style="width:${p.toFixed(1)}%"></i></div>`;
  }

  /* ---------------------------------------------------------- 2.1 principal */

  function ecranPrincipal(s) {
    const c = ecrans.main; if (!c || !s) return;
    const a = s.account, m = s.mandate;
    const pnl = a && a.day_pnl_usd != null ? Number(a.day_pnl_usd) : null;
    const cls = pnl == null ? "mut" : (pnl >= 0 ? "pos" : "neg");
    const prix = Object.entries(s.last_prices || {}).slice(0, 4);

    // La courbe d'equite du backtest en cours, si la Soufflerie en a trace
    // une. Sinon la courbe de P&L des vols. Jamais un trace decoratif.
    const serie = (rech && rech.vols && rech.vols.courbe) || [];

    c.innerHTML =
      `<h4><span>DESK · ${esc(s.mode)}${s.testnet ? " · TESTNET" : ""}</span>` +
      `<b class="${cls}">PnL jour ${pnl == null ? "—" : usd(pnl)}</b></h4>` +
      `<div style="display:flex;gap:10px;align-items:baseline;margin-bottom:3px">` +
        prix.map(([k, v]) => `<span><span class="mut">${esc(k)}</span> ` +
          `<b class="cy">${usd(v)}</b></span>`).join("") +
      `</div>` +
      (a ? `<div style="display:flex;gap:9px;font-size:8.5px;margin-bottom:4px;` +
        `white-space:nowrap;overflow:hidden">` +
        `<span class="mut">éq <b class="cy">${usd(a.equity_usd)}</b></span>` +
        `<span class="mut">exp <b>${usd(a.gross_notional_usd)}</b></span>` +
        `<span class="mut">lev <b>${esc(a.effective_leverage)}×</b></span>` +
        `<span class="mut">pos <b>${a.positions.length}</b></span></div>` : "") +
      (serie.length > 1
        ? `<div style="height:52px;overflow:hidden">${
            D().courbeSVG([{ pts: serie, cls: "serie" }],
                          { zero: true, y: "pnl_usd", hauteur: 150 })}</div>`
        : `<div class="mut" style="padding:3px 0 5px;font-size:9px">` +
          `Aucun vol effectué — le desk s'arrête au portier du score.</div>`) +
      // La liste de verification, comme sur un vrai poste avant depart. Elle
      // remplit la dalle avec ce qui bloque reellement, pas avec un trace
      // decoratif : c'est le seul contenu qui vaut la place qu'il prend.
      (s.checks && s.checks.length
        ? `<div class="prevol">` + s.checks.map((k) =>
            `<div class="ck ${k.passed ? "ok" : "ko"}"><i></i>` +
            `<span>${esc(k.name || k.id || "")}</span></div>`).join("") + `</div>`
        : "") +
      // Le bas de la dalle : les canaux de collecte et le mandat. Elle est la
      // plus grande du poste — trois lignes flottant dans du noir gaspillent
      // la seule surface ou l'on peut vraiment lire.
      (s.feeds && s.feeds.length
        ? `<div class="prevol flux">` + s.feeds.slice(0, 8).map((f) => {
            const vieux = f.age_ms != null && f.max_age_ms && f.age_ms > f.max_age_ms;
            return `<div class="ck ${vieux ? "ko" : "ok"}"><i></i><span>` +
              `${esc(f.name || f.channel || "")}</span>` +
              `<b>${f.age_ms == null ? "—" : f.age_ms + " ms"}</b></div>`;
          }).join("") + `</div>`
        : "") +
      (m
        ? `<div class="pied">` +
          rangee("Mandat", `${esc(m.side || "—")} · ${esc(m.universe || "—")}`, "cy") +
          rangee("Reste", D().dur(m.remaining_ms), m.remaining_ms > 0 ? "" : "neg") +
          `</div>`
        : "") +
      (a && a.positions.length
        ? a.positions.slice(0, 3).map((p) =>
            rangee(`${p.asset} ${p.side}`,
              `${esc(p.size)} @ ${esc(p.entry_price)} · ${usd(p.unrealized_pnl_usd)}`,
              Number(p.unrealized_pnl_usd) >= 0 ? "pos" : "neg")).join("")
        : "");
  }

  /* ----------------------------------------------------------- 2.2 journal */

  function ecranFeed() {
    const c = ecrans.feed; if (!c) return;
    // On lit le DOM du panneau existant plutot que de refaire une requete :
    // c'est le meme journal, deja formate, deja limite a douze entrees.
    const src = document.getElementById("journal");
    const lignes = src ? Array.from(src.querySelectorAll(".jr")).slice(0, 14) : [];
    c.innerHTML =
      `<h4><span>JOURNAL</span><b>${lignes.length}</b></h4>` +
      (lignes.length
        ? lignes.map((l) => {
            const kind = l.querySelector(".kind");
            const ts = l.querySelector(".ts");
            return `<div class="rangee" style="font-size:9px">` +
              `<span style="color:var(--phos)">${esc(kind ? kind.textContent : "?")}</span>` +
              `<b class="mut">${esc(ts ? ts.textContent.split(" · ")[0] : "")}</b></div>`;
          }).join("")
        : `<div class="mut" style="font-size:9px;padding:6px 0">Journal vide.</div>`);
  }

  /* --------------------------------------------------------- 2.3 auto-pilot */

  function ecranAutopilot(s) {
    const c = ecrans.autopilot; if (!c || !s) return;
    const m = s.mandate;
    const vivant = m && !m.expired && m.bias !== "FLAT";
    const pct = m && m.ttl_ms ? Math.max(0, Math.min(100, 100 * m.remaining_ms / m.ttl_ms)) : 0;

    c.innerHTML =
      `<h4><span>MANDAT</span><b class="${vivant ? "pos" : "mut"}">` +
      `${vivant ? "VIVANT" : "AUCUN"}</b></h4>` +
      `<div class="gros ${m.bias === "SHORT" ? "neg" : m.bias === "LONG" ? "pos" : "mut"}">` +
      `${esc(m.bias)}</div>` +
      `<div class="mut" style="font-size:9px;margin-bottom:4px">${esc(m.regime)}</div>` +
      `<svg viewBox="0 0 100 100" style="width:100%;height:auto;max-height:74px" aria-hidden="true">` +
        `<circle cx="50" cy="50" r="46" fill="none" stroke="#1b2c31" stroke-width="1"/>` +
        `<circle cx="50" cy="50" r="31" fill="none" stroke="#1b2c31" stroke-width="1"/>` +
        `<circle cx="50" cy="50" r="16" fill="none" stroke="#1b2c31" stroke-width="1"/>` +
        `<line x1="4" y1="50" x2="96" y2="50" stroke="#1b2c31" stroke-width="1"/>` +
        `<line x1="50" y1="4" x2="50" y2="96" stroke="#1b2c31" stroke-width="1"/>` +
        (vivant ? `<line x1="50" y1="50" x2="50" y2="6" stroke="#e2a54a" stroke-width="1.5">` +
          `<animateTransform attributeName="transform" type="rotate" ` +
          `from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/></line>` : "") +
        (s.account ? s.account.positions.map((p, i) =>
          `<circle cx="${50 + Math.cos(i * 2.1) * 26}" cy="${50 + Math.sin(i * 2.1) * 26}" ` +
          `r="2.6" fill="#6fd39c"/>`).join("") : "") +
      `</svg>` +
      rangee("univers", esc((m.universe || []).join(" ") || "—")) +
      rangee("durée", D().dur(m.remaining_ms)) +
      barre(pct, "amb");
  }

  /* ------------------------------------------------------------ 2.4 état */

  function ecranLog(s) {
    const c = ecrans["left-log"]; if (!c || !s) return;
    const rates = (s.checks || []).filter((x) => !x.passed);
    const etat = s.halted ? "DESK ARRÊTÉ"
               : rates.length ? `${rates.length} INVARIANT${rates.length > 1 ? "S" : ""} EN DÉFAUT`
               : "DESK SAIN";
    const cls = s.halted ? "neg" : rates.length ? "amb" : "pos";

    c.innerHTML =
      `<h4><span class="${cls}">${etat}</span>` +
      `<b>${esc(s.mode)}</b></h4>` +
      (s.halted
        ? `<div class="neg" style="font-size:9px;margin-bottom:3px">` +
          `${esc(s.halt_reason || "MANUEL")} — ${esc(s.halt_detail || "")}</div>`
        : "") +
      (rates.length
        ? rates.slice(0, 5).map((x) =>
            `<div class="rangee" style="font-size:9px"><span class="amb">` +
            `${esc(x.id.slice(0, 3))}</span><b class="mut" style="text-align:right;` +
            `max-width:74%;overflow:hidden;text-overflow:ellipsis">${esc(x.detail)}</b></div>`
          ).join("")
        : `<div class="mut" style="font-size:9px">Les douze invariants sont satisfaits.</div>`) +
      (rech && rech.prevol
        ? `<div style="margin-top:3px;border-top:1px solid #16232a;padding-top:2px">` +
          rech.prevol.filter((l) => l.etat === "bloc").slice(0, 2).map((l) =>
            `<div class="rangee" style="font-size:9px"><span class="neg">BLOC</span>` +
            `<b class="mut" style="max-width:76%;overflow:hidden;text-overflow:ellipsis">` +
            `${esc(l.titre)}</b></div>`).join("") + `</div>`
        : "");
  }


  /* --------------------------------------------------------- 2.6 mini-charts */

  function ecranMinis() {
    const c = ecrans.minis; if (!c) return;
    const inv = rech && rech.strategies;
    const top = inv && inv.strategies ? inv.strategies.slice(0, 4) : [];
    c.innerHTML =
      `<h4><span>STRATÉGIES CONTRE HODL</span>` +
      `<b>${inv && inv.criblage ? inv.criblage.testees + " cellules" : "—"}</b></h4>` +
      (top.length
        ? top.map((st) => {
            const gagne = Number(st.net_median) >= 0;
            return `<div class="rangee" style="font-size:9px">` +
              `<span style="max-width:52%;overflow:hidden;text-overflow:ellipsis">` +
              `${esc(st.nom)}</span>` +
              `<b class="${gagne ? "pos" : "neg"}">${usd(st.net_median)}` +
              `<span class="mut"> p ${num(st.p_min, 3)}</span></b></div>`;
          }).join("")
        : `<div class="mut" style="font-size:9px">Aucune campagne lisible.</div>`);
  }





  /* ------------------------------------------------ etiquettes du chassis */

  const plaques = {};

  function batiChrome() {
    const { CARTE, fit, creer, poser } = M();
    const couche = creer("div", "chrome-layer", fit);
    for (const [cle, r] of Object.entries(CARTE.chrome || {})) {
      const el = creer("div", "plaque" + (r.ton === "amb" ? " amb" : ""), couche);
      el.id = "plaque-" + cle;
      poser(el, r);
      poserPlan(el, r);
      plaques[cle] = { el, span: creer("span", null, el), src: r.src };
    }
    batiGraves(couche);
  }

  /* Une etiquette coupee ne nomme plus rien : « Expositio » sous un chiffre
   * juste vaut moins que pas d'etiquette. Quand le mot deborde de sa plaque,
   * on le reduit. */
  function ajuster(boite, span) {
    span.style.transform = "none";
    if (boite.classList.contains("gauche")) return;   // celle-la passe a la ligne
    const dispo = boite.clientWidth - 4, large = span.scrollWidth;
    if (large > dispo && large > 0) {
      span.style.transform = "scale(" + Math.max(.5, dispo / large).toFixed(3) + ")";
    }
  }

  /* Les etiquettes gravees.
   *
   * Sous « CELLULES » la photo affichait un mot invente ; le logement, lui,
   * porte maintenant l'equite reelle. Un nom faux au-dessus d'un chiffre vrai
   * est pire qu'un decor entierement faux : on le croit.
   *
   * Une plaque sombre ferait un autocollant sur du metal clair. Chacune
   * prend donc la couleur exacte du metal qu'elle recouvre, relevee sur le
   * JPEG au montage — pas une teinte choisie a l'oeil. */
  function batiGraves(couche) {
    const { CARTE, creer, poser } = M();
    const graves = CARTE.graves || {};
    const cles = Object.keys(graves);
    if (!cles.length) return;

    const els = {};
    for (const cle of cles) {
      const r = graves[cle];
      const el = creer("div", "plaque grave" + (r.aligne === "gauche" ? " gauche" : "")
                       + (r.relief === "plaquette" ? " plaquette" : ""), couche);
      el.id = "grave-" + cle;
      poser(el, r);
      poserPlan(el, r);
      const sp = creer("span", null, el);
      if (r.texte) { sp.textContent = r.texte; ajuster(el, sp); }
      els[cle] = el;
      if (r.src) plaques[cle] = { el, span: sp, src: r.src };
    }

    for (const cle of cles) M().metal(els[cle], graves[cle]);
  }

  /* Les valeurs vivantes. Aucune n'est figee : c'est precisement ce que la
   * photo fait, et pourquoi il faut la recouvrir. */
  function valeurs(s) {
    const secteur = document.querySelector('#nav button[aria-selected="true"]');
    const nom = (id) => {
      const b = document.querySelector(`#nav button[data-sec="${id}"]`);
      return b ? b.childNodes[0].textContent.trim() : id;
    };
    const compte = (id) => {
      const n = document.getElementById("n-" + id);
      return n && !n.hidden ? ` ${n.textContent}` : "";
    };
    return {
      titre: "Poste de pilotage",
      titre2: "Desk · " + (s ? s.mode : "—"),
      desk: "Desk",
      mode: s ? s.mode : "—",
      actif: s ? "actif " + D().dur(s.uptime_s * 1000) : "—",
      sources: "sources de recherche",
      rail: "docs/ · baselines/ · scripts/",
      debit: s && s.feeds && s.feeds.length
        ? Math.min(...s.feeds.map((f) => f.age_ms == null ? 9e9 : f.age_ms)) + " ms"
        : "—",
      pied: "Aucun ordre",
      mandat: s && s.mandate ? "vivant" : "aucun",
      // Le placard de gauche portait un paragraphe de faux latin. Il porte
      // maintenant ce qui bloque reellement le decollage.
      prevol: s
        ? (s.blocking && s.blocking.length
            ? "Décollage bloqué — " + s.blocking.length + " invariant"
              + (s.blocking.length > 1 ? "s" : "") + " : " + s.blocking.join(", ")
            : "Les douze invariants sont satisfaits. Le portier du score n'a "
              + "laissé passer aucun setup : aucun mandat n'a été émis.")
        : "—",
      // Quatre plaques affichaient le meme mot. Chacune porte maintenant un
      // fait que sa voisine ne dit pas.
      invariants: s ? (s.checks || []).filter((c) => c.passed).length
                      + "/" + ((s.checks || []).length || 0) + " inv" : "—",
      journal: (() => {
        const n = document.querySelectorAll("#journal .jr").length;
        return n ? n + " déc" : "vide";
      })(),
      pnl: s && s.account && s.account.day_pnl_usd != null
        ? D().usd(s.account.day_pnl_usd) : "—",
      lien: s ? (s.ws_connected ? "lien" : "coupé") : "—",
      strategies: (() => {
        const n = document.querySelectorAll("#cbStrat option").length;
        return n ? n + " strat" : "strat";
      })(),
      "t-prevol": nom("prevol") + compte("prevol"),
      "t-telemetrie": nom("telemetrie") + compte("telemetrie"),
      "t-navigation": nom("navigation") + compte("navigation"),
      "t-conso": nom("consommation") + compte("consommation"),
      "t-vols": nom("vols") + compte("vols"),
      "t-systemes": nom("systemes") + compte("systemes"),
      _actif: secteur ? secteur.dataset.sec : null,
    };
  }

  function rendreChrome(s) {
    const v = valeurs(s);
    for (const [cle, p] of Object.entries(plaques)) {
      const texte = v[p.src];
      if (texte === undefined) continue;
      if (p.span.textContent !== texte) {
        p.span.textContent = texte;
        ajuster(p.el, p.span);
      }
      // L'onglet ouvert s'allume, comme sur un vrai panneau : c'est la seule
      // facon de savoir ou l'on est quand le tiroir est ferme.
      if (p.src.startsWith("t-")) {
        const id = { "t-prevol": "prevol", "t-telemetrie": "telemetrie",
                     "t-navigation": "navigation", "t-conso": "consommation",
                     "t-vols": "vols", "t-systemes": "systemes" }[p.src];
        p.el.classList.toggle("amb", id === v._actif);
      }
    }
  }

  /* ------------------------------------------------------------ orchestration */

  /* L'application entiere tient dans la dalle du milieu.
   *
   * On DEPLACE `#panneaux` dedans — on ne le recopie pas. Les identifiants
   * restent les memes, `desk.js` continue de l'alimenter sans savoir ou il
   * est affiche, et il n'existe toujours qu'une implementation de chaque
   * secteur. Le deplacement a lieu apres le montage : avant, la dalle
   * n'existe pas.
   */
  const LARGEUR_APP = 900;   // largeur de composition des panneaux, en px CSS

  function poserPanneaux() {
    const dalle = document.getElementById("screen-main");
    const pan = document.getElementById("panneaux");
    if (!dalle || !pan) return;
    if (pan.parentNode !== dalle) dalle.appendChild(pan);
    const calibrer = () => {
      const l = dalle.clientWidth;
      if (l) pan.style.setProperty("--k", (l / LARGEUR_APP).toFixed(5));
    };
    calibrer();
    if (window.ResizeObserver) new ResizeObserver(calibrer).observe(dalle);
    else addEventListener("resize", calibrer);
  }

  function monter() {
    for (const cle of Object.keys(M().CARTE.screens)) bati(cle);
    batiChrome();
    poserPanneaux();

    document.addEventListener("desk:snapshot", (e) => {
      snap = e.detail;
      rendre();
      if (window.CockpitInstruments)
        window.CockpitInstruments.rafraichir(snap, rech);
      if (window.CockpitBoutons) window.CockpitBoutons.rafraichir(snap);
    });
    document.addEventListener("desk:recherche", (e) => {
      rech = e.detail;
      rendre();
      if (window.CockpitInstruments)
        window.CockpitInstruments.rafraichir(snap, rech);
    });

    // Rattrapage : `desk.js` a pu emettre avant que ces ecouteurs existent —
    // il charge la recherche au chargement du document, alors que le cockpit
    // attend d'abord sa carte de coordonnees. Sans ce rattrapage, les deux
    // panneaux de recherche restaient noirs jusqu'a la relecture suivante,
    // soixante secondes plus tard.
    if (D().snapshot) snap = D().snapshot;
    if (D().recherche) rech = D().recherche;
    rendre();
    if (window.CockpitInstruments)
      window.CockpitInstruments.rafraichir(snap, rech);

    // Le secteur ouvert change par clic, pas par trame : on suit le tiroir.
    document.getElementById("nav").addEventListener("click",
      () => setTimeout(() => rendreChrome(snap), 0));

    // Le journal se recharge sur son propre rythme (10 s) : on le recopie
    // apres, sans le redemander.
    setInterval(() => { if (libre("feed")) ecranFeed(); }, 4000);
  }

  // `Cockpit.ecrans` est la COUCHE, pas la table des dalles : les stations
// ont besoin du corps de chaque dalle pour y ecrire leur index.
window.CockpitEcrans = { monter, rendre, corps: (cle) => ecrans[cle] };
})();
