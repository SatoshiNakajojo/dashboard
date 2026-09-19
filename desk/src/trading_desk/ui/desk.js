"use strict";

// L'interface ne calcule aucune regle metier : elle affiche ce que le moteur
// de risque a deja tranche. Un ecran qui reinterprete les regles finit par
// diverger du systeme qu'il est cense surveiller.

const $ = (id) => document.getElementById(id);
let snap = null, offline = false;

/* ---------- theme ---------- */
const root = document.documentElement;
try {
  const saved = localStorage.getItem("desk-theme");
  if (saved) root.setAttribute("data-theme", saved);
} catch (e) { /* stockage indisponible : le theme systeme s'applique */ }
$("theme").addEventListener("click", () => {
  const dark = root.getAttribute("data-theme") === "dark"
    || (!root.hasAttribute("data-theme")
        && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("desk-theme", next); } catch (e) { /* ignore */ }
});

/* ---------- formatage ---------- */
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
function usd(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? nf.format(n) + " $" : String(v);
}
function dur(ms) {
  if (ms === null || ms === undefined) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return s + " s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min " + String(s % 60).padStart(2, "0") + " s";
  const h = Math.floor(m / 60);
  return h + " h " + String(m % 60).padStart(2, "0");
}
function clock(ms) {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour12: false });
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- kill switch : deux temps ---------- */
// Un bouton qui coupe un desk ne doit pas partir sur un clic accidentel, mais
// il ne doit pas non plus imposer une boite de dialogue : en situation reelle,
// on veut deux clics rapides au meme endroit.
/* Le libelle d'un invariant, pour que le motif se lise sans decoder un
   identifiant. On prend celui que l'instantane porte deja ; a defaut, on
   retombe sur l'identifiant, qui vaut toujours mieux que rien. */
function nomLisible(id) {
  const c = (snap && snap.checks || []).find((x) => x.id === id);
  return (c && c.label) ? c.label : id;
}

let armed = false, armTimer = null;
const killBtn = $("kill");

killBtn.addEventListener("click", async () => {
  if (snap && snap.halted) {
    // NE JAMAIS ANNONCER UN REARMEMENT QU'ON N'A PAS OBTENU.
    //
    // `/api/arm` rend la liste des invariants encore en defaut. L'ancienne
    // version l'ignorait et affichait « Desk réarmé » dans tous les cas ;
    // l'evaluation suivante rearretait le desk une seconde plus tard, avec
    // le meme motif qu'avant. Vu de l'ecran, le bouton ne faisait rien, et
    // rien ne disait pourquoi.
    const r = await post("/api/arm");
    const bloquants = (r && r.blocking) || [];
    if (bloquants.length) {
      flash("Réarmement sans effet — toujours en défaut : "
            + bloquants.map(nomLisible).join(", "));
    } else {
      flash("Desk réarmé.");
    }
    return;
  }
  if (!armed) {
    armed = true;
    killBtn.classList.add("confirm");
    killBtn.textContent = "Confirmer l'arrêt";
    $("killNote").textContent = "second clic pour confirmer · annulation dans 5 s";
    clearTimeout(armTimer);
    armTimer = setTimeout(resetKill, 5000);
    return;
  }
  clearTimeout(armTimer);
  resetKill();
  await post("/api/halt", { reason: "MANUAL", detail: "arrêt manuel depuis l'interface" });
  flash("Arrêt demandé.");
});

function resetKill() {
  armed = false;
  killBtn.classList.remove("confirm");
  if (!(snap && snap.halted)) {
    killBtn.textContent = "Tout arrêter";
    $("killNote").textContent = "arrête le desk et passe en FLAT";
  }
}

async function post(path, body) {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return await r.json();
  } catch (e) {
    flash("Échec : backend injoignable.");
    return null;
  }
}

function flash(msg) { $("killNote").textContent = msg; }

/* Le son des boutons, quand ces panneaux sont dans le decor.
 *
 * On ne joue rien ici : ces fichiers vivent avec le poste, et les recopier
 * dans les panneaux ferait deux exemplaires du meme son a tenir a jour. On
 * publie un message, le poste sonne. Hors decor, personne n'ecoute — et
 * c'est voulu : la vue sans decor est une vue de lecture, pas un cockpit.
 */
function sonnerLeClic() {
  if (window.parent === window) return;
  try { window.parent.postMessage({ desk: "clic" }, location.origin); }
  catch (e) { /* cadre d'une autre origine : rien a faire */ }
}

document.addEventListener("click", (ev) => {
  const cible = ev.target.closest(
    "button, .nav button, .link-btn, a.link-btn");
  if (cible) sonnerLeClic();
}, true);

/* ---------- rendu ---------- */
function render(s) {
  snap = s;
  // Un habillage se greffe ici plutot que de redemander l'etat. Un second
  // consommateur qui interrogerait `/api/snapshot` de son cote doublerait la
  // charge et, pire, afficherait un instant different de celui des panneaux :
  // deux ecrans du meme desk qui ne racontent pas la meme seconde.
  document.dispatchEvent(new CustomEvent("desk:snapshot", { detail: s }));

  $("mode").textContent = s.mode + (s.testnet ? " · testnet" : "");
  $("mode").className = "pill mode-" + s.mode;
  $("uptime").textContent = "actif " + dur(s.uptime_s * 1000);
  $("dot").className = "dot " + (s.ws_connected ? "on" : "off");
  /* LA VERSION, ET SURTOUT SON ABSENCE.
   *
   * Cette page est relue sur le disque à chaque requête ; le processus
   * Python, lui, a chargé son code une fois pour toutes au démarrage. Après
   * un `git pull`, l'écran est donc à jour alors que le desk ne l'est pas —
   * et il n'y a aucun moyen de s'en apercevoir depuis l'écran.
   *
   * Ça a coûté plusieurs allers-retours de dépannage sur un défaut déjà
   * corrigé. Une pastille à « — » ne dit rien à personne : quand
   * l'instantané ne porte pas de version, c'est que le desk tourne du code
   * ANTÉRIEUR à cette page, et il faut le dire en toutes lettres.
   */
  if (s.version) {
    $("version").textContent = s.version;
    // Un arbre modifié n'est pas une erreur, mais il faut le voir : c'est la
    // différence entre « la correction ne marche pas » et « ce n'est pas la
    // correction qui tourne ».
    $("version").style.color = /\+modifie/.test(s.version) ? "var(--warn)" : "";
    $("perime").hidden = true;
  } else {
    $("version").textContent = "ancien";
    $("version").style.color = "var(--crit)";
    $("perime").hidden = false;
  }

  /* --- banniere --- */
  const banner = $("banner");
  const failed = s.checks.filter((c) => !c.passed);
  banner.classList.remove("bad", "warn");
  if (s.halted) {
    banner.classList.add("bad");
    $("state").textContent = "Desk arrêté";
    $("why").innerHTML = "<b>" + esc(s.halt_reason || "MANUAL") + "</b> — "
      + esc(s.halt_detail || "arrêt manuel") + "<br>Rien ne sera envoyé tant que le desk n'est pas réarmé à la main.";
    killBtn.className = "kill arm";
    killBtn.textContent = "Réarmer le desk";
    $("killNote").textContent = "vérifie les invariants juste après";
  } else if (failed.length) {
    banner.classList.add("warn");
    $("state").textContent = failed.length + " invariant" + (failed.length > 1 ? "s" : "") + " en défaut";
    $("why").innerHTML = failed.map((c) => "<b>" + esc(c.id.slice(0, 3)) + "</b> "
      + esc(c.label) + " — " + esc(c.detail)).join("<br>");
    if (!armed) { killBtn.className = "kill"; killBtn.textContent = "Tout arrêter"; }
  } else {
    $("state").textContent = "Desk sain";
    $("why").textContent = "Les douze invariants sont satisfaits. "
      + (s.mode === "SHADOW"
        ? "Mode SHADOW : les mandats sont journalisés, aucun ordre n'est émis."
        : "Mode " + s.mode + ".");
    if (!armed) { killBtn.className = "kill"; killBtn.textContent = "Tout arrêter"; }
  }

  /* --- le signal branché --- */
  rendreSignal(s.signal, s.mode);

  /* --- tuiles --- */
  const a = s.account;
  const pnl = a && a.day_pnl_usd !== null && a.day_pnl_usd !== undefined ? Number(a.day_pnl_usd) : null;
  const tiles = [
    { k: "Équité", v: a ? usd(a.equity_usd) : "—",
      s: a ? "marge libre " + usd(a.available_margin_usd) : "compte non reconcilié" },
    { k: "Réconciliation",
      v: d.reconciliation ? (d.reconciliation.convergee ? "convergée" : "JAMAIS")
                          : "—",
      c: d.reconciliation && !d.reconciliation.convergee ? "crit" : "",
      /* « Soldes frais » et « réconciliation convergée » sont deux choses
         différentes, et les confondre a laissé I01 passer au vert pendant des
         semaines sur un desk qui n'avait jamais cherché ses positions
         orphelines. Le détail est affiché parce que « convergée » seul ne dit
         pas ce qui a été trouvé ni corrigé. */
      s: d.reconciliation ? d.reconciliation.detail : "état inconnu" },
    { k: "PnL du jour", v: pnl === null ? "—" : usd(pnl),
      cls: pnl === null ? "dim" : (pnl >= 0 ? "pos" : "neg"),
      s: "limite " + s.limits.max_daily_loss_pct + " % de l'équité" },
    { k: "Exposition", v: a ? usd(a.gross_notional_usd) : "—",
      s: "plafond " + usd(s.limits.max_gross_notional_usd) },
    { k: "Levier effectif", v: a ? a.effective_leverage + "×" : "—",
      s: "plafond " + s.limits.max_effective_leverage + "×" },
    { k: "Positions", v: a ? String(a.positions.length) : "—",
      s: a && a.positions.some((p) => !p.protected) ? "⚠ une position sans stop" : "toutes protégées" },
    { k: "Mandats aujourd'hui", v: String(s.limits.mandates_today),
      s: "quota " + s.limits.max_mandates_per_day },
  ];
  $("tiles").innerHTML = tiles.map((t) =>
    '<div class="tile"><span class="k">' + esc(t.k) + '</span>'
    + '<div class="v ' + (t.cls || "") + '">' + esc(t.v) + "</div>"
    + '<div class="s">' + esc(t.s) + "</div></div>").join("");

  /* --- invariants --- */
  $("invCount").textContent = (s.checks.length - failed.length) + "/" + s.checks.length;
  $("invCount").style.color = failed.length ? "var(--crit)" : "var(--ok)";
  $("inv").innerHTML = s.checks.map((c) =>
    '<div class="inv ' + (c.passed ? "ok" : "ko") + '">'
    + '<span class="mark">' + (c.passed ? "✓" : "✗") + "</span><div>"
    + '<span class="id">' + esc(c.id.slice(0, 3)) + "</span> "
    + '<span class="lbl">' + esc(c.label) + "</span>"
    + '<div class="det">' + esc(c.detail || "—") + "</div></div></div>").join("");

  /* --- mandat --- */
  const m = s.mandate;
  const pct = m.ttl_ms ? Math.max(0, Math.min(100, 100 * m.remaining_ms / m.ttl_ms)) : 0;
  $("mandate").innerHTML =
    '<div class="head"><span class="bias ' + esc(m.bias) + '">' + esc(m.bias) + "</span>"
    + '<span class="pill">' + esc(m.regime) + "</span>"
    + (m.expired ? '<span class="pill" style="background:var(--crit-soft);color:var(--crit);border-color:transparent">EXPIRÉ</span>' : "")
    + "</div>"
    + '<dl class="kv">'
    + "<dt>Univers</dt><dd>" + (m.universe.length ? esc(m.universe.join(" · ")) : "—") + "</dd>"
    + "<dt>Notionnel</dt><dd>" + usd(m.max_notional_usd) + "</dd>"
    + "<dt>Levier max</dt><dd>" + esc(m.max_leverage) + "×</dd>"
    + "<dt>Positions</dt><dd>" + esc(m.max_positions) + "</dd>"
    + "<dt>Conviction</dt><dd>" + esc(m.conviction) + "</dd>"
    + "<dt>Journal</dt><dd>" + esc(m.journal_ref || "—") + "</dd>"
    + "</dl>"
    + '<div class="ttl"><div class="lbl"><span>Durée de vie</span><span>'
    + dur(m.remaining_ms) + " restantes</span></div>"
    + '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div></div>';

  /* --- flux --- */
  const stale = s.feeds.filter((f) => f.status !== "LIVE").length;
  $("feedCount").textContent = (s.feeds.length - stale) + "/" + s.feeds.length + " vivants";
  $("feedCount").style.color = stale ? "var(--crit)" : "var(--ok)";
  $("feeds").innerHTML = s.feeds.length ? s.feeds.map((f) => {
    const age = f.age_ms === null || f.age_ms === undefined ? null : f.age_ms;
    const ratio = age === null ? 1 : Math.min(1, age / f.max_age_ms);
    const cls = f.status !== "LIVE" ? "bad" : (ratio > 0.6 ? "warn" : "");
    return '<div class="feed"><div class="top"><span class="nm">' + esc(f.name) + "</span>"
      + '<span class="ag">' + (age === null ? f.status : age + " ms")
      + " · " + f.messages + " msg" + (f.reconnects ? " · " + f.reconnects + " reco" : "") + "</span></div>"
      + '<div class="track"><div class="fill ' + cls + '" style="width:'
      + (100 * (1 - ratio)).toFixed(0) + '%"></div></div>'
      + (f.last_error ? '<div class="err">' + esc(f.last_error) + "</div>" : "") + "</div>";
  }).join("") : '<div class="empty">Aucun flux déclaré.</div>';

  /* --- budget --- */
  const b = s.budget;
  $("budget").innerHTML =
    '<div class="feed"><div class="top"><span class="nm">Poids IP / minute</span>'
    + '<span class="ag">' + b.ip_used + " / " + b.ip_limit + "</span></div>"
    + '<div class="track"><div class="fill ' + (b.ip_pct > 85 ? "bad" : b.ip_pct > 60 ? "warn" : "")
    + '" style="width:' + Math.min(100, b.ip_pct).toFixed(0) + '%"></div></div></div>'
    + '<div class="feed"><div class="top"><span class="nm">Réserve par adresse</span>'
    + '<span class="ag">' + b.reserve_left + " req · " + b.reserve_pct + " %</span></div>"
    + '<div class="track"><div class="fill ' + (b.reserve_pct < 10 ? "bad" : b.reserve_pct < 30 ? "warn" : "")
    + '" style="width:' + Math.min(100, b.reserve_pct).toFixed(0) + '%"></div></div>'
    + '<div class="err" style="color:var(--muted)">Indexée sur le volume tradé — s\'épuise si on interroge l\'API en boucle.</div></div>';

  /* --- positions --- */
  $("pos").innerHTML = (a && a.positions.length)
    ? "<table><thead><tr><th>Actif</th><th>Sens</th><th>Taille</th><th>Entrée</th>"
      + "<th>Mark</th><th>Notionnel</th><th>PnL</th><th>Stop</th></tr></thead><tbody>"
      + a.positions.map((p) =>
        "<tr><td class='name'>" + esc(p.asset) + parts(p.parts) + "</td>"
        + "<td>" + esc(p.side) + "</td>"
        + "<td>" + esc(p.size) + "</td><td>" + esc(p.entry_price) + "</td>"
        + "<td>" + esc(p.mark_price) + "</td><td>" + usd(p.notional_usd) + "</td>"
        + "<td style='color:" + (Number(p.unrealized_pnl_usd) >= 0 ? "var(--ok)" : "var(--crit)") + "'>"
        + usd(p.unrealized_pnl_usd) + "</td>"
        + "<td><span class='tag " + (p.protected ? "ok'>protégée" : "ko'>SANS STOP") + "</span></td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucune position ouverte.</div>';

  /* --- prix --- */
  const px = Object.entries(s.last_prices || {});
  $("prices").innerHTML = px.length
    ? "<table><thead><tr><th>Actif</th><th>Dernier prix</th></tr></thead><tbody>"
      + px.map(([k, v]) => "<tr><td class='name'>" + esc(k) + "</td><td>" + usd(v) + "</td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucun trade reçu pour l\'instant.</div>';
}

/* ---------- journal (moins frequent : il bouge lentement) ---------- */
async function loadJournal() {
  try {
    const r = await fetch("/api/journal?limit=12");
    const rows = await r.json();
    $("journal").innerHTML = rows.length ? rows.map((j) =>
      '<div class="jr"><div class="l1"><span class="kind">' + esc(j.kind) + "</span>"
      + '<span class="ts">' + clock(j.ts_ms) + " · " + esc(j.journal_ref) + "</span></div>"
      + "<pre>" + esc(JSON.stringify(j.payload, null, 1)) + "</pre></div>").join("")
      : '<div class="empty">Journal vide.</div>';
  } catch (e) { /* le flux principal signale deja la panne */ }
}

/* ======================================================================== */
/*  POSTE DE PILOTAGE — les panneaux de recherche                           */
/* ======================================================================== */
/* Deux rythmes, deliberement separes. Les instruments de vol viennent du
   flux SSE, une fois par seconde : ils changent. Les panneaux de recherche
   lisent des fichiers sur disque et ne changent qu'apres une campagne — les
   redemander chaque seconde ferait de la supervision la principale charge
   de la machine, sur des chiffres identiques. */

const SECTEURS = [
  ["prevol",       "Pré-vol"],
  ["telemetrie",   "Télémétrie"],
  ["navigation",   "Navigation"],
  ["soufflerie",   "Soufflerie"],
  ["atelier",      "Atelier"],
  ["fabrique",     "Fabrique"],
  ["consommation", "Consommation"],
  ["vols",         "Vols"],
  ["systemes",     "Systèmes"],
];

let rech = null;
let secteur = "prevol";

$("nav").innerHTML = SECTEURS.map(([id, nom]) =>
  '<button type="button" role="tab" data-sec="' + id + '" aria-selected="false">'
  + esc(nom) + '<span class="n" id="n-' + id + '" hidden></span></button>').join("");

$("nav").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-sec]");
  if (b) montrer(b.dataset.sec);
});

