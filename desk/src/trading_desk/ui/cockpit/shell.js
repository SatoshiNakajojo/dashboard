/* Poste de pilotage — assemblage des couches.
 *
 * Ce fichier ne connait AUCUNE regle metier. Il pose des rectangles, joue un
 * ciel, et cable des boutons sur des fonctions qui existent deja dans
 * `desk.js`. Toute la logique — invariants, mandats, campagnes, courbes —
 * reste ou elle est. Le cockpit est un habillage, pas une seconde
 * application : le jour ou une regle se met a vivre ici, les deux ecrans du
 * meme desk commenceront a diverger.
 *
 * Les donnees arrivent par evenement (`desk:snapshot`, `desk:recherche`),
 * emis par `desk.js` a chaque trame. Le cockpit ne redemande jamais rien.
 */

"use strict";

(function () {
  const CHEMIN = "/ui/cockpit/";
  let CARTE = null;                 // hotspots.json
  const stage = document.getElementById("cockpit");
  if (!stage) return;

  const $$ = (sel, ctx) => (ctx || document).querySelector(sel);
  const creer = (balise, cls, parent) => {
    const el = document.createElement(balise);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  };
  const poser = (el, r) => {
    el.style.left = r.l + "%"; el.style.top = r.t + "%";
    el.style.width = r.w + "%"; el.style.height = r.h + "%";
  };

  /* ------------------------------------------------------------------ ciel */

  /* Un champ d'etoiles en perspective. L'observateur avance en ligne droite :
   * chaque etoile a une profondeur z qui decroit, et sa projection s'ecarte
   * du point de fuite d'autant plus vite qu'elle est proche. C'est ce qui
   * distingue une croisiere d'un saut en hyperespace — pas la vitesse, mais
   * l'absence de trainees. On dessine des points, jamais des segments. */
  function starfield(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    const N = 420;
    let etoiles = [], w = 0, h = 0, rafId = null, dernier = 0;

    function taille() {
      const r = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.round(r.width));
      h = canvas.height = Math.max(1, Math.round(r.height));
    }
    function semer() {
      etoiles = Array.from({ length: N }, () => ({
        x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2,
        z: Math.random() * 0.98 + 0.02,
        t: Math.random(),                      // teinte : blanc a bleu pale
      }));
    }
    function dessine(dt) {
      ctx.fillStyle = "#04070c";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.46;         // point de fuite, legerement haut
      for (const s of etoiles) {
        s.z -= dt * 0.16;
        if (s.z <= 0.02) {                     // depassee : on la resseme au fond
          s.x = (Math.random() - .5) * 2; s.y = (Math.random() - .5) * 2;
          s.z = 1; s.t = Math.random();
        }
        const k = 0.5 / s.z;
        const x = cx + s.x * k * w, y = cy + s.y * k * h;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        const r = Math.min(1.9, (1 - s.z) * 2.1);
        const a = Math.min(1, (1 - s.z) * 1.5);
        ctx.globalAlpha = a;
        ctx.fillStyle = s.t > .78 ? "#bcd4ff" : (s.t > .55 ? "#dfe9f5" : "#ffffff");
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function boucle(t) {
      const dt = Math.min(0.05, (t - dernier) / 1000 || 0.016);
      dernier = t;
      dessine(dt);
      rafId = requestAnimationFrame(boucle);
    }

    taille(); semer();
    const fige = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fige) { dessine(0); }
    else { rafId = requestAnimationFrame(boucle); }

    // Onglet cache : on rend la main. Un champ d'etoiles qui tourne dans un
    // onglet invisible consomme une batterie pour personne.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; }
      else if (!rafId && !fige) { dernier = performance.now();
                                  rafId = requestAnimationFrame(boucle); }
    });
    addEventListener("resize", () => { taille(); });
    return { arreter() { cancelAnimationFrame(rafId); } };
  }

  function pareBrise(fit) {
    const vp = creer("div", "viewport", fit);
    vp.style.clipPath = CARTE.glass.clip;
    vp.setAttribute("aria-hidden", "true");

    const canvas = creer("canvas", null, vp);
    canvas.id = "starfield";
    const champ = starfield(canvas);

    // La video est la source de verite du ciel quand elle existe. Le canvas
    // reste dessous : il couvre le premier dixieme de seconde, l'absence de
    // fichier, et `prefers-reduced-motion`.
    const fige = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = document.createElement("video");
    v.id = "space-loop";
    v.src = CHEMIN + "assets/space-loop.mp4";
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = !fige;
    v.preload = "auto";
    v.addEventListener("loadeddata", () => {
      vp.appendChild(v);
      champ.arreter();
      canvas.remove();
      if (fige) { v.pause(); v.currentTime = 0.1; }
    });
    v.addEventListener("error", () => { /* le canvas tient le role */ });
    document.addEventListener("visibilitychange", () => {
      if (!v.isConnected) return;
      if (document.hidden) v.pause(); else if (!fige) v.play().catch(() => {});
    });
    return vp;
  }

  /* -------------------------------------------------------------- calibrage */

  function couche_debug(fit) {
    const d = creer("div", "debug-layer", fit);
    const ajouter = (r, cls, nom) => {
      const b = creer("div", "debug-box " + cls, d);
      poser(b, r);
      creer("span", null, b).textContent =
        `${nom} ${r.l}/${r.t} ${r.w}×${r.h}`;
    };
    for (const [k, r] of Object.entries(CARTE.screens)) ajouter(r, "", k);
    for (const [k, r] of Object.entries(CARTE.hotspots)) ajouter(r, "hs", k);
    for (const [k, r] of Object.entries(CARTE.leds)) ajouter(r, "led", k);
    for (const [k, r] of Object.entries(CARTE.hotas)) ajouter(r, "hs", k);
    for (const [k, r] of Object.entries(CARTE.pilot)) ajouter(r, "", k);
    return d;
  }

  /* ------------------------------------------------------------ assemblage */

  async function demarrer() {
    CARTE = await fetch(CHEMIN + "hotspots.json").then((r) => r.json());

    const fit = creer("div", "cockpit-fit", stage);

    const photo = creer("img", "cockpit-photo", fit);
    photo.alt = "";
    photo.src = CHEMIN + "assets/cockpit.jpg";
    photo.addEventListener("error", () => manquePhoto(fit));

    pareBrise(fit);

    const ecrans = creer("div", "screens-layer", fit);
    const hotspots = creer("div", "hotspots-layer", fit);
    const fx = creer("div", "fx-layer", fit);

    const mains = creer("img", "pilot-fg", fit);
    mains.alt = "";
    mains.src = CHEMIN + "assets/pilot-foreground.png";
    mains.addEventListener("error", () => { mains.remove(); });

    const hotas = creer("div", "hotspots-pilot", fit);
    couche_debug(fit);

    // Les modules d'ecrans et de boutons vivent dans leurs fichiers. Le shell
    // ne fait que leur donner leur couche et la carte.
    window.Cockpit = { CARTE, fit, ecrans, hotspots, fx, hotas, poser, creer, $$ };
    if (window.CockpitEcrans) window.CockpitEcrans.monter();
    if (window.CockpitBoutons) window.CockpitBoutons.monter();

    // Calibrage : D bascule l'overlay. Reste dans le code, exprès — c'est
    // avec lui qu'on recale les rectangles quand la photo change.
    const parametres = new URLSearchParams(location.search);
    if (parametres.get("debug") === "1" ||
        localStorage.getItem("cockpit-debug") === "1") {
      stage.classList.add("debug");
    }
    addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "d" || e.key === "D") {
        const on = stage.classList.toggle("debug");
        try { localStorage.setItem("cockpit-debug", on ? "1" : "0"); } catch (_) {}
      }
      if (e.key === "`") basculerHud();
    });

    if (localStorage.getItem("cockpit-hud") === "1") stage.classList.add("hud");
  }

  function basculerHud() {
    const on = stage.classList.toggle("hud");
    try { localStorage.setItem("cockpit-hud", on ? "1" : "0"); } catch (_) {}
  }
  window.cockpitHud = basculerHud;

  /* La photo est le chrome : sans elle, le cockpit n'existe pas. On le dit
   * franchement plutot que d'afficher des rectangles flottant sur du noir. */
  function manquePhoto(fit) {
    if ($$(".sans-photo", fit)) return;
    const w = creer("div", "sans-photo", fit);
    const d = creer("div", null, w);
    d.innerHTML =
      "<b>Photo du cockpit absente</b>" +
      "Le chrome de cette interface est une photographie, pas du CSS. " +
      "Sans elle il n'y a ni métal, ni biseaux, ni mains — seulement des " +
      "rectangles sur du noir.<br><br>Déposer le fichier ici :<br>" +
      "<code>desk/src/trading_desk/ui/cockpit/assets/cockpit.jpg</code>" +
      "<br><br>Les écrans, les boutons et le ciel fonctionnent déjà : " +
      "fermer ce message pour les voir, ou appuyer sur <code>D</code> pour " +
      "afficher le calibrage.";
    const b = creer("button", null, d);
    b.type = "button";
    b.textContent = "Continuer sans la photo";
    b.addEventListener("click", () => w.remove());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else { demarrer(); }
})();
