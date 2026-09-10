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
    const N = 1400;
    let etoiles = [], w = 0, h = 0, rafId = null, dernier = 0;

    function taille() {
      const r = canvas.getBoundingClientRect();
      fond = null;
      w = canvas.width = Math.max(1, Math.round(r.width));
      h = canvas.height = Math.max(1, Math.round(r.height));
    }
    function semer() {
      etoiles = Array.from({ length: N }, () => ({
        x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2,
        // Une profondeur tiree uniformement laisse presque tout le champ
        // au fond, donc invisible : le pare-brise devenait un trou noir.
        // La racine ramene les etoiles vers l'avant.
        z: Math.pow(Math.random(), 0.55) * 0.96 + 0.04,
        t: Math.random(),                      // teinte : blanc a bleu pale
      }));
    }
    let fond = null;
    function dessine(dt) {
      // Le vide n'est pas noir : une nappe tres sombre autour du point de
      // fuite empeche le pare-brise de se lire comme un rectangle eteint.
      if (!fond) {
        fond = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46,
                                        Math.max(w, h) * 0.75);
        fond.addColorStop(0, "#0b1420");
        fond.addColorStop(0.45, "#060b12");
        fond.addColorStop(1, "#020407");
      }
      ctx.fillStyle = fond;
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
        const r = Math.min(1.9, 0.45 + (1 - s.z) * 1.9);
        const a = Math.min(1, 0.3 + (1 - s.z) * 1.35);
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

    /* Les mains ne sont plus recomposees.
     *
     * On posait par-dessus tout un PNG detoure des deux avant-bras, pour que
     * les dalles passent derriere eux. Cette image reprend des pixels de la
     * photo et les repose sur eux-memes : au moindre ecart d'alignement, ou
     * partout ou le detourage n'etait pas franc, le decor se dedoublait — le
     * halo bleuatre qui suivait le contour du manche, visible a la loupe.
     *
     * La photo contient deja les mains, nettes, a leur place. Il suffit donc
     * de PERCER les deux dalles qu'elles traversent : plus rien n'est
     * recompose, et le bord des gants est celui du JPEG, au pixel. Le PNG ne
     * sert plus qu'au mode HUD, ou les mains doivent s'effacer. */
    const hotas = creer("div", "hotspots-pilot", fit);
    couche_debug(fit);

    // Les modules d'ecrans et de boutons vivent dans leurs fichiers. Le shell
    // ne fait que leur donner leur couche et la carte.
    window.Cockpit = { CARTE, CHEMIN, fit, ecrans, hotspots, fx, hotas,
                       poser, creer, metal, $$ };
    if (window.CockpitEcrans) window.CockpitEcrans.monter();
    if (window.CockpitInstruments) window.CockpitInstruments.monter();
    if (window.CockpitBoutons) window.CockpitBoutons.monter();

    // Calibrage : D bascule l'overlay. Reste dans le code, exprès — c'est
    // avec lui qu'on recale les rectangles quand la photo change.
    // Une lecture de `localStorage` LEVE dans une fenetre privee ou quand le
    // navigateur bloque les donnees de site. Non gardee, elle tuait le script
    // entier — donc le cockpit — pour une preference d'affichage.
    const garde = (cle) => {
      try { return localStorage.getItem(cle); } catch (_) { return null; }
    };
    const parametres = new URLSearchParams(location.search);
    if (parametres.get("debug") === "1" || garde("cockpit-debug") === "1") {
      stage.classList.add("debug");
    }
    loupe(stage, fit);

    addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "d" || e.key === "D") {
        const on = stage.classList.toggle("debug");
        try { localStorage.setItem("cockpit-debug", on ? "1" : "0"); } catch (_) {}
      }
      if (e.key === "`") basculerHud();
    });

    if (garde("cockpit-hud") === "1") stage.classList.add("hud");
  }

  /* La loupe.
   *
   * Un cockpit se lit de pres : on doit pouvoir s'approcher d'un bloc comme
   * on approche la tete d'un instrument. On agrandit le plateau ENTIER et on
   * le recadre sur le bloc — photo, dalles, aiguilles et boutons montent
   * ensemble, donc rien ne se decale et les boutons restent cliquables a leur
   * place. C'est aussi pourquoi les cadrans et les inverseurs sont des SVG :
   * eux restent nets a n'importe quel grossissement.
   *
   * Double-clic pour entrer sur le bloc vise, encore pour ressortir. Les
   * touches 1 a 8 vont directement a un bloc, Echap revient.
   */
  function loupe(stage, fit) {
    const blocs = CARTE.blocs || {};
    const cles = Object.keys(blocs);
    if (!cles.length) return;
    let courant = null;

    const nom = creer("div", "loupe-nom", stage);
    nom.hidden = true;

    function poserVue(cle) {
      courant = cle;
      if (!cle) {
        fit.style.transform = "none";
        nom.hidden = true;
        stage.classList.remove("loupe");
        return;
      }
      const b = blocs[cle];
      // On garde le bloc entier a l'ecran : le plus contraignant des deux
      // rapports decide, sinon un bloc large deborderait en hauteur.
      const k = Math.min(100 / b.w, 100 / b.h);
      // Borne le recadrage : au bord de la photo, un bloc tire la vue au-dela
      // du plateau et laisse une bande noire. Le plateau couvre toujours
      // l'ecran.
      const borne = (v) => Math.max(100 - 100 * k, Math.min(0, v));
      const tx = borne(50 - k * (b.l + b.w / 2));
      const ty = borne(50 - k * (b.t + b.h / 2));
      fit.style.transformOrigin = "0 0";
      fit.style.transform = `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) `
                          + `scale(${k.toFixed(4)})`;
      nom.textContent = b.nom + "  ·  Échap pour revenir";
      nom.hidden = false;
      stage.classList.add("loupe");
    }

    // Quel bloc contient ce point ? Le rectangle client de `fit` suit la
    // transformation, donc le rapport rend directement la coordonnee dans le
    // plateau, zoome ou non.
    function blocSous(ev) {
      const r = fit.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width * 100;
      const y = (ev.clientY - r.top) / r.height * 100;
      return cles.find((c) => {
        const b = blocs[c];
        return x >= b.l && x <= b.l + b.w && y >= b.t && y <= b.t + b.h;
      });
    }

    stage.addEventListener("dblclick", (ev) => {
      if (ev.target.closest("#campagnes, #panneaux")) return;
      if (courant) { poserVue(null); return; }
      const c = blocSous(ev);
      if (c) poserVue(c);
    });
    addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "Escape" && courant) { poserVue(null); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= cles.length) {
        poserVue(cles[n - 1] === courant ? null : cles[n - 1]);
      }
    });
    window.cockpitLoupe = poserVue;
  }

  /* Echantillonner le metal de la photo.
   *
   * Toute piece qu'on pose sur le tableau de bord — une etiquette gravee, le
   * cache d'un inverseur — doit prendre la couleur exacte du metal qu'elle
   * recouvre. Choisie a l'oeil, elle se voit ; relevee sur le JPEG, elle
   * disparait. Une seule lecture de l'image sert a tout le monde.
   */
  let toile = null, toilePrete = null;
  function metal(el, r) {
    if (!toilePrete) {
      toilePrete = new Promise((ok) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 1280; c.height = 800;
          const x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(img, 0, 0, 1280, 800);
          toile = x; ok(x);
        };
        img.onerror = () => ok(null);
        img.src = CHEMIN + "assets/cockpit.jpg";
      });
    }
    toilePrete.then((x) => {
      if (!x) return;
      const px = Math.round(r.l * 12.8), py = Math.round(r.t * 8);
      const w = Math.max(4, Math.round(r.w * 12.8));
      const h = Math.max(4, Math.round(r.h * 8));
      // Trois bandes de metal nu : a gauche, a droite, en dessous. Au-dessus
      // d'une piece il y a souvent un bandeau sombre, qui fausserait tout.
      const t = [];
      const prendre = (a, b, lw, lh) => {
        if (a < 0 || b < 0 || a + lw > 1280 || b + lh > 800) return;
        const p = x.getImageData(a, b, lw, lh).data;
        for (let i = 0; i < p.length; i += 4) t.push([p[i], p[i + 1], p[i + 2]]);
      };
      prendre(px - 9, py, 7, h);
      prendre(px + w + 2, py, 7, h);
      prendre(px, py + h + 2, w, 6);
      if (!t.length) return;
      t.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      // 70e centile : on ecarte les ombres et les vis, on garde le metal.
      const m = t[Math.floor(t.length * 0.7)];
      // On desature d'un tiers : un pixel de legende peinte, chaude, suffit a
      // teinter la piece en rose sur un tableau de bord gris.
      const L = .299 * m[0] + .587 * m[1] + .114 * m[2];
      const g = m.map((v) => Math.round(v * 0.66 + L * 0.34));
      el.style.setProperty("--metal", `rgb(${g[0]},${g[1]},${g[2]})`);
    });
  }
  void toile;

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