function montrer(id) {
  secteur = id;
  for (const [s] of SECTEURS) {
    const sec = $("sec-" + s);
    if (sec) sec.hidden = s !== id;
  }
  for (const b of $("nav").querySelectorAll("button")) {
    b.setAttribute("aria-selected", String(b.dataset.sec === id));
  }
  try { localStorage.setItem("desk-secteur", id); } catch (e) { /* ignore */ }
  if (id === "soufflerie") tracerCourbe();
}

/* ---------- petits utilitaires d'affichage ---------- */
function octets(n) {
  if (!n) return "0 o";
  const u = ["o", "ko", "Mo", "Go", "To"];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(1) : String(v)) + " " + u[i];
}
// `usd` arrondit au centime, ce qui affiche « 0 $ » pour un appel a
// 0,0009 $ — un cout qui semble gratuit finit par ne plus etre surveille.
function usdFin(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n !== 0 && Math.abs(n) < 0.01) return n.toFixed(4) + " $";
  return nf.format(n) + " $";
}
function pct(v, d) { return v === null || v === undefined ? "—" : Number(v).toFixed(d === undefined ? 1 : d) + " %"; }
function num(v, d) { return v === null || v === undefined ? "—" : Number(v).toFixed(d === undefined ? 2 : d); }

// Un vide qui ne s'explique pas finit par etre lu comme « tout va bien ».
function rien(titre, texte, commande) {
  return '<div class="rien"><span class="gros">' + esc(titre) + "</span><p>"
    + texte + (commande ? '<br><br><code>' + esc(commande) + "</code>" : "")
    + "</p></div>";
}

/* ---------- chargement ---------- */
async function chargerRecherche() {
  try {
    const r = await fetch("/api/recherche");
    if (!r.ok) throw new Error(r.status);
    rech = await r.json();
    rendreRecherche(rech);
  } catch (e) {
    $("check").innerHTML = rien("Panneaux indisponibles",
      "Le serveur n'a pas répondu. Les instruments de vol au-dessus restent "
      + "alimentés par le flux ; seuls les panneaux de recherche sont muets.");
  }
}

function rendreRecherche(d) {
  document.dispatchEvent(new CustomEvent("desk:recherche", { detail: d }));

  rendrePrevol(d.prevol);
  rendreTelemetrie(d.telemetrie);
  rendreNavigation(d.navigation);
  rendreCampagnes(d.campagnes);
  rendreInventaire(d.strategies);
  rendreAtelier(d.atelier);
  rendreReglesFigees(d.regles_figees);
  rendreConsommation(d.consommation);
  rendreVols(d.vols);
  rendreGlissement(d.glissement);
  rendrePoussee((d.vols || {}).poussee);
  rendreSaisons(d.saisons);
  rendreGenerateur(d.generateur);
  rendreTesteur(d.testeur);
  rendreBiblio(d.bibliotheque);
  preparerSelecteurs(d.strategies);
}

/* ---------- PRÉ-VOL ---------- */
function rendrePrevol(lignes) {
  lignes = lignes || [];
  const blocs = lignes.filter((l) => l.etat === "bloc");
  const attentes = lignes.filter((l) => l.etat === "attente");
  const ok = lignes.length - blocs.length - attentes.length;

  $("checkCount").textContent = ok + "/" + lignes.length;
  $("checkCount").style.color = blocs.length ? "var(--crit)" : attentes.length ? "var(--warn)" : "var(--ok)";
  marquer("prevol", blocs.length ? blocs.length : attentes.length,
          blocs.length ? "bad" : attentes.length ? "warn" : "ok");

  // Le verdict dit ce que la liste veut dire, en une phrase. Sans lui, sept
  // lignes de statut laissent le lecteur faire la synthese lui-meme — et un
  // tableau de bord dont il faut faire la synthese ne sert a rien.
  const v = $("verdict");
  if (blocs.length) {
    v.className = "verdict bloc";
    v.innerHTML = '<span class="gros">Décollage impossible</span>'
      + blocs.length + " blocage" + (blocs.length > 1 ? "s" : "")
      + (attentes.length ? " et " + attentes.length + " attente" + (attentes.length > 1 ? "s" : "") : "")
      + ". Un blocage demande une décision, pas de la patience. "
      + "Le premier : <b>" + esc(blocs[0].detail) + "</b>";
  } else if (attentes.length) {
    v.className = "verdict";
    v.innerHTML = '<span class="gros">En attente</span>'
      + "Rien ne bloque, mais " + attentes.length + " vérification"
      + (attentes.length > 1 ? "s se résolvent" : " se résout")
      + " avec du temps ou une campagne à relancer.";
  } else {
    v.className = "verdict";
    v.innerHTML = '<span class="gros">Prêt</span>Toutes les vérifications passent.';
  }

  $("check").innerHTML = lignes.length ? lignes.map((l) =>
    '<div class="check ' + esc(l.etat) + '"><span class="led"></span>'
    + "<div style='flex:1;min-width:0'><div class='t'>" + esc(l.titre) + "</div>"
    + "<div class='d'>" + esc(l.detail) + "</div></div>"
    + '<span class="src">' + esc(l.panneau) + "</span></div>").join("")
    : '<div class="empty">Aucune vérification.</div>';
}

function marquer(id, n, cls) {
  const el = $("n-" + id);
  if (!el) return;
  el.hidden = !n;
  el.textContent = n;
  el.className = "n " + (cls || "");
}

/* ---------- TÉLÉMÉTRIE ---------- */
function rendreTelemetrie(t) {
  t = t || {};
  if (!t.disponible) {
    $("telBadge").textContent = "ailleurs";
    $("telemetrie").innerHTML = rien("Collecte hors de cette machine",
      esc(t.raison || "racine non configurée")
      + ".<br><br>Ce n'est pas une panne : l'enregistreur tourne sous systemd "
      + "sur le VPS, et cette interface s'exécute ailleurs. Pour l'y brancher, "
      + "pointer la racine des Parquet.",
      "DESK_ENREGISTREUR_RACINE=/var/lib/desk");
    return;
  }
  const froid = t.silence_s !== null && t.silence_s > 3600;
  $("telBadge").textContent = t.fichiers + " fichiers · " + octets(t.octets);
  $("telBadge").style.color = froid ? "var(--warn)" : "var(--ok)";
  marquer("telemetrie", t.actifs.length, froid ? "warn" : "ok");

  const entete = froid
    ? '<p class="avert">Dernière écriture il y a ' + dur(t.silence_s * 1000)
      + ". Un enregistreur silencieux plus d'une heure n'enregistre plus.</p>"
    : "";

  $("telemetrie").innerHTML = entete + '<div class="jauges">'
    + t.actifs.map((a) => {
      const manquants = t.flux_attendus.filter(
        (f) => !a.flux.some((x) => x.flux === f));
      return '<div class="jauge"><div class="a">' + esc(a.actif) + "</div>"
        + a.flux.map((f) =>
          '<div class="f"><span>' + esc(f.flux) + "</span><b>" + f.fichiers
          + " fich · " + octets(f.octets)
          + (f.partiels ? " · " + f.partiels + " partiel" : "") + "</b></div>").join("")
        + (manquants.length
          ? '<div class="f" style="color:var(--crit)"><span>manquant</span><b style="color:var(--crit)">'
            + esc(manquants.join(" ")) + "</b></div>"
          : "")
        + "</div>";
    }).join("") + "</div>";
}

/* ---------- NAVIGATION ---------- */
/* Géométrie de la courbe « quand est-ce qu'on saura ? ». La marge droite
   porte les étiquettes des deux seuils, qui sont le sujet du graphe : les
   poser dans l'aire de tracé les ferait croiser la courbe. */
const JN = { W: 1000, H: 250, GAUCHE: 46, DROITE: 212, HAUT: 16, BAS: 38 };

function jnTicks(max) {
  /* Des paliers ronds, jamais plus de six : un axe qui compte de 10 en 10
     jusqu'à 210 rend vingt-deux graduations illisibles. */
  const pas = max <= 60 ? 20 : max <= 150 ? 50 : 100;
  const out = [];
  for (let v = 0; v <= max; v += pas) out.push(v);
  return out;
}

/* Un mois « AAAA-MM » en rang absolu. L'AXE EST TEMPOREL, PAS INDEXÉ.
   Espacer les points à intervalle constant donnait la même largeur au saut
   de dix-neuf mois entre novembre 2028 et mars 2030 qu'à un mois ordinaire :
   la courbe semblait alors monter régulièrement jusqu'en 2030, alors qu'elle
   est plate pendant un an et demi. Sur un graphe dont toute la question est
   « quand est-ce qu'on saura », déformer le temps est le seul mensonge qui
   compte. */
function jnMois(m) {
  const [a, b] = String(m).split("-").map(Number);
  return a * 12 + (b - 1);
}

/* La courbe cumulée des fenêtres closes, et les deux seuils qui décident.
   C'est la seule image qui réponde à la question que pose un journal hors
   échantillon : quand est-ce qu'on saura ? Le cumul monte, les seuils sont
   horizontaux, l'intersection se lit.

   Deux traits gris, un seul en couleur : ce qui est CLOS est un fait, le
   reste est une promesse de calendrier — un déblocage lointain peut être
   repoussé, et rien ne garantit que la courbe grise se réalise. */
function grapheJournal(n) {
  const serie = n.calendrier_cumule || [];
  if (serie.length < 2) return "";
  const { W, H, GAUCHE, DROITE, HAUT, BAS } = JN;
  const x0 = GAUCHE, x1 = W - DROITE, y0 = H - BAS, y1 = HAUT;
  const s50 = n.seuil_conclusion || 0, s80 = n.seuil_confortable || 0;
  /* L'échelle monte jusqu'au seuil le plus haut MÊME s'il est hors
     d'atteinte : c'est précisément l'information. Le tronquer au maximum du
     calendrier ferait disparaître le fait que 210 positions n'existent pas. */
  const max = Math.max(serie[serie.length - 1].cumul, s80, 1) * 1.08;
  const m0 = jnMois(serie[0].mois), m1 = jnMois(serie[serie.length - 1].mois);
  const etendue = Math.max(1, m1 - m0);
  const xs = (m) => x0 + ((x1 - x0) * (jnMois(m) - m0)) / etendue;
  const ys = (v) => y0 - ((y0 - y1) * v) / max;

  let clos = 0;
  const pointsClos = [];
  serie.forEach((m) => {
    if (m.closes) { clos += m.closes; pointsClos.push([xs(m.mois), ys(clos)]); }
  });

  const ligne = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1)
    + " " + p[1].toFixed(1)).join(" ");
  const tous = serie.map((m) => [xs(m.mois), ys(m.cumul)]);
  const aire = ligne(tous) + " L" + x1.toFixed(1) + " " + y0 + " L" + x0 + " " + y0 + " Z";

  const ticks = jnTicks(Math.ceil(max)).map((v) =>
    '<line class="grille" x1="' + x0 + '" y1="' + ys(v) + '" x2="' + x1
    + '" y2="' + ys(v) + '"/><text class="tick" x="' + (x0 - 8) + '" y="'
    + (ys(v) + 4) + '" text-anchor="end">' + v + "</text>").join("");

  /* Les graduations de temps sont calculées sur l'ÉTENDUE, pas sur les mois
     présents : janvier 2029 n'a aucun déblocage, et sans lui l'axe s'arrête
     visuellement en 2028 alors que la courbe va jusqu'en 2030. */
  let mois = "";
  for (let m = Math.ceil(m0 / 12) * 12; m <= m1; m += 12) {
    const libelle = Math.floor(m / 12);
    mois += '<text class="tick" x="' + xs(libelle + "-01") + '" y="' + (y0 + 18)
      + '" text-anchor="middle">' + libelle + "</text>";
  }

  const seuil = (v, titre, sous, atteignable) =>
    '<line class="seuil' + (atteignable ? "" : " hors") + '" x1="' + x0
    + '" y1="' + ys(v) + '" x2="' + (x1 + 8) + '" y2="' + ys(v) + '"/>'
    + '<text class="sn" x="' + (x1 + 14) + '" y="' + (ys(v) - 2) + '">'
    + v + " · " + titre + "</text>"
    + '<text class="ss" x="' + (x1 + 14) + '" y="' + (ys(v) + 12) + '">'
    + sous + "</text>";

  const atteint80 = serie[serie.length - 1].cumul >= s80;
  return '<svg class="jng" viewBox="0 0 ' + W + " " + H + '" role="img" '
    + 'aria-label="Cumul des fenêtres closes et seuils de conclusion">'
    + ticks + mois
    + '<path class="promesse" d="' + aire + '"/>'
    + '<path class="trace" d="' + ligne(tous) + '"/>'
    + (pointsClos.length ? '<path class="fait" d="' + ligne(pointsClos) + '"/>' : "")
    + '<line class="axe" x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '"/>'
    + seuil(s50, "une chance sur deux", "de trancher", true)
    + seuil(s80, "quatre sur cinq", atteint80 ? "de trancher"
        : "hors d’atteinte", atteint80)
    + "</svg>"
    + '<div class="coupe-cle"><span class="k-promesse"><i></i>inscrit, pas encore '
    + 'clos — une promesse du calendrier</span><span class="k-fait"><i></i>'
    + "fenêtres closes — des faits</span></div>";
}

