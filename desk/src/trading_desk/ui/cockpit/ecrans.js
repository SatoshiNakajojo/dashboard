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
    const corps = creer("div", "corps", el);
    ecrans[cle] = corps;
    return corps;
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
    const a = s.account;
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
        : `<div class="mut" style="padding:6px 0;font-size:9px">` +
          `Aucun vol effectué — le desk s'arrête au portier du score.</div>`) +
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

  /* ---------------------------------------------------------- 2.5 scores */

  function ecranScores() {
    const c = ecrans.scores; if (!c) return;
    const q = rech && rech.consommation && rech.consommation.qualite;
    if (!q || !q.scores || !q.scores.length) {
      c.innerHTML = `<h4><span>DISTRIBUTION DES SCORES</span></h4>` +
        `<div class="mut" style="font-size:9px">Aucune campagne de qualité ` +
        `sur cette machine.</div>`;
      return;
    }
    const seuil = rech.consommation.seuil_conviction;
    const hmax = Math.max(...q.scores.map((b) => b.n));
    c.innerHTML =
      `<h4><span>DISTRIBUTION DES SCORES</span><b class="amb">seuil ${num(seuil)}</b></h4>` +
      q.scores.slice().reverse().map((b) => {
        const franchi = b.borne >= seuil;
        return `<div style="display:flex;gap:5px;align-items:center;font-size:9px">` +
          `<span class="mut" style="width:22px">${num(b.borne)}</span>` +
          `<span style="flex:1">${barre(100 * b.n / hmax, franchi ? "ok" : "amb")}</span>` +
          `<b style="width:16px;text-align:right">${b.n}</b></div>`;
      }).join("") +
      `<div class="rangee" style="margin-top:3px"><span class="mut">émis</span>` +
      `<b class="${q.emis ? "pos" : "neg"}">${q.emis} / ${q.rejetes + q.emis}</b></div>`;
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

  /* --------------------------------------------------------- 2.7 régime */

  function ecranRegime(s) {
    const c = ecrans.regime; if (!c || !s) return;
    const a = s.account;
    const cell = (k, v, cls) =>
      `<div style="flex:1;min-width:0"><span class="mut" style="font-size:7px;` +
      `letter-spacing:.1em;display:block">${esc(k)}</span>` +
      `<span class="gros ${cls || ""}" style="font-size:13px">${v}</span></div>`;
    c.innerHTML =
      `<h4><span>RÉGIME</span><b class="${s.is_real_money ? "neg" : "cy"}">` +
      `${esc(s.mode)}</b></h4>` +
      `<div style="display:flex;gap:6px">` +
        cell("équité", a ? usd(a.equity_usd) : "—") +
        cell("levier", a ? a.effective_leverage + "×" : "—") +
        cell("positions", a ? String(a.positions.length) : "—") +
        cell("mandats", String(s.limits.mandates_today),
             s.limits.mandates_today ? "pos" : "mut") +
      `</div>`;
  }

  /* ------------------------------------------------------- 2.8 déclencheurs */

  function ecranTriggers(s) {
    const c = ecrans.triggers; if (!c || !s) return;
    const checks = s.checks || [];
    c.innerHTML =
      `<h4><span>INVARIANTS</span><b class="${s.blocking.length ? "neg" : "pos"}">` +
      `${checks.length - s.blocking.length}/${checks.length}</b></h4>` +
      checks.slice(0, 7).map((x) =>
        `<div class="rangee" style="font-size:9px;align-items:center">` +
        `<span style="display:flex;gap:4px;align-items:center">` +
        `<i class="led ${x.passed ? "vert on" : "rouge on"}" ` +
        `style="position:static;width:5px;height:5px;flex:none"></i>` +
        `<span class="${x.passed ? "mut" : "neg"}">${esc(x.id.slice(0, 3))}</span>` +
        `</span>` +
        `<b class="mut" style="max-width:70%;overflow:hidden;text-overflow:ellipsis;` +
        `text-align:right">${esc(x.label)}</b></div>`).join("");
  }

  /* ---------------------------------------------------------- 2.9 amplitude */

  function ecranAmplitude(s) {
    const c = ecrans.amplitude; if (!c || !s) return;
    const a = s.account, lim = s.limits;
    const expo = a ? Number(a.gross_notional_usd) : 0;
    const plafond = Number(lim.max_gross_notional_usd) || 1;
    const lev = a ? Number(a.effective_leverage) : 0;
    const levMax = Number(lim.max_effective_leverage) || 1;

    // Aiguille : demi-cercle de 180°, l'angle suit la part du plafond. La
    // base peinte reste visible sous la dalle, seule l'aiguille bouge.
    const aiguille = (part, cls) => {
      const ang = -90 + Math.max(0, Math.min(1, part)) * 180;
      return `<svg viewBox="0 0 100 56" style="width:100%;max-height:44px" aria-hidden="true">` +
        `<path d="M6 52 A44 44 0 0 1 94 52" fill="none" stroke="#1b2c31" stroke-width="2"/>` +
        `<line x1="50" y1="52" x2="50" y2="12" stroke="currentColor" stroke-width="2"` +
        ` class="${cls}" style="transform:rotate(${ang.toFixed(1)}deg);` +
        `transform-origin:50px 52px;transition:transform 200ms linear"/>` +
        `<circle cx="50" cy="52" r="3" fill="#22343a"/></svg>`;
    };

    const temoin = (ok) =>
      `<i class="led ${ok ? "vert on" : "rouge on"}" ` +
      `style="position:static;width:5px;height:5px;display:inline-block;` +
      `margin-right:4px;vertical-align:1px"></i>`;

    c.innerHTML =
      `<h4><span>${temoin(expo <= plafond)}EXPOSITION</span>` +
      `<b class="cy">${usd(expo)}</b></h4>` +
      `<div style="color:var(--cyan)">${aiguille(expo / plafond, "")}</div>` +
      rangee("plafond", usd(plafond)) +
      `<h4 style="margin-top:6px"><span>${temoin(lev <= levMax)}LEVIER</span>` +
      `<b class="${lev > levMax ? "neg" : "cy"}">${num(lev)}×</b></h4>` +
      `<div style="color:${lev > levMax ? "var(--red)" : "var(--cyan)"}">` +
      `${aiguille(lev / levMax, "")}</div>` +
      rangee("plafond", levMax + "×");
  }

  /* ------------------------------------------------------------- 2.10 flux */

  function ecranFlux(s) {
    const c = ecrans.flux; if (!c || !s) return;
    const b = s.budget;
    c.innerHTML =
      `<h4><span>FLUX DE DONNÉES</span>` +
      `<b class="${s.ws_connected ? "pos" : "neg"}">` +
      `${s.ws_connected ? "CONNECTÉ" : "COUPÉ"}</b></h4>` +
      (s.feeds || []).slice(0, 6).map((f) => {
        const age = f.age_ms == null ? null : f.age_ms;
        const part = age == null ? 100 : Math.min(100, 100 * age / f.max_age_ms);
        const cls = f.status !== "LIVE" ? "red" : part > 60 ? "amb" : "ok";
        return `<div style="margin-bottom:2px"><div class="rangee" ` +
          `style="border:0;font-size:9px;padding:0">` +
          `<span class="mut" style="max-width:56%;overflow:hidden;` +
          `text-overflow:ellipsis">${esc(f.name)}</span>` +
          `<b class="${cls === "red" ? "neg" : "mut"}">` +
          `${age == null ? esc(f.status) : age + " ms"}</b></div>` +
          barre(100 - part, cls) + `</div>`;
      }).join("") +
      `<h4 style="margin-top:5px"><span>BUDGET DE REQUÊTES</span>` +
      `<b class="${b.critical ? "neg" : "mut"}">${b.ip_used}/${b.ip_limit}</b></h4>` +
      barre(b.ip_pct, b.ip_pct > 85 ? "red" : b.ip_pct > 60 ? "amb" : "ok");
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
      plaques[cle] = { el, src: r.src };
    }
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
      if (p.el.textContent !== texte) p.el.textContent = texte;
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

  function monter() {
    for (const cle of Object.keys(M().CARTE.screens)) bati(cle);
    batiChrome();

    document.addEventListener("desk:snapshot", (e) => {
      snap = e.detail;
      ecranPrincipal(snap); ecranAutopilot(snap); ecranLog(snap);
      ecranRegime(snap); ecranTriggers(snap); ecranAmplitude(snap);
      ecranFlux(snap); ecranFeed(); rendreChrome(snap);
      if (window.CockpitBoutons) window.CockpitBoutons.rafraichir(snap);
    });
    document.addEventListener("desk:recherche", (e) => {
      rech = e.detail;
      ecranScores(); ecranMinis(); ecranPrincipal(snap); ecranLog(snap);
    });

    // Rattrapage : `desk.js` a pu emettre avant que ces ecouteurs existent —
    // il charge la recherche au chargement du document, alors que le cockpit
    // attend d'abord sa carte de coordonnees. Sans ce rattrapage, les deux
    // panneaux de recherche restaient noirs jusqu'a la relecture suivante,
    // soixante secondes plus tard.
    if (D().snapshot) {
      snap = D().snapshot;
      ecranPrincipal(snap); ecranAutopilot(snap); ecranLog(snap);
      ecranRegime(snap); ecranTriggers(snap); ecranAmplitude(snap);
      ecranFlux(snap);
    }
    if (D().recherche) { rech = D().recherche; ecranScores(); ecranMinis(); }
    ecranFeed(); rendreChrome(snap);

    // Le secteur ouvert change par clic, pas par trame : on suit le tiroir.
    document.getElementById("nav").addEventListener("click",
      () => setTimeout(() => rendreChrome(snap), 0));

    // Le journal se recharge sur son propre rythme (10 s) : on le recopie
    // apres, sans le redemander.
    setInterval(ecranFeed, 4000);
  }

  window.CockpitEcrans = { monter };
})();
