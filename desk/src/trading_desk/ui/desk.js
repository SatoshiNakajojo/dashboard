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

  /* --- tuiles --- */
  const a = s.account;
  const pnl = a && a.day_pnl_usd !== null && a.day_pnl_usd !== undefined ? Number(a.day_pnl_usd) : null;
  const tiles = [
    { k: "Équité", v: a ? usd(a.equity_usd) : "—",
      s: a ? "marge libre " + usd(a.available_margin_usd) : "compte non reconcilié" },
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
        "<tr><td class='name'>" + esc(p.asset) + "</td><td>" + esc(p.side) + "</td>"
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
  rendreConsommation(d.consommation);
  rendreVols(d.vols);
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

  const reste = Math.max(0, n.seuil_conclusion - n.closes);
  const barre = '<div class="verdict"><span class="gros">'
    + n.closes + " / " + n.seuil_conclusion + " fenêtres closes</span>"
    + (reste
      ? "Le journal <b>refuse de conclure</b> sous " + n.seuil_conclusion
        + " événements résolus : il en manque " + reste
        + ". Conclure plus tôt reviendrait à lire du bruit."
        + (n.prochaine_fermeture ? " Prochaine fermeture le <b>" + esc(n.prochaine_fermeture) + "</b>." : "")
      : "Le seuil est atteint : le verdict est calculable.")
    + '<br><br><code style="font-family:var(--f-mono);font-size:11px">'
    + esc(n.resolution) + "</code></div>";

  $("navigation").innerHTML = barre + '<div class="tscroll"><table><thead><tr>'
    + "<th>Jeton</th><th>Sens</th><th>Part offre</th><th>Déblocage</th>"
    + "<th>Entrée</th><th>Sortie</th><th>Réf</th><th>État</th></tr></thead><tbody>"
    + n.positions.map((p) =>
      "<tr><td class='name'>" + esc(p.symbole) + "</td><td>" + esc(p.sens) + "</td>"
      + "<td>" + pct(p.part_offre * 100) + "</td><td>" + esc(p.deblocage) + "</td>"
      + "<td>" + esc(p.entree) + "</td><td>" + esc(p.sortie) + "</td>"
      + "<td>" + esc(p.reference) + "</td>"
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

function chiffre(k, v, couleur) {
  return "<div><span class='k'>" + k + "</span><span class='v'"
    + (couleur ? " style='color:" + couleur + "'" : "") + ">"
    + (v === null || v === undefined ? "—" : esc(v)) + "</span></div>";
}

function rendreInventaire(inv) {
  inv = inv || {};
  const lignes = inv.strategies || [];
  $("inventaire").innerHTML = lignes.length
    ? "<table><thead><tr><th>Stratégie</th><th>Cellules</th><th>Gagnantes</th>"
      + "<th>Net médian</th><th>p min</th><th>Pires que hasard</th><th>BH</th>"
      + "</tr></thead><tbody>"
      + lignes.map((s) =>
        "<tr><td class='name'>" + esc(s.nom)
        + "<div style='font-family:var(--f-ui);font-weight:400;font-size:11.5px;"
        + "color:var(--muted);max-width:34ch;line-height:1.4;margin-top:2px'>"
        + esc(s.resume || "") + "</div></td>"
        + "<td>" + (s.jamais_testee ? "<span class='tag ko'>jamais testée</span>" : s.cellules) + "</td>"
        + "<td>" + s.gagnantes + "</td>"
        + "<td style='color:" + (Number(s.net_median) >= 0 ? "var(--ok)" : "var(--crit)") + "'>"
        + usd(s.net_median) + "</td>"
        + "<td>" + num(s.p_min, 4) + "</td>"
        + "<td" + (s.pires_que_hasard ? " style='color:var(--crit)'" : "") + ">"
        + s.pires_que_hasard + "</td>"
        + "<td><span class='tag " + (s.survit_bh ? "ok'>survit" : "ko'>non") + "</span></td></tr>").join("")
      + "</tbody></table>"
    : '<div class="empty">Aucune stratégie.</div>';
}

/* ---------- CONSOMMATION ---------- */
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
  const strats = (inv.strategies || []).map((s) => s.nom);
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

chargerRecherche();
setInterval(chargerRecherche, 60000);

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