function rendreNavigation(n) {
  n = n || {};
  if (!n.disponible) {
    $("navBadge").textContent = "absent";
    $("navigation").innerHTML = rien("Journal absent de cette machine",
      esc(n.raison || ""), n.commande);
    return;
  }
  $("navBadge").textContent = n.inscrites + " inscrites · " + n.closes + " closes";
  marquer("navigation", n.ouvertes, "ok");

  const a = n.attendu || {};
  const reste = Math.max(0, n.seuil_conclusion - n.closes);
  /* CE QUE LA RÈGLE DOIT BATTRE N'EST PAS ZÉRO, et c'est la première phrase
     du bandeau parce que c'est le seul endroit où l'écran peut mentir sans
     qu'on s'en aperçoive : vendre un altcoin au hasard six jours, couvert en
     BTC, rapportait déjà +123,5 bps sur la période historique. Une moyenne de
     journal affichée seule se lirait comme un résultat. */
  const barre = '<div class="verdict"><span class="gros">'
    + n.closes + " / " + n.seuil_conclusion + " fenêtres closes</span>"
    + "Le repère n’est pas zéro : la même position prise à des "
    + "<b>dates tirées au hasard</b> rapportait " + (a.hasard_bps || 0).toFixed(0)
    + " bps. C’est cet écart-là — <b>+" + (a.exces_bps || 0).toFixed(0)
    + " bps</b> en échantillon — que le journal doit reproduire."
    + (reste
      ? "<br><br>Le relevé <b>refuse de conclure</b> sous " + n.seuil_conclusion
        + " fenêtres closes"
        + (n.closes ? " ; il en manque " + reste : "")
        + ". Avec un écart-type de " + (a.ecart_type_bps || 0).toFixed(0)
        + " bps par position, conclure plus tôt reviendrait à lire du bruit."
        + (n.prochaine_fermeture ? " Prochaine fermeture le <b>"
          + esc(n.prochaine_fermeture) + "</b>." : "")
      : "<br><br>Le seuil est atteint : le verdict est calculable.")
    + '<br><br><code style="font-family:var(--f-mono);font-size:11px">'
    + esc(n.resolution) + "</code>"
    + '<div class="jn-proto">protocole figé <b>' + esc(n.protocole || "?")
    + "</b> · mesure primaire : net de " + esc(n.positions.length
      ? n.positions[0].reference || "BTC" : "BTC") + "</div></div>";

  $("navigation").innerHTML = barre + grapheJournal(n)
    + '<div class="tscroll jn-table"><table><thead><tr>'
    + "<th>Jeton</th><th>Sens</th><th>Part offre</th><th>Déblocage</th>"
    + "<th>Entrée</th><th>Sortie</th><th>Préavis</th><th>État</th></tr></thead><tbody>"
    + n.positions.map((p) =>
      "<tr><td class='name'>" + esc(p.symbole) + "</td><td>" + esc(p.sens) + "</td>"
      + "<td>" + pct(p.part_offre * 100) + "</td><td>" + esc(p.deblocage) + "</td>"
      + "<td>" + esc(p.entree) + "</td><td>" + esc(p.sortie) + "</td>"
      + "<td>" + (p.horizon_j == null ? "—" : p.horizon_j + " j") + "</td>"
      + "<td><span class='tag'>" + esc(p.etat) + "</span></td></tr>").join("")
    + "</tbody></table></div>";
}

/* ---------- SOUFFLERIE ---------- */
function rendreCampagnes(cs) {
  cs = cs || [];
  const vivantes = cs.filter((c) => c.disponible);
  const tradables = vivantes.filter((c) => c.tradable);
  const survivants = tradables.reduce((a, c) => a + (c.nb_survivants || 0), 0);
  $("campBadge").textContent = vivantes.length + "/" + cs.length + " lisibles";
  marquer("soufflerie", survivants, survivants ? "ok" : "");

  $("campagnes").innerHTML = cs.map((c) => {
    if (!c.disponible) {
      return '<div class="carte"><h3>' + esc(c.titre)
        + '<span class="q ' + esc(c.question) + '">' + esc(c.question) + "</span></h3>"
        + '<p class="quoi">' + esc(c.quoi) + "</p>"
        + '<div class="res doute">Artefact absent : ' + esc(c.raison || "") + "</div>"
        + '<div class="cmd">' + esc(c.commande) + "</div></div>";
    }
    // Une campagne dont le criblage est trop peu resolu, ou muette sur ses
    // tirages, n'a pas le droit au meme fond qu'une conclusion solide.
    const cls = c.aveugle ? "aveugle"
      : (c.tirages === null || c.tirages === undefined || (c.cellules_minimum || 1) > 1) ? "doute"
      : "solide";
    return '<div class="carte"><h3>' + esc(c.titre)
      + '<span class="q ' + esc(c.question) + '">' + esc(c.question) + "</span></h3>"
      + '<p class="quoi">' + esc(c.quoi) + "</p>"
      + '<div class="chiffres">'
      + chiffre("cellules", c.testees)
      + chiffre("p &lt; 0,05", c.bruts)
      + chiffre("attendues", num(c.attendues, 1))
      + chiffre("survivantes", c.nb_survivants,
                c.nb_survivants ? "var(--ok)" : "var(--muted)")
      + "</div>"
      /* Une campagne réfutée par un contrôle affiche zéro survivant — mais
         un zéro nu se lit « rien trouvé » alors qu'il faut lire « quelque
         chose a été trouvé PUIS réfuté, et voici par quoi ». */
      + (c.refute_par_controle
        ? '<div class="res doute"><b>Réfutée par un contrôle.</b> '
          + esc(c.raison_refutation || "") + "</div>"
        : "")
      + '<div class="res ' + cls + '">' + esc(c.resolution || "") + "</div>"
      + (c.nb_survivants
        ? '<div class="cmd">' + c.survivants.slice(0, 4).map((x) =>
            esc([x.strategie || x.declencheur, x.actif, x.intervalle,
                 x.horizon_libelle].filter(Boolean).join(" ")) + " p " + num(x.p || x.p_amplitude || x.p_direction, 4)
          ).join("<br>") + "</div>"
        : "")
      + "</div>";
  }).join("");
}

function rendreSignal(sig, mode) {
  const el = $("signal");
  el.hidden = false;
  if (!sig) {
    el.className = "signal aucun";
    el.innerHTML = "<span class='quoi'>aucune règle branchée</span>"
      + "<span class='regle'>mode " + esc(mode || "—") + "</span>"
      + "<span class='note'>Le desk ne peut ouvrir aucune position : c'est la "
      + "cause directe des zéros du reste de l'écran, et pas une panne. "
      + "Le signal se branche en mode PAPER ou TESTNET.</span>";
    return;
  }
  const pct = (x) => (x === null || x === undefined ? "—" : (x * 100).toFixed(0) + " %");
  el.className = "signal";
  el.innerHTML = "<span class='quoi'>règle branchée</span>"
    + "<span class='regle'>" + esc(sig.nom) + " · " + esc(sig.fenetre)
    + " · déblocage de " + pct(sig.part_min) + " à " + pct(sig.part_max)
    + " de l'offre · " + esc(String(sig.duree_j)) + " j de détention"
    + " · stop " + pct(sig.stop_pct) + "</span>"
    + "<span class='note'>Le seul edge directionnel mesuré du dépôt, et la "
    + "seule chose ici qui puisse faire passer un ordre. Elle ne trade que "
    + "ce que <code>" + esc(sig.journal) + "</code> contient déjà : une "
    + "position calculée à la volée ne serait pas hors échantillon."
    + (sig.stop_valide === false
      ? " Le stop, lui, <b>n'est pas une composante validée</b> de l'edge — "
        + "c'est un garde-fou opérationnel, et il rend le résultat live "
        + "légèrement différent du backtest."
      : "")
    + "</span>";
}

function chiffre(k, v, couleur) {
  return "<div><span class='k'>" + k + "</span><span class='v'"
    + (couleur ? " style='color:" + couleur + "'" : "") + ">"
    + (v === null || v === undefined ? "—" : esc(v)) + "</span></div>";
}

/* À qui appartient une position nettée.

   L'exchange nette : deux sources sur le même actif n'ont qu'une position. Un
   écran qui afficherait « BTC 10 unités » sans dire à qui elles appartiennent
   cacherait exactement l'information qui permet de savoir ce qu'une sortie va
   fermer — et c'est ce silence qui a permis au défaut de vivre.

   Rien n'est affiché quand il n'y a qu'un propriétaire : sur un desk
   mono-source, la mention serait du bruit sur chaque ligne. */
function parts(p) {
  const noms = Object.keys(p || {});
  if (noms.length < 2) return "";
  return "<div class='sousnom'>" + noms.map((n) =>
    esc(n) + " " + esc(p[n])).join(" · ") + "</div>";
}

function celluleOuTiret(v, rendu) {
  return (v === null || v === undefined)
    ? "<td class='sansobjet' title='sans objet pour une règle événementielle'>—</td>"
    : rendu(v);
}

/* La part du capital qu'une position prend vraiment.

   Elle n'apparaissait nulle part, et ce n'est pas un oubli d'affichage :
   **c'est le réglage de personne**. Elle tombe du quotient `risque par trade
   / distance au stop`, entre deux valeurs choisies pour d'autres raisons —
   0,5 % parce que c'est une prudence classique, 15 % parce que les jetons
   concernés bougent de plus de 5 % par jour.

   Un nombre que personne n'a posé et que personne ne relit est la forme la
   plus courante d'un réglage qui dérive. Celui-ci vaut 7,5 fois moins que la
   taille sur laquelle la règle a été validée, et la mesure du glissement dit
   qu'aucune contrainte de marché ne s'y oppose. */
function ligneDimensionnement(d) {
  if (!d) return "";
  const ecart = d.facteur && d.facteur > 1.1;
  return "<div class='sousnom regle'"
    + (ecart ? " style='color:var(--crit)'" : "") + ">taille de position "
    + d.fraction_deployee_pct.toFixed(1) + " % du capital"
    + (ecart
      ? " contre " + d.fraction_cible_pct.toFixed(0) + " % à la validation — "
        + "soit " + d.facteur.toFixed(1) + "× moins. Personne n'a choisi ce "
        + "chiffre : c'est " + d.risque_par_trade_actuel_pct + " % de risque "
        + "par trade divisé par un stop de " + d.stop_pct.toFixed(0) + " %. "
        + "Pour viser " + d.fraction_cible_pct.toFixed(0) + " %, régler le "
        + "risque par trade à " + d.risque_par_trade_requis_pct + " %"
        + (d.plafonds_bloquants && d.plafonds_bloquants.length
          ? " — mais " + esc(d.plafonds_bloquants.join(", ")) + " mordrait."
          : " ; aucun plafond ne mord à cette taille.")
      : "")
    + "</div>";
}

function ligneDeployee(s) {
  const r = s.regle || {};
  const pct = (x) => (x === null || x === undefined ? "—" : (x * 100).toFixed(0) + " %");
  return "<tr class='deployee'><td class='name'>" + esc(s.nom)
    + " <span class='tag live'>branchée sur le desk</span>"
    + "<div class='sousnom'>" + esc(s.resume || "") + "</div>"
    + "<div class='sousnom regle'>fenêtre " + esc(r.fenetre || "—")
    + " · déblocage de " + pct(r.part_min) + " à " + pct(r.part_max)
    + " de l'offre · " + esc(String(r.duree_j ?? "—")) + " jours de détention</div>"
    + ligneDimensionnement(s.dimensionnement)
    + (s.jamais_testee
      ? "<div class='sousnom manque'>" + esc(s.raison || "artefact absent")
        + "<br><code>" + esc(s.commande || "") + "</code></div>"
      : "")
    + "</td>"
    + "<td>" + (s.jamais_testee
      ? "<span class='tag ko'>non validée ici</span>"
      : s.cellules + " tests poolés") + "</td>"
    + "<td class='sansobjet' title='sans objet'>—</td>"
    + "<td class='sansobjet' title='se mesure en bps par événement'>—</td>"
    + "<td>" + num(s.p_min, 4) + "</td>"
    + "<td class='sansobjet' title='sans objet'>—</td>"
    + "<td><span class='tag " + (s.survit_bh ? "ok'>" + s.survivants_fenetre_deployee
        + "/" + s.survivants + " sur sa fenêtre" : "ko'>non") + "</span></td></tr>";
}

function rendreInventaire(inv) {
  inv = inv || {};
  const lignes = inv.strategies || [];
  $("inventaire").innerHTML = lignes.length
    ? "<table><thead><tr><th>Stratégie</th><th>Cellules</th><th>Gagnantes</th>"
      + "<th>Net médian</th><th>p min</th><th>Pires que hasard</th><th>BH</th>"
      + "</tr></thead><tbody>"
      + lignes.map((s) => s.deployee ? ligneDeployee(s) :
        "<tr><td class='name'>" + esc(s.nom)
        + "<div class='sousnom'>"
        + esc(s.resume || "") + "</div></td>"
        + "<td>" + (s.jamais_testee ? "<span class='tag ko'>jamais testée</span>" : s.cellules) + "</td>"
        + celluleOuTiret(s.gagnantes, (v) => "<td>" + v + "</td>")
        + celluleOuTiret(s.net_median, (v) =>
          "<td style='color:" + (Number(v) >= 0 ? "var(--ok)" : "var(--crit)") + "'>"
          + usd(v) + "</td>")
        + "<td>" + num(s.p_min, 4) + "</td>"
        + celluleOuTiret(s.pires_que_hasard, (v) =>
          "<td" + (v ? " style='color:var(--crit)'" : "") + ">" + v + "</td>")
        + "<td><span class='tag " + (s.survit_bh ? "ok'>survit" : "ko'>non") + "</span></td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucune stratégie.</div>';
}

/* ---------- GLISSEMENT RÉEL ---------- */
function rendreGlissement(g) {
  g = g || {};
  const lots = g.lots || [];
  $("glBadge").textContent = g.disponible
    ? g.mesures + " fill(s) mesuré(s)"
    : "aucune exécution";
  $("glBadge").style.color = g.disponible ? "var(--ok)" : "var(--muted)";

  if (!g.disponible) {
    $("glissement").innerHTML = '<div class="empty">' + esc(g.raison || "")
      + "<br>Le modèle suppose " + num(g.suppose_bps, 1) + " bps par côté, soit "
      + num(g.aller_retour_suppose_bps, 1) + " bps l'aller-retour.</div>";
    return;
  }

  const v = g.verdict;
  $("glissement").innerHTML =
    "<table><thead><tr><th>Style demandé</th><th>Fills</th><th>Médiane</th>"
    + "<th>Moyenne</th><th>9ᵉ décile</th><th>Pire</th>"
    + "<th>Améliorations</th></tr></thead><tbody>"
    + lots.map((l) =>
      "<tr><td class='name'>" + esc(l.nom) + "</td><td>" + l.n + "</td>"
      /* La médiane avant la moyenne : un seul fill traversant un carnet
         mince déplace une moyenne de plusieurs bps. */
      /* Positif = coût. Le signe porte le sens, il ne se devine pas. */
      + "<td style='color:" + (l.mediane > 0 ? "var(--crit)" : "var(--ok)") + "'>"
      + num(l.mediane, 2) + " bps</td>"
      + "<td>" + num(l.moyenne, 2) + "</td><td>" + num(l.d9, 2) + "</td>"
      + "<td>" + num(l.pire, 2) + "</td><td>" + l.ameliorations + "</td></tr>").join("")
    + "</tbody></table>"
    + (v
      ? '<div class="verdict' + (v.optimiste ? " bloc" : "") + '"><span class="gros">'
        + "Agressif mesuré " + num(v.mesure_bps, 2) + " bps contre "
        + num(v.suppose_bps, 1) + " supposés</span>"
        + (v.optimiste
          ? "Le modèle est OPTIMISTE de " + num(v.ecart_bps, 2) + " bps par côté : "
            + "tout ce qui a été validé avec lui est flatté d'autant. "
            + "C'est le sens qui inquiète."
          : "Le modèle est conservateur de " + num(-v.ecart_bps, 2)
            + " bps par côté. Les résultats validés avec lui sont donc "
            + "prudents, ce qui est le bon sens de l'erreur.")
        + "</div>"
      : "");
}

/* ---------- RÈGLES DE PRIX FIGÉES ---------- */
function rendreReglesFigees(rf) {
  rf = rf || {};
  const rs = rf.regles || [];
  $("rfBadge").textContent = (rf.inscrits || 0) + " signal(aux) · "
    + "dénominateur " + (rf.denominateur ?? "—");
  $("rfBadge").style.color = rf.disponible ? "var(--ok)" : "var(--muted)";

  $("reglesFigees").innerHTML =
    '<div class="chiffres">'
    + chiffre("version", rf.version)
    + chiffre("figé le", rf.fige_le)
    + chiffre("empreinte", rf.empreinte)
    + chiffre("seuil BH au rang 1", num(rf.seuil_bh_rang1, 5))
    + "</div>"
    + (rf.disponible ? "" :
      '<div class="res doute">' + esc(rf.raison || "")
      + '<div class="cmd">' + esc(rf.commande || "") + "</div></div>")
    + (rs.length
      ? "<table><thead><tr><th>Règle</th><th>Paramètres</th><th>Refus risque</th>"
        + "<th>Signaux</th><th>Ce qu'elle peut prouver</th></tr></thead><tbody>"
        + rs.map((r) =>
          "<tr><td class='name'>" + esc(r.cle)
          + "<div class='sousnom'>" + esc(r.mecanisme || "") + "</div></td>"
          + "<td class='params'>" + esc(Object.entries(r.parametres || {})
              .map(([k, v]) => k + "=" + v).join(" ")) + "</td>"
          /* Au-delà de quelques pour cent, la règle qui tourne n'est plus
             celle qui a été mesurée. C'est ce qui a écarté tsmom. */
          + "<td style='color:" + (r.refus_mesure > 0.10 ? "var(--warn)" : "var(--ok)")
          + "'>" + pct(r.refus_mesure) + "</td>"
          + "<td>" + r.signaux + "</td>"
          + "<td class='sousnom'>" + esc(r.puissance || "") + "</td></tr>").join("")
        + "</tbody></table>"
      : "");
}

/* ---------- ATELIER ---------- */
/* Le formulaire vient du CATALOGUE, jamais d'une liste écrite ici : ajouter
   une stratégie au code doit la faire apparaître sans toucher à cette page,
   et un formulaire incomplet ressemble à un formulaire complet. */
let atCat = null;
let atChoix = { strategie: null, actifs: new Set(), intervalles: new Set(), params: {} };

function cases(id, valeurs, choisis, onToggle) {
  $(id).innerHTML = valeurs.map((v) =>
    '<label class="case' + (choisis.has(v) ? " on" : "") + '">'
    + '<input type="checkbox" data-v="' + esc(v) + '"' + (choisis.has(v) ? " checked" : "")
    + '>' + esc(v) + "</label>").join("");
  $(id).onclick = (ev) => {
    const b = ev.target.closest("input[type=checkbox]");
    if (!b) return;
    onToggle(b.dataset.v, b.checked);
  };
}

function atIntervallesCommuns() {
  /* Un intervalle n'est proposé que s'il existe pour TOUS les tickers cochés.
     En proposer un qui manque à l'un d'eux produirait un balayage dont les
     cellules absentes ne se verraient nulle part — et un dénominateur qu'on
     croit connaître. */
  const d = (atCat && atCat.donnees) || {};
  const actifs = [...atChoix.actifs];
  if (!actifs.length) return [];
  return actifs.map((a) => d[a] || [])
    .reduce((acc, cur) => acc.filter((x) => cur.includes(x)));
}

function rendreFormulaireAtelier(cat) {
  const premier = !atCat;
  atCat = cat;
  const noms = Object.keys(cat.strategies || {});
  if (premier) {
    atChoix.strategie = noms[0] || null;
    // BTC par défaut, comme partout ailleurs dans cette page : c'est l'actif
    // sur lequel toutes les campagnes du dépôt ont été lues. Le premier par
    // ordre alphabétique serait APE, dont personne n'a la référence en tête.
    const dispos = Object.keys(cat.donnees || {});
    atChoix.actifs = new Set(dispos.includes("BTC") ? ["BTC"] : dispos.slice(0, 1));
  }
  $("atStrat").innerHTML = noms.map((n) =>
    '<option value="' + esc(n) + '"' + (n === atChoix.strategie ? " selected" : "")
    + ">" + esc(n) + "</option>").join("");

  cases("atActifs", Object.keys(cat.donnees || {}), atChoix.actifs, (v, on) => {
    if (on) atChoix.actifs.add(v); else atChoix.actifs.delete(v);
    rendreCiblesAtelier();
  });
  rendreCiblesAtelier();
  rendreParamsAtelier();
}

function rendreCiblesAtelier() {
  const communs = atIntervallesCommuns();
  for (const i of [...atChoix.intervalles]) if (!communs.includes(i)) atChoix.intervalles.delete(i);
  // 1d par défaut : c'est l'échelle des campagnes du dépôt, et la moins
  // coûteuse à essayer. Le premier de la liste serait 15m, dont un balayage
  // occupe la machine sans que personne l'ait demandé.
  if (!atChoix.intervalles.size && communs.length) {
    atChoix.intervalles.add(communs.includes("1d") ? "1d" : communs[0]);
  }
  cases("atIntervalles", communs, atChoix.intervalles, (v, on) => {
    if (on) atChoix.intervalles.add(v); else atChoix.intervalles.delete(v);
    rendreCiblesAtelier();
  });
  const n = atChoix.actifs.size * atChoix.intervalles.size;
  $("atBadge").textContent = n + " cellule" + (n > 1 ? "s" : "") + " à essayer";
  $("atBadge").style.color = n > 6 ? "var(--crit)" : "var(--muted)";
}

function rendreParamsAtelier() {
  const s = (atCat.strategies || {})[atChoix.strategie];
  if (!s) { $("atParams").innerHTML = ""; return; }
  atChoix.params = {};
  $("atParams").innerHTML = "<label>Paramètres</label>" + Object.entries(s.parametres).map(
    ([nom, b]) => '<span class="param"><span class="pn">' + esc(nom) + "</span>"
      + '<input type="number" data-p="' + esc(nom) + '" value="' + b.defaut
      + '" min="' + b.min + '" max="' + b.max + '" step="' + (b.entier ? 1 : 0.1)
      + '" title="' + esc(nom + " — défaut " + b.defaut + ", de " + b.min + " à " + b.max) + '"></span>'
  ).join("");
  $("atParams").oninput = (ev) => {
    const i = ev.target.closest("input[data-p]");
    if (i) atChoix.params[i.dataset.p] = Number(i.value);
  };
}

/* Les sept épreuves : le badge d'une ligne, avec son motif en infobulle.

   Trois états et non deux, parce que « l'épreuve n'a pas pu s'exécuter » n'est
   ni une réussite ni un échec. Confondre le premier cas avec une réussite est
   la façon exacte dont un contrôle devient inerte — et le dépôt s'est déjà
   fait avoir une fois, par un nul par bloc dont chaque tirage recouvrait
   l'observation. */
/* La note du scorer. Deux informations en un badge : la note sur dix, et si
   les PORTES sont franchies.

   Les portes décident, la note classe. Une stratégie à 9/10 qui ne bat pas
   l'achat-conservation n'est pas une bonne stratégie mal classée : c'est une
   façon compliquée de faire moins bien que ne rien faire. Le badge est donc
   rouge dans ce cas, quelle que soit la note affichée à côté. */
function badgeNote(n) {
  if (!n) return "<span class='tag'>—</span>";
  const classe = n.deployable ? "ok" : "ko";
  return "<span class='tag " + classe + "' title='" + esc(n.resume || "") + "'>"
    + Number(n.note_sur_10).toFixed(1) + "/10</span>";
}

function badgeEpreuve(v, resume) {
  if (!v) return "<span class='tag'>—</span>";
  const classe = v.etat === "RETENUE" ? "ok"
    : (v.etat === "INCOMPLETE" ? "incomplet" : "ko");
  const texte = v.etat === "RETENUE" ? "retenue"
    : (v.etat === "INCOMPLETE" ? "incomplète" : "refusée");
  return "<span class='tag " + classe + "' title='" + esc(resume || "") + "'>"
    + texte + "</span>";
}

/* Le compte des verdicts, et surtout QUELLE épreuve tue le plus souvent.

   Ce second chiffre est le plus utile des deux : si le même motif revient sur
   la moitié du registre, il décrit le générateur de candidates et non le
   marché. Quinze combinaisons refusées pour trop peu d'aller-retours disent
   que la grille de paramètres produit des stratégies trop lentes pour
   l'échelle choisie — ce qui se corrige, contrairement à une absence d'edge. */
function rendreEpreuves(e, origines, sc) {
  if (!e) return "";
  const MOTIFS = {
    plancher: "p au plancher de l'instrument",
    trades: "trop peu d'aller-retours",
    refus: "refus du moteur de risque",
    retrait: "le résultat tient à un mois",
    denominateur: "ne survit pas au dénominateur",
    bloc: "nul par bloc",
    rang: "corrélation portée par des extrêmes",
  };
  const motifs = Object.entries(e.motifs || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => "<li><b>" + n + "</b> · " + esc(MOTIFS[k] || k) + "</li>")
    .join("");
  /* Le dénominateur affiché est celui qui DÉCIDE : le nombre de familles,
     pas celui de combinaisons. Dix réglages du même parent sur les mêmes
     barres posent une question, pas dix — et c'est alpha/familles qui fixe
     le seuil au rang 1. Les combinaisons restent entre parenthèses : les
     cacher ferait disparaître l'ampleur de la recherche de réglages. */
  const parOrigine = (origines || []).length > 1
    ? "<div class='sansobjet' style='margin-top:8px'>Dénominateur par origine : "
      + origines.map((o) => esc(o.origine) + " " + (o.familles != null ? o.familles : o.combinaisons)
          + " famille(s)"
          + (o.familles != null && o.familles !== o.combinaisons
              ? " sur " + o.combinaisons + " combinaisons" : ""))
        .join(" · ")
      + "</div>"
    : "";
  return '<div class="chiffres" style="margin-top:10px">'
    + chiffre("retenues", e.retenues, e.retenues ? "var(--ok)" : "var(--crit)")
    + chiffre("incomplètes", e.incompletes, e.incompletes ? "var(--warn)" : undefined)
    + chiffre("refusées", e.refusees)
    + "</div>"
    + (sc && sc.notees
        ? "<div class='sansobjet' style='margin-top:6px'>Scorer : "
          + "<b>" + sc.deployables + "</b> déployable(s) sur " + sc.notees
          + " notée(s)"
          + (sc.recalees_buy_hold
             ? " · <b>" + sc.recalees_buy_hold + "</b> recalée(s) parce "
               + "qu'elles ne battent pas l'achat-conservation"
             : "")
          + "</div>"
        : "")
    + (motifs ? "<div class='sansobjet' style='margin-top:6px'>Ce qui les tue :"
        + "<ul style='margin:4px 0 0 16px'>" + motifs + "</ul></div>" : "")
    + parOrigine;
}

function rendreAtelier(a) {
  a = a || {};
  if (a.catalogue) rendreFormulaireAtelier(a.catalogue);

  const c = a.criblage || {};
  if (!a.disponible) {
    $("atVerdictBadge").textContent = "aucun essai";
    $("atVerdictBadge").style.color = "var(--muted)";
    $("atVerdict").innerHTML = '<div class="empty">' + esc(a.raison || "")
      + (a.commande ? "<br><code>" + esc(a.commande) + "</code>" : "") + "</div>";
    $("atClassement").innerHTML = '<div class="empty">Rien au registre.</div>';
    $("atStrategies").innerHTML = "";
    return;
  }

  $("atVerdictBadge").textContent = a.combinaisons + " combinaison(s)"
    + (a.familles != null && a.familles !== a.combinaisons
        ? " · " + a.familles + " famille(s)" : "")
    + (a.repetitions ? " · " + a.repetitions + " relance(s)" : "");
  $("atVerdictBadge").style.color = c.nb_survivants ? "var(--ok)" : "var(--muted)";

  /* Les trois chiffres, et le troisième décide. Le deuxième est celui qu'on
     oublie : combien de cellules on ATTENDAIT à p < 0,05 sans aucun signal. */
  $("atVerdict").innerHTML = '<div class="chiffres">'
    + chiffre("Combinaisons testées", c.testees)
    + chiffre("p &lt; 0,05 brut", c.bruts)
    + chiffre("attendues par hasard", c.attendues === undefined ? "—" : Number(c.attendues).toFixed(1))
    + chiffre("survivantes après BH", c.nb_survivants,
              c.nb_survivants ? "var(--ok)" : "var(--crit)")
    + chiffre("plancher de p", c.plancher === undefined ? "—" : Number(c.plancher).toFixed(6))
    + chiffre("seuil BH au rang 1", c.seuil_rang1 === undefined ? "—" : Number(c.seuil_rang1).toFixed(6))
    + "</div>"
    + '<div class="verdict' + (c.nb_survivants ? "" : " bloc") + '"><span class="gros">'
    + (c.nb_survivants
      ? c.nb_survivants + " combinaison(s) survivent à la correction"
      : "Aucune combinaison ne survit à la correction")
    + "</span>"
    + (c.nb_survivants
      ? "Un survivant ici reste dans l'échantillon : il vaut candidature à un "
        + "test hors échantillon, jamais conclusion."
      : "Les " + (c.bruts || 0) + " cellule(s) à p < 0,05 sont compatibles avec le "
        + "bruit de " + (c.testees || 0) + " tests simultanés.")
    + (c.resolution ? " " + esc(c.resolution) : "")
    + "</div>"
    + rendreEpreuves(a.epreuves, a.par_origine, a.scorer);

  const l = a.classement || [];
  $("atClassement").innerHTML = l.length
    ? "<table><thead><tr><th>Stratégie</th><th>Ticker</th><th>TF</th>"
      + "<th>Paramètres</th><th>Net</th><th>Trades</th><th>Hasard</th>"
      + "<th>p</th><th>Épreuve</th><th>Note</th></tr></thead><tbody>"
      + l.map((x) =>
        "<tr" + (x.survit_bh ? " class='survit'" : "") + ">"
        + "<td class='name'>" + esc(x.strategie) + "</td>"
        + "<td>" + esc(x.actif) + "</td><td>" + esc(x.intervalle) + "</td>"
        + "<td class='params'>" + esc(Object.entries(x.parametres || {})
            .map(([k, v]) => k + "=" + v).join(" ")) + "</td>"
        + "<td style='color:" + (Number(x.net_usd) >= 0 ? "var(--ok)" : "var(--crit)") + "'>"
        + usd(x.net_usd) + "</td>"
        + "<td>" + x.trades + "</td>"
        + "<td class='sansobjet'>" + usd(x.hasard_moyen) + "</td>"
        + "<td>" + (x.p === null || x.p === undefined
          ? "<span class='tag ko' title='" + esc(x.raison_sans_p || "") + "'>sans p</span>"
          : num(x.p, 4)) + "</td>"
        + "<td>" + badgeEpreuve(x.verdict_epreuves, x.resume_epreuves) + "</td>"
        + "<td>" + badgeNote(x.note) + "</td>"
        + "</tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Rien au registre.</div>';

  const ps = a.par_strategie || [];
  $("atStrategies").innerHTML = ps.length
    ? "<table><thead><tr><th>Stratégie</th><th>Combinaisons</th><th>Gagnantes</th>"
      + "<th>Net médian</th><th>p min</th><th>Survivantes BH</th></tr></thead><tbody>"
      + ps.map((x) =>
        "<tr><td class='name'>" + esc(x.nom) + "</td>"
        + "<td>" + x.combinaisons + "</td><td>" + x.gagnantes + "</td>"
        + "<td style='color:" + (Number(x.net_median) >= 0 ? "var(--ok)" : "var(--crit)") + "'>"
        + usd(x.net_median) + "</td>"
        + "<td>" + num(x.p_min, 4) + "</td>"
        + "<td" + (x.survivants ? " style='color:var(--ok)'" : "") + ">"
        + x.survivants + "</td></tr>").join("")
      + "</tbody></table>"
    : "";

  /* LES COUPES — une règle à travers un panier d'actifs.

     C'est la forme de recherche que le regroupement en familles rend payante :
     passer SEUL est le cas le plus dur qui existe, alors que cinq actifs qui
     tiennent se portent l'un l'autre.

     Deux colonnes encadrent « survivantes » et elles ne sont pas décoratives.
     « Hasard » dit combien de cellules sous alpha le pur hasard donnerait :
     six sur cent quarante n'est pas une trouvaille, c'est moins que les sept
     attendues. « Marchés » dit combien de marchés INDÉPENDANTS font les
     actifs survivants : BTC, ETH et SOL en font 1,5, donc « tient sur trois
     actifs » se lit « tient sur un marché et demi ». Sans ces deux colonnes,
     le nombre de survivantes se lit comme une découverte. */
  const cps = a.coupes || [];
  /* Le graphe d'abord, le tableau ensuite : le graphe donne la forme, le
     tableau donne les nombres exacts et reste la vue accessible. */
  window.__coupes = cps;
  const elG = $("atCoupesGraphe");
  /* Les deux corrections n'ont PAS la même portée, et le taire rendrait la
     colonne « survivantes » plus forte qu'elle n'est. Une coupe corrige sur
     ses propres cellules — une règle, une échelle. L'épreuve corrige sur
     TOUT le registre de même origine : six balayages sous « balayage » font
     un dénominateur de cent cinquante-sept familles, pas de vingt-six. Une
     cellule peut donc survivre à sa coupe et tomber à la porte, et c'est le
     cas normal, pas une incohérence. */
  const balayage = (a.par_origine || []).find((o) => o.origine === "balayage");
  if (elG) {
    elG.innerHTML = grapheCoupes(cps)
      + (cps.length
        ? "<div class='sansobjet' style='margin-top:8px'>La coupe corrige sur "
          + "ses propres cellules ; <b>l'épreuve corrige sur toute l'origine</b>"
          + (balayage
              ? " — " + balayage.familles + " famille(s) sous « balayage », "
                + "soit un seuil au rang 1 de "
                + num(0.05 / Math.max(1, balayage.familles), 5)
              : "")
          + ". Survivre à sa coupe ne suffit donc pas à passer la porte.</div>"
        : "");
  }
  const elCoupes = $("atCoupes");
  if (elCoupes) {
    elCoupes.innerHTML = cps.length
      ? "<table><thead><tr><th>Règle</th><th>Échelle</th><th>Actifs</th>"
        + "<th>Sous alpha</th><th>Hasard</th><th>Survivantes BH</th>"
        + "<th>Retenues</th><th>Marchés</th></tr></thead><tbody>"
        + cps.map((c) =>
          "<tr><td class='name'>" + esc(c.strategie) + "</td>"
          + "<td>" + esc(c.intervalle) + "</td>"
          + "<td>" + c.familles + "</td>"
          + "<td>" + c.sous_alpha
          + ((c.maigres || []).length
              ? " <span class='tag incomplet' title='moins de 30 aller-retours : "
                + esc((c.maigres || []).join(" "))
                + "'>dont " + c.maigres.length + " maigre(s)</span>" : "")
          + "</td>"
          + "<td class='sansobjet'>" + num(c.attendu_au_hasard, 1) + "</td>"
          /* Survivantes en gris, JAMAIS en vert. Un balayage transversal du
             17 septembre 2026 a rendu quinze actifs survivant ensemble, tous
             les quinze refusés par l'épreuve : des cellules à trois trades
             ont un nul dégénéré, donc des p artificiellement bas, et le
             relâchement du seuil au rang les fait se sauver mutuellement. La
             couleur va à la colonne qui compte : celle qui passe la porte.
             `transversal.py` nomme la règle et porte la mesure. */
          + "<td class='sansobjet'>" + (c.survivantes || []).length + "</td>"
          + "<td" + ((c.retenues || []).length ? " style='color:var(--ok)'" : "") + ">"
          + (c.retenues || []).length
          + ((c.retenues || []).length
              ? " <span class='dim'>" + esc(c.retenues.join(" ")) + "</span>" : "")
          + "</td>"
          + "<td" + (c.marches != null && c.marches < 2 ? " style='color:var(--warn)'" : "") + ">"
          + (c.marches == null
              ? "<span class='sansobjet' title='" + esc(c.motif_marches || "") + "'>—</span>"
              : num(c.marches, 1))
          + "</td></tr>").join("")
        + "</tbody></table>"
      /* Le nom de la stratégie vient du CATALOGUE, jamais d'un littéral :
         ajouter une règle au code doit la faire apparaître sans toucher à
         cette page, et un exemple écrit en dur vieillit en silence. */
      : "<div class='empty'>Aucune coupe d'au moins trois actifs. "
        + "<code>python scripts/balayage.py --strategie "
        + esc(Object.keys((a.catalogue || {}).strategies || {})[0] || "&lt;règle&gt;")
        + " --intervalle 1d</code></div>";
  }
}

/* --- lancement d'un essai ---
   L'essai tourne dans un processus à part, un seul à la fois, et il est
   REFUSÉ tant que le desk trade : il sature le processeur une dizaine de
   secondes, et le pupitre en mode PAPER décide sur le carnet de l'instant.
   Le refus vient du serveur — la page ne décide pas toute seule qu'elle a le
   droit, elle affiche la raison qu'on lui donne. */
let atSuivi = null;

function atDire(texte, mauvais) {
  $("atNote").textContent = texte || "";
  $("atNote").style.color = mauvais ? "var(--crit)" : "var(--muted)";
}

async function atSuivre() {
  let etat = null;
  try {
    const r = await fetch("/api/campagnes");
    etat = await r.json();
  } catch (e) { return; }

  const nous = etat.cle === "atelier";
  $("atSortie").hidden = !nous || !(etat.lignes || []).length;
  if (nous) $("atSortie").textContent = (etat.lignes || []).join("\n");
  $("atArreter").hidden = !(nous && etat.en_cours);
  $("atLancer").disabled = !!etat.en_cours;

  if (etat.en_cours) {
    atDire(nous
      ? "essai en cours — " + (etat.depuis_s || 0) + " s"
      : "occupé : « " + (etat.titre || etat.cle) + " » tourne");
    return;
  }
  if (atSuivi) {
    clearInterval(atSuivi);
    atSuivi = null;
    atDire(nous && etat.code === 0
      ? "terminé en " + (etat.duree_s || 0) + " s — registre mis à jour"
      : nous ? "terminé, code " + etat.code : "");
    chargerRecherche();
  } else if (etat.refus) {
    atDire(etat.refus, true);
  }
}

async function atLancer() {
  if (!atChoix.strategie || !atChoix.actifs.size || !atChoix.intervalles.size) {
    atDire("choisir une stratégie, au moins un ticker et une échelle", true);
    return;
  }
  atDire("lancement…");
  const rep = await post("/api/atelier/lancer", {
    strategie: atChoix.strategie,
    actifs: [...atChoix.actifs],
    intervalles: [...atChoix.intervalles],
    parametres: atChoix.params,
    tirages: Number($("atTirages").value) || 2000,
  });
  if (!rep) return;
  if (!rep.lance) { atDire(rep.raison || "refusé", true); return; }
  $("atSortie").hidden = false;
  $("atSortie").textContent = "$ " + (rep.commande || "");
  if (atSuivi) clearInterval(atSuivi);
  atSuivi = setInterval(atSuivre, 1500);
  atSuivre();
}

/* ---------- LE GRAPHE DES COUPES ----------

   Une ligne par règle × échelle. Trois épaisseurs qui s'emboîtent, parce que
   les quantités s'emboîtent vraiment : retenues ⊆ survivantes ⊆ testées.

   UN SEUL AXE, et c'est ce qui décide de la mise en page. Le nombre de
   marchés indépendants n'est pas un nombre d'actifs — c'est 1,5 pour trois
   perps corrélés — donc il ne peut pas partager l'échelle sans mentir. Il
   part dans sa propre colonne, à droite, en texte.

   Le trait vertical est l'attendu du hasard : `alpha × testées`. Sans lui,
   « seize cellules sous alpha » se lit comme une trouvaille ; avec lui on
   voit qu'il en fallait 1,2 pour rien.

   Les valeurs ne sont pas peintes aux couleurs des barres : le texte porte
   les jetons d'encre, et l'identité vient de la barre à côté. */

const CPG = { W: 1000, GAUCHE: 196, DROITE: 116, HAUT: 28, BAS: 28, RANG: 34 };
/* Largeur d'un caractere de `.val` (12px mono) dans le repere interne.
   Mesuree plutot que devinee : Chromium rend JetBrains Mono a 0,6 em. */
const CPG_CAR = 7.3;

/* Un rectangle dont SEUL le bout de donnée est arrondi ; la base reste
   carrée sur la ligne zéro, sinon la barre a l'air de flotter. */
function cpgBarre(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w, h / 2));
  if (w <= 0) return "";
  return "M" + x + "," + y + "h" + (w - rr)
    + "a" + rr + "," + rr + " 0 0 1 " + rr + "," + rr
    + "v" + (h - 2 * rr)
    + "a" + rr + "," + rr + " 0 0 1 " + (-rr) + "," + rr
    + "H" + x + "z";
}

/* Des graduations sur des nombres ronds : elles portent les valeurs qu'on n'a
   pas étiquetées. */
function cpgTicks(max) {
  if (max <= 0) return [0];
  const brut = max / 4;
  const ordre = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 5, 10].map((m) => m * ordre).find((v) => v >= brut) || ordre * 10;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += pas) out.push(Math.round(v));
  return out;
}

function grapheCoupes(cps) {
  if (!cps.length) return "";
  const { W, GAUCHE, DROITE, HAUT, BAS, RANG } = CPG;
  const x0 = GAUCHE, x1 = W - DROITE, large = x1 - x0;
  const max = Math.max(...cps.map((c) => c.familles || 0), 1);
  const xs = (v) => x0 + (large * Math.max(0, Math.min(v, max))) / max;
  const HT = HAUT + cps.length * RANG + BAS;

  const ticks = cpgTicks(max);
  const grille = ticks.map((t) =>
    '<line class="' + (t === 0 ? "axe" : "grille") + '" x1="' + xs(t)
    + '" y1="' + HAUT + '" x2="' + xs(t) + '" y2="' + (HT - BAS + 6) + '"/>'
    + '<text class="tick" x="' + xs(t) + '" y="' + (HT - BAS + 20)
    + '" text-anchor="middle">' + t + "</text>").join("");

  const rangs = cps.map((c, i) => {
    const yc = HAUT + i * RANG + RANG / 2;
    const fam = c.familles || 0;
    const sur = (c.survivantes || []).length;
    const ret = (c.retenues || []).length;
    const has = c.attendu_au_hasard || 0;
    const mrc = c.marches;

    let g = '<g class="rang">';
    g += '<path class="piste" d="' + cpgBarre(x0, yc - 9, xs(fam) - x0, 18, 4) + '"/>';
    if (sur > 0) g += '<path class="surv" d="' + cpgBarre(x0, yc - 9, xs(sur) - x0, 18, 4) + '"/>';
    if (ret > 0) g += '<path class="ret" d="' + cpgBarre(x0, yc - 5, xs(ret) - x0, 10, 3) + '"/>';
    if (has > 0) {
      g += '<line class="hasard" x1="' + xs(has) + '" y1="' + (yc - 13)
        + '" x2="' + xs(has) + '" y2="' + (yc + 13) + '"/>';
    }
    g += '<text class="nom" x="0" y="' + (yc - 1) + '">' + esc(c.strategie) + "</text>";
    g += '<text class="tf" x="0" y="' + (yc + 12) + '">' + esc(c.intervalle)
      + " · " + fam + " actifs</text>";
    /* Une étiquette au bout de la barre qui porte l'histoire, et seulement
       elle. Un nombre sur chaque marque ne se lit pas. */
    /* Une étiquette qui ne rentre pas n'est pas rognée : on la MESURE avant
       de la poser. Au-delà de la place libre entre le bout de la piste et la
       colonne des marchés, elle passait sous cette colonne — « 15
       survivantes, 0 retenue » sur un rang à 25 actifs. Trop longue, elle se
       raccourcit ; encore trop longue, elle s'efface et c'est la bulle et le
       tableau qui la portent, où rien n'est perdu. */
    const texte = ret > 0
      ? ret + " retenue" + (ret > 1 ? "s" : "")
      : (sur > 0 ? sur + " survivante" + (sur > 1 ? "s" : "") + ", 0 retenue" : "");
    const court = ret > 0 ? texte : (sur > 0 ? sur + " surv., 0 ret." : "");
    if (texte) {
      const xEtiq = xs(fam) + 10;
      /* La place libre s'arrête où commence la colonne des marchés, pas au
         bord du panneau — la première version comptait jusqu'au bord et
         « 4 surv., 0 ret. » venait barrer le tiret des marchés. */
      const droite = x1 + 6 - xEtiq;
      const dedans = xs(fam) - xs(sur) - 20;   // la part de piste sans barre
      const lg = (t) => CPG_CAR * t.length;
      if (lg(texte) <= droite || lg(court) <= droite) {
        g += '<text class="val" x="' + xEtiq + '" y="' + (yc + 4) + '">'
          + (lg(texte) <= droite ? texte : court) + "</text>";
      } else if (lg(court) <= dedans) {
        /* Sinon, à l'intérieur de la piste, calée sur son bout : il y a la
           place, et le texte y reste sur la piste seule — jamais sur la barre
           grise, où l'encre secondaire ne contrasterait pas. */
        g += '<text class="val" x="' + (xs(fam) - 10) + '" y="' + (yc + 4)
          + '" text-anchor="end">' + court + "</text>";
      }
      /* Si rien ne rentre, pas d'étiquette : la bulle et le tableau portent
         tous les nombres, donc rien n'est perdu — alors qu'un texte rogné
         coupe des caractères et ment. */
    }
    /* Colonne séparée : ce n'est pas un nombre d'actifs. */
    g += (mrc == null)
      ? '<text class="mrc-nd" x="' + (x1 + 16) + '" y="' + (yc + 4) + '">—</text>'
      : '<text class="mrc" x="' + (x1 + 16) + '" y="' + (yc + 4) + '">'
        + mrc.toFixed(1) + "</text>";
    g += '<rect class="zone" x="0" y="' + (yc - RANG / 2) + '" width="' + W
      + '" height="' + RANG + '" data-i="' + i + '"/>';
    return g + "</g>";
  }).join("");

  const cle = '<div class="coupe-cle">'
    + '<span class="k-piste"><i></i>actifs testés</span>'
    + '<span class="k-surv"><i></i>survivantes BH</span>'
    + '<span class="k-ret"><i></i>retenues par l’épreuve</span>'
    + '<span class="k-has"><i></i>attendu du hasard</span>'
    + "</div>";

  return cle
    + '<svg class="coupeg" viewBox="0 0 ' + W + " " + HT + '" '
    + 'preserveAspectRatio="xMinYMin meet" role="img" '
    + 'aria-label="Par règle et échelle : actifs testés, survivantes à la '
    + 'correction, retenues par l’épreuve, et nombre de marchés '
    + 'indépendants. Le tableau qui suit porte les mêmes nombres.">'
    + grille + rangs
    + '<text class="tick" x="' + (x1 + 16) + '" y="' + (HAUT - 2)
    + '">marchés</text>'
    + '<text class="tick" x="' + (x1 + 16) + '" y="' + (HAUT + 10)
    + '">indép.</text>'
    + "</svg>";
}

/* La bulle. Un graphe HTML EST interactif : sans survol, les nombres qui ne
   sont pas étiquetés — dont « sous alpha » et les maigres — ne sont lisibles
   que dans le tableau. */
let cpgBulle = null;
function cpgSurvol(ev) {
  const zone = ev.target.closest ? ev.target.closest(".coupeg .zone") : null;
  if (!cpgBulle) {
    cpgBulle = document.createElement("div");
    cpgBulle.className = "coupe-bulle";
    document.body.appendChild(cpgBulle);
  }
  if (!zone) { cpgBulle.style.opacity = "0"; return; }
  const c = (window.__coupes || [])[Number(zone.dataset.i)];
  if (!c) { cpgBulle.style.opacity = "0"; return; }
  const maigres = (c.maigres || []).length;
  cpgBulle.innerHTML =
    '<span class="t">' + esc(c.strategie) + " · " + esc(c.intervalle) + "</span>"
    + "<b>" + c.familles + "</b> actifs testés<br>"
    + "<b>" + c.sous_alpha + "</b> sous alpha, quand le hasard en donnerait <b>"
    + num(c.attendu_au_hasard, 1) + "</b>"
    + (maigres ? '<br><span style="color:var(--warn)">dont <b>' + maigres
        + "</b> sur moins de 30 aller-retours</span>" : "")
    + "<br><b>" + (c.survivantes || []).length + "</b> survivent ensemble"
    + "<br><b>" + (c.retenues || []).length + "</b> retenue(s) par l’épreuve"
    + ((c.retenues || []).length ? " : " + esc(c.retenues.join(" ")) : "")
    + "<br>" + (c.marches == null
        ? '<span class="sansobjet">marchés indépendants : '
          + esc(c.motif_marches || "non mesurés") + "</span>"
        : "<b>" + num(c.marches, 1) + "</b> marché(s) indépendant(s)");
  cpgBulle.style.opacity = "1";
  const dx = 16, dy = 14;
  const l = Math.min(ev.clientX + dx, window.innerWidth - cpgBulle.offsetWidth - 8);
  const t = Math.min(ev.clientY + dy, window.innerHeight - cpgBulle.offsetHeight - 8);
  cpgBulle.style.left = Math.max(8, l) + "px";
  cpgBulle.style.top = Math.max(8, t) + "px";
}
document.addEventListener("mousemove", cpgSurvol);


/* ---------- LES SAISONS ----------

   Deux formes, choisies par le travail que le lecteur doit faire.

   La BANDE répond à « quand ». Des plages labellisées, larges à proportion de
   leur durée. Ni rouge ni vert : ils sont réservés à la sévérité dans tout ce
   poste, et « bull = vert » dirait « bull = bien », ce qui est faux pour un
   desk qui peut vendre à découvert.

   La GRILLE répond à « est-ce que ça dit quelque chose ». Un point par
   cellule sur l'axe des p, en trois petits multiples — un par saison. PAS une
   carte de chaleur : trente-trois cases qui scintillent en deux couleurs
   invitent à chercher des motifs dans du bruit, alors que le résultat mesuré
   est que rien ne franchit le seuil. Le validateur de palette refusait
   d'ailleurs la paire rouge/vert en thème clair — ΔE 5,6 en deutéranopie,
   sous le plancher.

   Les cellules trop maigres sont CREUSES, pas absentes : elles comptent au
   dénominateur, elles ne sont juste pas lisibles. */

function rendreSaisons(sz) {
  const badge = $("saisonBadge");
  if (!sz || !sz.disponible) {
    if (badge) badge.textContent = "—";
    if ($("saisonsSerie")) {
      $("saisonsSerie").innerHTML = sz && sz.raison
        ? "<div class='empty'>" + esc(sz.raison)
          + (sz.commande ? " <code>" + esc(sz.commande) + "</code>" : "") + "</div>"
        : "";
    }
    if ($("saisonsGrille")) $("saisonsGrille").innerHTML = "";
    return;
  }

  const d = sz.serie || {};
  if (badge) {
    badge.textContent = "v" + sz.version + " · " + (sz.plages || []).length + " plages";
    badge.style.color = d.criblage_possible ? "var(--ok)" : "var(--crit)";
  }

  const total = (sz.plages || []).reduce((a, p) => a + p.barres, 0) || 1;
  const bandes = (sz.plages || []).map((p) => {
    const pct = (100 * p.barres) / total;
    /* Le nom n'est écrit que s'il tient : un texte rogné coupe des
       caractères, donc il ment. Le seuil est descendu de 5 % à 3 % parce
       qu'au-dessus, la moitié des plages restaient muettes et un lecteur ne
       pouvait pas distinguer une saison étroite d'un séparateur. La bulle
       native porte le détail dans tous les cas. */
    const texte = pct >= 3 ? esc(p.saison) : "";
    return "<div class='sz-" + esc(p.saison) + "' style='width:" + pct.toFixed(3)
      + "%' title='" + esc(p.saison) + " · " + p.barres + " barres · "
      + esc(p.debut) + " → " + esc(p.fin) + " · jour " + p.jour_du_cycle
      + " du cycle " + p.cycle + "'>" + texte + "</div>";
  }).join("");

  const r = d.repartition || {};
  $("saisonsSerie").innerHTML =
    "<div class='saison-bande'>" + bandes + "</div>"
    + "<div class='saison-cle'>"
    + "<span><i class='sz-bull'></i>bull "
    + (r.bull || 0) + " j</span>"
    + "<span><i style='background:var(--surface-3)'></i>range " + (r.range || 0) + " j</span>"
    + "<span><i style='background:color-mix(in oklab, var(--accent) 72%, var(--surface))'></i>bear "
    + (r.bear || 0) + " j</span>"
    + "</div>"
    /* La résolution AVANT les résultats : un criblage aveugle rend un « zéro
       survivant » qui ne dit rien du marché. */
    + "<div class='sansobjet' style='margin-top:8px'>"
    + "Découpage figé le " + esc(sz.fige_le) + ", empreinte <b>" + esc(sz.empreinte)
    + "</b> · saisons sur " + esc(sz.reference) + " " + esc(sz.echelle_saison)
    + ", stratégies en " + esc(sz.intervalle_strategies) + " · "
    + d.plage_decalages + " décalages pour " + d.plage_requise + " requis — "
    + (d.criblage_possible
        ? "le criblage peut voir"
        : "<b style='color:var(--crit)'>criblage aveugle</b>")
    + "</div>"
    /* Les DEUX nombres du panier, jamais le premier seul. Vingt-six actifs
       qui font moins de deux marchés donnent vingt-six fois plus de trades et
       presque pas plus de matière : n'afficher que le compte d'actifs ferait
       passer le volume pour de la puissance. Et la précondition déclarée
       s'affiche même — surtout — quand elle échoue. */
    + (sz.panier
      ? "<div class='sansobjet' style='margin-top:4px'>Panier mis en commun : <b>"
        + sz.panier.nombre + "</b> actifs, "
        + (sz.panier.marches == null
            ? "marchés indépendants non mesurés"
            : "<b" + (sz.panier.tient_la_precondition ? "" : " style='color:var(--warn)'")
              + ">" + num(sz.panier.marches, 2) + "</b> marché(s) indépendant(s)"
              + " pour " + num(sz.panier.minimum, 1) + " déclaré(s) au minimum"
              + (sz.panier.tient_la_precondition
                  ? ""
                  : " — <b style='color:var(--warn)'>précondition non tenue</b> :"
                    + " la mise en commun ajoute des trades, pas de l'information"))
        + "</div>"
      : "");

  $("saisonsGrille").innerHTML = grapheGrilleSaisons(sz);
}

/* DROITE n'est pas de la marge décorative : un point à p = 0,99 est centré
   sur le bord du dernier panneau, donc son rayon et l'étiquette « 1 » de son
   axe sortaient du viewBox et se faisaient rogner. On réserve de quoi les
   contenir. ECART s'ouvre pour la même raison, entre le « 1 » d'un panneau et
   le « 0 » du suivant. */
const GS = { W: 1000, NOMS: 178, DROITE: 14, HAUT: 40, BAS: 26, RANG: 20,
             ECART: 26 };

function grapheGrilleSaisons(sz) {
  const cells = sz.grille || [];
  if (!cells.length) return "";
  const { W, NOMS, DROITE, HAUT, BAS, RANG, ECART } = GS;
  const saisons = ["bull", "range", "bear"];
  const noms = [...new Set(cells.map((c) => c.strategie))].sort();
  const large = (W - NOMS - DROITE - ECART * (saisons.length - 1)) / saisons.length;
  const HT = HAUT + noms.length * RANG + BAS;
  const par = {};
  cells.forEach((c) => { par[c.strategie + "|" + c.saison] = c; });

  let g = "";
  saisons.forEach((s, k) => {
    const gx = NOMS + k * (large + ECART);
    const xs = (p) => gx + large * Math.max(0, Math.min(1, p));
    g += "<text class='lab' x='" + gx + "' y='" + (HAUT - 16) + "'>" + esc(s) + "</text>";
    [0, 0.5, 1].forEach((t) => {
      g += "<line class='" + (t === 0 ? "axe2" : "grille2") + "' x1='" + xs(t)
        + "' y1='" + (HAUT - 6) + "' x2='" + xs(t) + "' y2='" + (HT - BAS + 4) + "'/>"
        + "<text class='tick2' x='" + xs(t) + "' y='" + (HT - BAS + 18)
        + "' text-anchor='middle'>" + t + "</text>";
    });
    /* Le seuil d'alpha, tracé là où il tombe vraiment : tout à gauche. C'est
       le message — les points sont loin, pas près. */
    g += "<line class='seuil' x1='" + xs(0.05) + "' y1='" + (HAUT - 6)
      + "' x2='" + xs(0.05) + "' y2='" + (HT - BAS + 4) + "'/>";
    /* L'étiquette du seuil va SOUS l'axe, pas au-dessus : en haut elle
       tombait sur le titre du panneau. */
    if (k === 0) {
      g += "<text class='sub' x='" + (xs(0.05) + 5) + "' y='" + (HT - BAS + 18)
        + "'>α</text>";
    }
    noms.forEach((nom, i) => {
      const c = par[nom + "|" + s];
      if (!c || c.p == null) return;
      const y = HAUT + i * RANG + RANG / 2;
      g += "<circle class='" + (c.interpretable ? "pt" : "pt-mgr") + "' cx='"
        + xs(c.p) + "' cy='" + y + "' r='4.5'><title>" + esc(nom) + " · " + esc(s)
        + "\n" + c.trades + " aller-retours" + (c.interpretable ? "" : " (trop peu)")
        + "\np = " + c.p.toFixed(4)
        + "\n" + c.net_par_trade.toFixed(2) + " $/trade contre "
        + c.nul_moyen.toFixed(2) + " au nul</title></circle>";
    });
  });
  noms.forEach((nom, i) => {
    g += "<text class='sub' x='0' y='" + (HAUT + i * RANG + RANG / 2 + 4)
      + "'>" + esc(nom) + "</text>";
  });

  return "<svg class='grilleg' viewBox='0 0 " + W + " " + HT + "' "
    + "preserveAspectRatio='xMinYMin meet' role='img' aria-label='p de chaque "
    + "cellule stratégie par saison, en trois petits multiples'>" + g + "</svg>"
    + "<div class='saison-cle'>"
    + "<span><svg width='14' height='14' style='vertical-align:-3px'>"
    + "<circle class='pt' cx='7' cy='7' r='4.5' fill='var(--accent)'/></svg>"
    + " au moins " + sz.trades_min + " aller-retours</span>"
    + "<span><svg width='14' height='14' style='vertical-align:-3px'>"
    + "<circle cx='7' cy='7' r='4.5' fill='none' stroke='var(--muted)' "
    + "stroke-width='1.5'/></svg> trop maigre — comptée au dénominateur, "
    + "pas lisible</span></div>"
    + "<div class='sansobjet' style='margin-top:6px'>"
    + sz.denominateur + " cellules · <b>" + sz.sous_alpha + "</b> sous alpha "
    + "quand le hasard en donnerait <b>" + num(sz.attendu_au_hasard, 2)
    + "</b> · <b>" + sz.survivantes + "</b> survivante(s) à Benjamini-Hochberg "
    + "(seuil au rang 1 : " + num(sz.seuil_rang1, 5) + ")"
    + ((sz.maigres_sous_alpha || []).length
        ? "<br>La ou les cellules sous alpha sont maigres : "
          + esc(sz.maigres_sous_alpha.join(", "))
          + " — nul dégénéré, pas un résultat."
        : "")
    + "</div>";
}


/* ---------- CONSOMMATION ---------- */
/* Le seuil de rentabilité d'une couche d'IA permanente.

   Ce n'est pas une mesure de plus : c'est une division entre deux chiffres
   déjà mesurés — le coût par cycle et le rendement de la règle déployée. Elle
   a sa place à l'écran plutôt que dans une discussion, parce qu'une division
   affichée tranche ce qu'une intuition laisse ouvert.

   Les deux colonnes de seuil sont l'écart de taille du desk vu par le coût :
   à la taille déployée il faut vingt-quatre mille dollars pour payer une IA
   horaire, à la taille validée moins de trois mille. */
function rendreRentabilite(r) {
  if (!r) { $("rentabilite").innerHTML = ""; return; }
  $("rentaBadge").textContent = r.rentable ? "rentable" : "déficitaire";
  $("rentaBadge").style.color = r.rentable ? "var(--ok)" : "var(--crit)";
  $("rentabilite").innerHTML =
    '<div class="verdict' + (r.rentable ? "" : " bloc") + '"><span class="gros">'
    + esc(r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1))
    + "</span>Sur " + usd(r.capital_usd) + " de capital, au rythme d'un cycle "
    + "par heure. Le coût par cycle (" + usd(r.cout_par_cycle_usd) + ") est "
    + "mesuré ; les rendements aussi. Le seuil n'est qu'une division.</div>"
    + "<table><thead><tr><th>Cadence</th><th>Facture</th>"
    + "<th>Seuil à " + pct(r.rendement_deploye * 100, 0) + "/an <span class='dim'>(taille déployée)</span></th>"
    + "<th>Seuil à " + pct(r.rendement_valide * 100, 0) + "/an <span class='dim'>(taille validée)</span></th>"
    + "</tr></thead><tbody>"
    + (r.lignes || []).map((l) =>
      "<tr><td class='name'>" + esc(l.cadence) + "</td>"
      + "<td>" + usd(l.cout_mensuel_usd) + " / mois</td>"
      + "<td style='color:var(--crit)'>" + usd(l.seuil_deploye_usd) + "</td>"
      + "<td>" + usd(l.seuil_valide_usd) + "</td></tr>").join("")
    + "</tbody></table>";
}


function rendreConsommation(c) {
  c = c || {};
  const q = c.qualite || {};
  const pols = c.politiques || [];

  if (q.scores && q.scores.length) {
    $("scoreBadge").textContent = q.rejetes + " évaluations · " + q.emis + " émis";
    $("scoreBadge").style.color = q.emis ? "var(--ok)" : "var(--crit)";
    $("scores").innerHTML = histogramme(q.scores, c.seuil_conviction)
      + '<div class="verdict' + (q.emis ? "" : " bloc") + '"><span class="gros">'
      + (q.emis ? q.emis + " mandat(s) émis"
                : "Score maximum " + num(q.score_max) + ", seuil " + num(c.seuil_conviction))
      + "</span>"
      + (q.emis ? ""
        : "Le portier n'a jamais été franchi. C'est la cause directe des zéros "
          + "de tous les autres panneaux — et un scoreur qui plafonne sous son "
          + "seuil ne mesure pas la qualité, il refuse tout.")
      + "</div>";
  } else {
    $("scoreBadge").textContent = "absent";
    $("scores").innerHTML = rien("Aucune campagne de qualité",
      "Le fichier de qualité n'est pas sur cette machine.",
      "python -m trading_desk.agents --cycles 30 --politique diversifie");
  }

  rendreRentabilite(c.rentabilite);

  $("politiques").innerHTML = pols.length
    ? "<table><thead><tr><th>Politique</th><th>Ce que c'est</th><th>Cycles</th>"
      + "<th>Coût total</th><th>Par cycle</th><th>Non tarifés</th></tr></thead><tbody>"
      + pols.map((p) =>
        "<tr><td class='name'>" + esc(p.politique) + "</td>"
        + "<td style='font-family:var(--f-ui)'>" + esc(p.quoi) + "</td>"
        + "<td>" + p.cycles + "</td><td>" + usd(p.cout_total) + "</td>"
        + "<td>" + usdFin(p.cout_par_cycle) + "</td>"
        + "<td" + (p.non_tarifes ? " style='color:var(--warn)'" : "") + ">"
        + p.non_tarifes + "</td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucune comparaison de politiques.</div>';

  const agents = [];
  for (const p of pols) for (const a of (p.agents || [])) agents.push({ ...a, politique: p.politique });
  $("agents").innerHTML = agents.length
    ? "<table><thead><tr><th>Agent</th><th>Politique</th><th>Appels</th>"
      + "<th>Schéma valide</th><th>Abstentions</th><th>Coût / appel</th>"
      + "<th>p95</th></tr></thead><tbody>"
      + agents.map((a) =>
        "<tr><td class='name'>" + esc(a.agent) + "</td><td>" + esc(a.politique) + "</td>"
        + "<td>" + a.appels + "</td>"
        + "<td" + (a.valides_pct < 100 ? " style='color:var(--crit)'" : "") + ">"
        + pct(a.valides_pct) + "</td>"
        + "<td>" + pct(a.abstentions_pct) + "</td>"
        + "<td>" + usdFin(a.cout_par_appel) + "</td>"
        + "<td>" + (a.p95_ms / 1000).toFixed(1) + " s</td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucun relevé par agent.</div>';
}

/* ---------- VOLS ---------- */
/* La poussée : le PnL réalisé, converti en distance parcourue.

   Ça peut passer pour de la décoration. Ça n'en est pas : la partie la plus
   dure de la discipline des règles figées est de ne pas y toucher pendant
   trois mois, et un tableau de p qui ne bouge pas ne donne envie de rien.

   L'échelle est calée pour qu'un tour de Terre vaille une année à la taille
   VALIDÉE. À la taille déployée, une année entière fait un dixième de tour —
   l'écart de taille cesse d'être une ligne dans un tableau et devient quelque
   chose qu'on voit ne pas avancer.

   La distance est le réalisé et rien d'autre. Afficher ce que le desk AURAIT
   parcouru à pleine taille donnerait la satisfaction sans le résultat. */
function rendrePoussee(p) {
  if (!p) { $("poussee").innerHTML = ""; return; }
  const r = p.reperes || {};
  const reperes = "<table><thead><tr><th>Repère</th><th>Sur un an</th>"
    + "<th>Tours de Terre</th></tr></thead><tbody>"
    + "<tr><td class='name'>Taille déployée <span class='dim'>(3,3 % du capital)</span></td>"
    + "<td style='color:var(--crit)'>" + Math.round(r.an_taille_deployee_km).toLocaleString("fr") + " km</td>"
    + "<td style='color:var(--crit)'>" + Number(r.tours_par_an_deployee).toLocaleString("fr", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td></tr>"
    + "<tr><td class='name'>Taille validée <span class='dim'>(25 % du capital)</span></td>"
    + "<td>" + Math.round(r.an_taille_validee_km).toLocaleString("fr") + " km</td>"
    + "<td>" + Number(r.tours_par_an_validee).toLocaleString("fr", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td></tr>"
    + "</tbody></table>";

  if (!p.disponible) {
    $("pousseeBadge").textContent = "à quai";
    $("pousseeBadge").style.color = "var(--muted)";
    $("poussee").innerHTML = '<div class="verdict bloc"><span class="gros">'
      + "Le vaisseau n'avance pas</span>" + esc(p.raison || "") + "</div>"
      + reperes;
    return;
  }

  const km = Number(p.distance_km);
  $("pousseeBadge").textContent = Math.round(km).toLocaleString("fr") + " km";
  $("pousseeBadge").style.color = km >= 0 ? "var(--ok)" : "var(--crit)";
  $("poussee").innerHTML = '<div class="chiffres">'
    + chiffre("distance parcourue", Math.round(km).toLocaleString("fr") + " km",
              km >= 0 ? "var(--ok)" : "var(--crit)")
    + chiffre("tours de Terre", p.tours + " + " + Math.round(p.fraction_tour * 100) + " %")
    + chiffre("rythme", Math.round(p.km_par_jour).toLocaleString("fr") + " km/jour")
    + chiffre("prochain tour dans",
              p.jours_avant_le_prochain_tour === null
                ? "jamais à ce rythme"
                : Math.round(p.jours_avant_le_prochain_tour).toLocaleString("fr") + " jours")
    + "</div>" + reperes;
}

/* ---------- FABRIQUE : générateur, testeur, bibliothèque ---------- */

/* Le générateur est, par construction, une machine à fabriquer des faux
   positifs. L'écran met donc « produites » en premier et « retenues » après :
   un générateur qui sort cinq cents variantes et en garde trois n'a pas
   trouvé trois stratégies, il a tiré cinq cents fois.

   Les sources indisponibles portent leur MOTIF. Une source qui rendrait une
   liste vide se lirait comme « rien trouvé sur GitHub », ce qui est un
   résultat ; l'indisponibilité est une absence de mesure. */
function rendreGenerateur(g) {
  if (!g) { $("generateur").innerHTML = ""; return; }
  const b = g.bilan && g.bilan.total ? g.bilan.total : {};
  $("genBadge").textContent = (b.produits || 0) + " produite(s)"
    + (b.familles != null ? " · " + b.familles + " famille(s)" : "");
  $("genBadge").style.color = b.produits ? "var(--ok)" : "var(--muted)";

  const sources = (g.sources || []).map((s) =>
    "<tr><td class='name'>" + esc(s.cle) + "</td><td>" + esc(s.quoi) + "</td>"
    + "<td><span class='tag " + (s.sondee === false ? "incomplet'>non sondée"
        : (s.disponible ? "ok'>disponible" : "ko'>indisponible"))
    + "</span></td><td class='sansobjet'>" + esc(s.motif || "") + "</td></tr>").join("");

  const lots = (g.lots || []).slice(0, 12).map((l) =>
    "<tr><td class='name'>" + esc(l.source)
    + (l.derivation ? " <span class='dim'>· " + esc(l.derivation) + "</span>" : "")
    + "</td><td style='color:var(--ok)'>" + l.produits + "</td>"
    + "<td>" + l.retenus + "</td><td class='sansobjet'>" + l.ecartes + "</td>"
    + "<td class='sansobjet'>"
    + esc(Object.entries(l.motifs_ecart || {}).map(([k, n]) => n + " " + k).join(" · "))
    + "</td></tr>").join("");

  $("generateur").innerHTML =
    '<div class="chiffres">'
    + chiffre("candidates PRODUITES", b.produits || 0, "var(--ok)")
    + chiffre("retenues", b.retenus || 0)
    + chiffre("écartées", b.ecartes || 0)
    /* Le chiffre qui dit ce que la génération coûte VRAIMENT en sévérité :
       c'est lui qui entre au dénominateur, pas « produites ». Quatre-vingt-cinq
       candidates pour soixante-huit familles veut dire que les dérivations
       ont surtout creusé deux cellules. */
    + chiffre("familles", b.familles != null ? b.familles : "—",
              b.familles != null && b.familles < (b.retenus || 0)
                ? "var(--warn)" : undefined)
    + chiffre("lots", b.lots || 0)
    + "</div>"
    + "<h3 style='font:700 10px var(--f-mono);letter-spacing:.12em;"
    + "text-transform:uppercase;color:var(--muted);margin:14px 0 6px'>Sources</h3>"
    + "<table><thead><tr><th>Source</th><th>Ce que c'est</th><th>État</th>"
    + "<th>Motif</th></tr></thead><tbody>" + sources + "</tbody></table>"
    + (lots
      ? "<h3 style='font:700 10px var(--f-mono);letter-spacing:.12em;"
        + "text-transform:uppercase;color:var(--muted);margin:14px 0 6px'>"
        + "Derniers lots</h3>"
        + "<table><thead><tr><th>Source</th><th>Produites</th><th>Retenues</th>"
        + "<th>Écartées</th><th>Motifs</th></tr></thead><tbody>"
        + lots + "</tbody></table>"
      : "<div class='empty'>Aucun lot. <code>python scripts/generateur.py "
        + "--catalogue</code></div>");
}

/* Le testeur affiche ses quatre étages ET lesquels tournent. Un écran qui les
   listerait sans le dire laisserait croire que « argent réel » est à un clic
   — alors que le testeur le refuse, délibérément : un second chemin vers
   l'argent réel est un chemin de trop. */
function rendreTesteur(t) {
  if (!t) { $("testeur").innerHTML = ""; return; }
  $("testBadge").textContent = t.campagnes + " campagne(s)";
  $("testBadge").style.color = t.campagnes ? "var(--ok)" : "var(--muted)";

  const etages = (t.etages || []).map((e) =>
    "<tr><td class='name'>" + esc(e.cle) + "</td><td>" + esc(e.quoi) + "</td>"
    + "<td><span class='tag " + (e.tourne ? "ok'>tourne" : "ko'>ne tourne pas")
    + "</span></td><td class='sansobjet'>" + esc(e.reserve) + "</td></tr>").join("");

  const strats = (t.par_strategie || []).map((s) =>
    "<tr><td class='name'>" + esc(s.strategie) + "</td>"
    + "<td>" + s.campagnes + "</td><td>" + s.cellules + "</td>"
    + "<td style='color:var(--warn)'>" + s.denominateur + "</td>"
    + "<td style='color:" + (s.deployables ? "var(--ok)" : "var(--crit)") + "'>"
    + s.deployables + "</td>"
    + "<td class='sansobjet'>"
    + esc(Object.entries(s.etages || {}).map(([k, n]) => k + "×" + n).join(" · "))
    + "</td></tr>").join("");

  $("testeur").innerHTML =
    "<table><thead><tr><th>Étage</th><th>Ce que c'est</th><th>État</th>"
    + "<th>Réserve</th></tr></thead><tbody>" + etages + "</tbody></table>"
    + '<div class="chiffres" style="margin-top:12px">'
    + chiffre("hypothèses dépensées", t.denominateur_total || 0, "var(--warn)")
    + chiffre("campagnes", t.campagnes || 0)
    + "</div>"
    + (strats
      ? "<table style='margin-top:10px'><thead><tr><th>Stratégie</th>"
        + "<th>Campagnes</th><th>Cellules</th><th>Dénominateur</th>"
        + "<th>Déployables</th><th>Étages</th></tr></thead><tbody>"
        + strats + "</tbody></table>"
      : "<div class='empty'>Aucune campagne. <code>python scripts/testeur.py "
        + "--strategie supertrend</code></div>");
}

/* La bibliothèque, avec sa recherche. Le tri par défaut est la RARETÉ et non
   le rendement : la colonne qui donne envie est celle qui ne doit pas décider
   de l'ordre. */
let bibEtat = { texte: "", origine: "", rarete_min: "", trie_par: "rarete" };

function rendreBiblio(b) {
  if (!b) { $("biblio").innerHTML = ""; return; }
  $("bibBadge").textContent = b.filtrees + " / " + b.total;
  $("bibBadge").style.color = "var(--muted)";

  const f = b.facettes || {};
  const opt = (liste, sel, vide) =>
    "<option value=''>" + vide + "</option>"
    + (liste || []).map((x) => "<option value='" + esc(x) + "'"
        + (x === sel ? " selected" : "") + ">" + esc(x) + "</option>").join("");

  $("biblioFiltres").innerHTML =
    "<div style='display:flex;gap:8px;flex-wrap:wrap;align-items:center'>"
    + "<input id='bibTexte' type='search' placeholder='stratégie, actif, auteur…' "
    + "value='" + esc(bibEtat.texte) + "' "
    + "style='flex:1;min-width:180px;padding:5px 8px;font:12px var(--f-mono)'>"
    + "<select id='bibOrigine'>" + opt(f.origines, bibEtat.origine, "toutes origines") + "</select>"
    + "<select id='bibRarete'>" + opt(b.raretes, bibEtat.rarete_min, "toute rareté") + "</select>"
    + "<select id='bibTri'>"
    + "<option value='rarete'" + (bibEtat.trie_par === "rarete" ? " selected" : "") + ">tri : rareté</option>"
    + "<option value='note'" + (bibEtat.trie_par === "note" ? " selected" : "") + ">tri : note</option>"
    + "<option value='vs_buy_hold'" + (bibEtat.trie_par === "vs_buy_hold" ? " selected" : "") + ">tri : vs B&amp;H</option>"
    + "<option value='rendement'" + (bibEtat.trie_par === "rendement" ? " selected" : "") + ">tri : rendement</option>"
    + "</select></div>";

  const majeur = () => {
    bibEtat.texte = $("bibTexte").value;
    bibEtat.origine = $("bibOrigine").value;
    bibEtat.rarete_min = $("bibRarete").value;
    bibEtat.trie_par = $("bibTri").value;
    chargerBiblio();
  };
  $("bibTexte").addEventListener("input", majeur);
  for (const id of ["bibOrigine", "bibRarete", "bibTri"])
    $(id).addEventListener("change", majeur);

  const l = b.cartes || [];
  $("biblio").innerHTML = l.length
    ? "<table><thead><tr><th>Stratégie</th><th>Act</th><th>TF</th>"
      + "<th>Note</th><th>Rareté</th><th>%/an</th><th>vs B&amp;H</th>"
      + "<th>Trades</th><th>Épreuve</th><th>Testé</th><th>Provenance</th>"
      + "</tr></thead><tbody>"
      + l.map((c) =>
        "<tr><td class='name'>" + esc(c.strategie) + "</td>"
        + "<td>" + esc(c.actif) + "</td><td>" + esc(c.intervalle) + "</td>"
        + "<td>" + (c.note === null || c.note === undefined ? "—"
            : "<span class='tag " + (c.deployable ? "ok" : "ko") + "'>"
              + Number(c.note).toFixed(1) + "</span>") + "</td>"
        + "<td title='" + esc(c.rarete_motif || "") + "'>" + esc(c.rarete) + "</td>"
        + "<td>" + (c.annualise_pct === null || c.annualise_pct === undefined
            ? "—" : Number(c.annualise_pct).toFixed(1) + " %") + "</td>"
        + "<td style='color:" + ((c.vs_buy_hold || 0) > 0 ? "var(--ok)" : "var(--crit)") + "'>"
        + (c.vs_buy_hold === null || c.vs_buy_hold === undefined
            ? "—" : Number(c.vs_buy_hold).toFixed(1)) + "</td>"
        + "<td>" + (c.trades === null || c.trades === undefined ? "—" : c.trades) + "</td>"
        + "<td><span class='tag " + (c.epreuve === "RETENUE" ? "ok" : "ko") + "'>"
        + esc(c.epreuve || "—") + "</span></td>"
        + "<td class='sansobjet'>"
        + ((c.tests && c.tests.cellules)
            ? c.tests.cellules + " cellule(s) · " + c.tests.campagnes + " camp."
            : "—") + "</td>"
        + "<td class='sansobjet'>" + esc(c.origine)
        + (c.auteur ? " · " + esc(c.auteur) : "") + "</td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucune carte ne correspond.</div>';
}

async function chargerBiblio() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(bibEtat)) if (v) q.set(k, v);
  try {
    const r = await fetch("/api/bibliotheque?" + q.toString());
    if (r.ok) rendreBiblio(await r.json());
  } catch (e) { /* le panneau garde son contenu */ }
}

function rendreVols(v) {
  v = v || {};
  marquer("vols", v.executions, v.executions ? "ok" : "bad");
  if (v.aucun_vol) {
    $("pnlBadge").textContent = "aucun vol";
    $("pnlBadge").style.color = "var(--crit)";
    // Une ligne plate a zero se lirait « on a tradé et fait zéro ». C'est faux,
    // et c'est exactement le mensonge par omission que ce panneau doit eviter.
    $("pnl").innerHTML = rien("Aucun vol effectué", esc(v.pourquoi || ""));
    $("historique").innerHTML = rien("Historique vide",
      "Aucun ordre n'a jamais été passé. Ce tableau se remplira au premier "
      + "mandat émis — pas avant, et rien n'y sera simulé.");
    return;
  }
  $("pnlBadge").textContent = v.executions + " exécutions · " + v.mandats + " mandats";
  $("pnl").innerHTML =
    (v.pnl_indisponible
      ? '<p class="avert">P&amp;L réalisé indisponible : position ouverte sur '
        + esc((v.positions_ouvertes || []).join(", "))
        + ". Un cumul de trésorerie n'est un P&amp;L réalisé que compte à plat.</p>"
      : "")
    + courbeSVG([{ pts: v.courbe, cls: "serie" }], { zero: true, y: "pnl_usd" });

  $("historique").innerHTML = "<table><thead><tr><th>Horodatage</th><th>Actif</th>"
    + "<th>Sens</th><th>Taille</th><th>Prix</th><th>Frais</th><th>Type</th>"
    + "</tr></thead><tbody>"
    + (v.dernieres_executions || []).map((f) =>
      "<tr><td>" + clock(f.ts_ms) + "</td><td class='name'>" + esc(f.asset) + "</td>"
      + "<td>" + esc(f.side) + "</td><td>" + esc(f.size) + "</td>"
      + "<td>" + esc(f.price) + "</td><td>" + usd(f.fee_usd) + "</td>"
      + "<td>" + (f.is_maker ? "maker" : "taker") + "</td></tr>").join("")
    + "</tbody></table>";
}

/* ======================================================================== */
/*  GRAPHIQUES — SVG a la main, sans bibliotheque                           */
/* ======================================================================== */
/* Aucune dependance externe : ce serveur doit s'afficher sur un VPS sans
   acces sortant, et une bibliotheque de graphiques chargee depuis un CDN
   transforme une page de supervision en page blanche le jour ou le reseau
   est justement le probleme. Deux traces suffisent ici — une ligne et des
   barres — et les ecrire fait cinquante lignes. */

const L = 58, R = 14, H = 22, B = 30;   // marges : gauche, droite, haut, bas
const W = 1000, HT_DEF = 340;           // repere interne, mis a l'echelle par viewBox

function courbeSVG(series, opts) {
  opts = opts || {};
  const clef = opts.y || "v";
  const HT = opts.hauteur || HT_DEF;
  const tous = series.flatMap((s) => s.pts || []);
  if (tous.length < 2) {
    return '<div class="empty">Pas assez de points pour tracer une courbe.</div>';
  }
  const xs = tous.map((p) => p.ts_ms);
  const ys = tous.map((p) => Number(p[clef] !== undefined ? p[clef] : p.v));
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (opts.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 === y0) { y1 = y0 + 1; }           // serie constante : on evite /0
  if (x1 === x0) x1 = x0 + 1;

  // Echelle logarithmique quand les series ne tiennent pas ensemble en
  // lineaire. Le cas n'est pas theorique : detenir AVAX depuis 2020 monte a
  // 42 000 $ pendant qu'une strategie finit a 1 057 $. En lineaire, la
  // strategie devient une ligne plate collee a l'axe, et le graphique cesse
  // de comparer quoi que ce soit — il montre seulement que l'un des deux est
  // grand. On ne peut le faire que sur des valeurs strictement positives,
  // d'ou le repli sur le lineaire pour une courbe de P&L qui passe par zero.
  const log = !opts.zero && y0 > 0 && y1 / y0 > 20;
  const t0 = log ? Math.log10(y0) : y0;
  const t1 = log ? Math.log10(y1) : y1;
  const proj = (v) => log ? Math.log10(Math.max(v, y0)) : v;
  const marge = (t1 - t0) * 0.08;
  const a0 = t0 - marge, a1 = t1 + marge;

  const px = (t) => L + (W - L - R) * (t - x0) / (x1 - x0);
  const py = (v) => H + (HT - H - B) * (1 - (proj(v) - a0) / (a1 - a0));

  let g = "";
  for (let i = 0; i <= 4; i++) {
    const a = a0 + (a1 - a0) * i / 4;
    const v = log ? Math.pow(10, a) : a;
    const y = H + (HT - H - B) * (1 - i / 4);
    g += '<line class="grille" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1)
      + '" y2="' + y.toFixed(1) + '"/>'
      + '<text x="' + (L - 7) + '" y="' + (y + 3.2).toFixed(1) + '" text-anchor="end">'
      + esc(nf.format(Math.round(v))) + "</text>";
  }
  if (log) {
    g += '<text x="' + (W - R) + '" y="' + (H + 11) + '" text-anchor="end">'
      + "échelle logarithmique</text>";
  }
  if (opts.zero && y0 < 0 && y1 > 0) {
    g += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + py(0).toFixed(1)
      + '" y2="' + py(0).toFixed(1) + '"/>';
  }

  const jour = (t) => new Date(t).toLocaleDateString("fr-FR",
    { day: "2-digit", month: "short", year: "2-digit" });
  for (let i = 0; i <= 3; i++) {
    const t = x0 + (x1 - x0) * i / 3;
    const anchor = i === 0 ? "start" : i === 3 ? "end" : "middle";
    g += '<text x="' + px(t).toFixed(1) + '" y="' + (HT - 9) + '" text-anchor="' + anchor + '">'
      + esc(jour(t)) + "</text>";
  }

  for (const s of series) {
    const pts = (s.pts || []);
    if (pts.length < 2) continue;
    const d = pts.map((p, i) => (i ? "L" : "M") + px(p.ts_ms).toFixed(1) + " "
      + py(Number(p[clef] !== undefined ? p[clef] : p.v)).toFixed(1)).join(" ");
    g += '<path class="' + (s.cls || "serie") + '" d="' + d + '"/>';
  }

  return '<svg class="chart" viewBox="0 0 ' + W + " " + HT + '" preserveAspectRatio="none" '
    + 'role="img" aria-label="' + esc(opts.titre || "courbe") + '">' + g
    + '<line class="axe" x1="' + L + '" x2="' + L + '" y1="' + H + '" y2="' + (HT - B) + '"/>'
    + '<line class="axe" x1="' + L + '" x2="' + (W - R) + '" y1="' + (HT - B)
    + '" y2="' + (HT - B) + '"/></svg>';
}

function histogramme(seaux, seuil) {
  const HT = HT_DEF;
  if (!seaux || !seaux.length) return '<div class="empty">Aucun score relevé.</div>';
  const hmax = Math.max(...seaux.map((b) => b.n));
  const x0 = 0, x1 = 1;                     // les scores vivent dans [0, 1]
  const px = (v) => L + (W - L - R) * (v - x0) / (x1 - x0);
  const py = (n) => H + (HT - H - B) * (1 - n / hmax);
  const largeur = (W - L - R) * 0.05 - 3;

  let g = "";
  for (let i = 0; i <= 4; i++) {
    const n = hmax * i / 4, y = py(n);
    g += '<line class="grille" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1)
      + '" y2="' + y.toFixed(1) + '"/>'
      + '<text x="' + (L - 7) + '" y="' + (y + 3.2).toFixed(1) + '" text-anchor="end">'
      + Math.round(n) + "</text>";
  }
  for (const b of seaux) {
    const y = py(b.n);
    // Les barres au-dessus du seuil sont les seules qui auraient produit un
    // mandat. Les distinguer visuellement evite d'avoir a compter.
    const hors = seuil !== undefined && b.borne < seuil;
    g += '<rect class="barre' + (hors ? " hors" : "") + '" x="' + px(b.borne).toFixed(1)
      + '" y="' + y.toFixed(1) + '" width="' + largeur.toFixed(1)
      + '" height="' + (HT - B - y).toFixed(1) + '"/>';
  }
  for (let v = 0; v <= 1.0001; v += 0.1) {
    g += '<text x="' + px(v).toFixed(1) + '" y="' + (HT - 9)
      + '" text-anchor="middle">' + v.toFixed(1) + "</text>";
  }
  if (seuil !== undefined) {
    g += '<line class="seuil" x1="' + px(seuil).toFixed(1) + '" x2="' + px(seuil).toFixed(1)
      + '" y1="' + H + '" y2="' + (HT - B) + '"/>'
      + '<text x="' + (px(seuil) + 6).toFixed(1) + '" y="' + (H + 11)
      + '" style="fill:var(--crit)">seuil ' + seuil.toFixed(2) + "</text>";
  }
  return '<svg class="chart" viewBox="0 0 ' + W + " " + HT + '" preserveAspectRatio="none" '
    + 'role="img" aria-label="distribution des scores de conviction">' + g
    + '<line class="axe" x1="' + L + '" x2="' + L + '" y1="' + H + '" y2="' + (HT - B) + '"/>'
    + '<line class="axe" x1="' + L + '" x2="' + (W - R) + '" y1="' + (HT - B)
    + '" y2="' + (HT - B) + '"/></svg>';
}

/* ---------- courbe stratégie contre HODL ---------- */
function preparerSelecteurs(inv) {
  inv = inv || {};
  // La règle déployée est dans l'inventaire mais PAS dans ce sélecteur : la
  // courbe d'équité rejoue un backtest de bougies, et une règle
  // événementielle n'en a pas. L'offrir ici produisait un « backtest en
  // cours… » qui ne finissait jamais.
  const strats = (inv.strategies || []).filter((s) => !s.deployee).map((s) => s.nom);
  const actifs = inv.actifs && inv.actifs.length ? inv.actifs : ["BTC"];
  const ivs = inv.intervalles && inv.intervalles.length ? inv.intervalles : ["1d"];
  const opts = (xs) => xs.map((x) => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("");
  if (!$("cbStrat").options.length) {
    $("cbStrat").innerHTML = opts(strats);
    $("cbActif").innerHTML = opts(actifs);
    $("cbIv").innerHTML = opts(ivs);
    // BTC par defaut : c'est l'actif sur lequel toutes les campagnes du
    // depot ont ete lues, donc celui dont le lecteur a la reference en tete.
    if (actifs.includes("BTC")) $("cbActif").value = "BTC";
    if (ivs.includes("1d")) $("cbIv").value = "1d";
    for (const id of ["cbStrat", "cbActif", "cbIv"]) {
      $(id).addEventListener("change", tracerCourbe);
    }
  }
}

let courbeEnCours = null;
async function tracerCourbe() {
  const strategie = $("cbStrat").value, actif = $("cbActif").value, intervalle = $("cbIv").value;
  if (!strategie) return;
  const clef = strategie + "/" + actif + "/" + intervalle;
  if (courbeEnCours === clef) return;
  courbeEnCours = clef;
  $("courbe").innerHTML = '<div class="empty">Backtest en cours…</div>';
  try {
    const r = await fetch("/api/courbe?strategie=" + encodeURIComponent(strategie)
      + "&actif=" + encodeURIComponent(actif) + "&intervalle=" + encodeURIComponent(intervalle));
    const d = await r.json();
    if (!r.ok) {
      $("courbe").innerHTML = rien("Courbe indisponible", esc(d.detail || "erreur " + r.status));
      return;
    }
    // Une courbe issue de zero trade n'est pas un resultat de strategie :
    // c'est l'equite de depart, inchangee. La tracer a cote de « detenir
    // l'actif » la ferait lire comme une defaite.
    if (d.sans_trade) {
      $("courbe").innerHTML = rien("Aucun trade",
        esc(strategie) + " n'a pris aucune position sur " + esc(actif) + " "
        + esc(intervalle) + ", et " + d.rejets + " entrées ont été refusées par "
        + "le dimensionnement. Il n'y a pas de courbe à tracer — une ligne "
        + "plate se lirait comme une défaite.");
      return;
    }
    const gain = d.strategie_finale - d.equite_initiale;
    const gainRef = d.hodl_final - d.equite_initiale;
    $("courbe").innerHTML =
      '<div class="legende"><span><i class="s"></i>' + esc(strategie) + " · "
      + usd(gain) + " en " + d.trades + " trades</span>"
      + '<span><i class="r"></i>détenir ' + esc(actif) + " · " + usd(gainRef) + "</span>"
      + "<span>" + d.barres + " barres · frais " + usd(d.frais_usd)
      + " · funding " + usd(d.funding_usd) + "</span></div>"
      + courbeSVG([{ pts: d.hodl, cls: "ref" }, { pts: d.courbe, cls: "serie" }],
                  { titre: strategie + " contre détenir " + actif })
      // Sur un actif qui a fait +1 000 %, la strategie devient une ligne
      // plate collee a l'axe : c'est la VERITE de la comparaison, et il faut
      // la garder telle quelle. Mais elle efface la forme propre de la
      // strategie — ses creux, le moment ou elle a trade. D'ou un second
      // trace, a sa propre echelle, clairement annonce comme tel. Un axe
      // secondaire sur le meme graphique produirait le meme resultat en
      // laissant croire que les deux courbes se comparent visuellement.
      + '<div class="legende" style="border-top:1px solid var(--line-soft);'
      + 'margin-top:14px;padding-top:12px"><span>La même courbe de '
      + esc(strategie) + ", à sa propre échelle — les deux graphiques ne se "
      + "comparent pas entre eux.</span></div>"
      + courbeSVG([{ pts: d.courbe, cls: "serie" }],
                  { titre: strategie + " seule", hauteur: 200 })
      + '<div class="verdict' + (gain > gainRef ? "" : " bloc") + '"><span class="gros">'
      + (gain > gainRef ? "La stratégie bat la détention"
                        : "La détention bat la stratégie")
      + "</span>" + usd(gain) + " contre " + usd(gainRef)
      + ", même période, mêmes frais. La référence n'a <b>pas de stop</b> : "
      + "lui en imposer un la ferait sortir à la première secousse et "
      + "flatterait tout ce qu'on lui compare."
      + "</div>";
  } catch (e) {
    $("courbe").innerHTML = rien("Courbe indisponible", "Le serveur n'a pas répondu.");
  } finally {
    courbeEnCours = null;
  }
}

/* ---------- transport ---------- */
// SSE en primaire, polling en secours. Une interface de supervision qui se tait
// quand le transport tombe est pire qu'inutile : d'ou la banniere "offline",
// qui dit explicitement que les valeurs affichees sont figees.
function setOffline(v) {
  if (offline === v) return;
  offline = v;
  $("offline").hidden = !v;
}

function connect() {
  let es;
  try { es = new EventSource("/api/stream"); } catch (e) { return poll(); }
  es.onmessage = (ev) => {
    try { render(JSON.parse(ev.data)); setOffline(false); } catch (e) { /* trame partielle */ }
  };
  es.onerror = () => {
    setOffline(true);
    es.close();
    setTimeout(connect, 2000);
  };
}

async function poll() {
  try {
    const r = await fetch("/api/snapshot");
    render(await r.json());
    setOffline(false);
  } catch (e) { setOffline(true); }
  setTimeout(poll, 2000);
}

/* ---------- demarrage ---------- */
connect();
loadJournal();
setInterval(loadJournal, 10000);

// Les panneaux de recherche lisent des fichiers : une minute suffit
// largement, et la page reste utilisable si le serveur ne repond jamais.
let secteurInitial = "prevol";
try {
  const vu = localStorage.getItem("desk-secteur");
  if (vu && SECTEURS.some(([id]) => id === vu)) secteurInitial = vu;
} catch (e) { /* stockage indisponible : on ouvre sur le pre-vol */ }
montrer(secteurInitial);

/* Les commandes de l'atelier. Liées une fois, ici, comme le reste : les
   contenus du formulaire sont reconstruits à chaque chargement du catalogue,
   mais ces trois boutons ne le sont pas. */
$("atStrat").addEventListener("change", (ev) => {
  atChoix.strategie = ev.target.value;
  rendreParamsAtelier();
});
$("atLancer").addEventListener("click", atLancer);
$("atArreter").addEventListener("click", async () => {
  await post("/api/campagnes/arreter", {});
  atSuivre();
});

chargerRecherche();
setInterval(chargerRecherche, 60000);
/* Un essai lancé depuis une autre fenêtre — ou avant un rechargement de
   page — doit se voir ici aussi. Sans ce premier appel, le bouton resterait
   actif et un second lancement se ferait refuser sans qu'on sache pourquoi. */
atSuivre();

// Surface publique. Volontairement minuscule : tout ce qui depasse d'ici
// serait une seconde implementation de la meme chose.
//
// Elle servait au poste photographique, qui greffait son habillage dessus.
// Ce poste-la n'existe plus — le poste actuel charge cette page dans une
// iframe et n'a rien a greffer. La surface reste parce qu'elle EST la
// couture : meme origine, donc `frame.contentWindow.Desk` depuis le poste
// si un jour il faut lui parler. Un habillage qui irait chercher dans les
// entrailles de ce fichier serait la vraie dette.
window.Desk = {
  usd, usdFin, dur, clock, esc, pct, num, courbeSVG, histogramme, post,
  get snapshot() { return snap; },
  get recherche() { return rech; },
  montrer, secteurs: SECTEURS,
};
