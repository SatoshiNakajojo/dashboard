/**
 * La bande vide sous l'app installée sur iPhone.
 *
 * Le défaut ne se voit que sur un vrai iPhone, en mode autonome : la
 * machine de développement ne le montre jamais. D'où ces cas mesurés, et le
 * contrôle que le correctif ne touche à rien ailleurs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import { decorate } from '../decorate-web.mjs';
import { missingTags } from '../pwa-head.mjs';
import {
  MAX_SHIM,
  MAX_TOGGLES,
  SETTLE_DELAYS_MS,
  SHIM_SCRIPT,
  SHIM_STYLE,
  VIEWPORT_SHIM,
  bottomShim,
} from '../viewport-shim.mjs';

describe('écart à combler', () => {
  it('rend la barre d’état d’un iPhone 12 à 14', () => {
    // Écran 390 × 844, zone de mise en page 390 × 797 : 47 pt de bande.
    assert.equal(bottomShim(true, 390, 844, 390, 797), 47);
  });

  it('ne fait rien quand la page couvre déjà l’écran', () => {
    assert.equal(bottomShim(true, 390, 844, 390, 844), 0);
  });

  it('ne fait rien hors de l’app installée sur iOS', () => {
    // Onglet Safari (la barre d'outils mange légitimement le bas), Android,
    // ordinateur : `navigator.standalone` y vaut `false` ou n'existe pas.
    assert.equal(bottomShim(false, 390, 844, 390, 664), 0);
    assert.equal(bottomShim(undefined, 412, 915, 412, 843), 0);
  });

  it('suit l’orientation', () => {
    // iOS donne l'écran en portrait même en paysage.
    assert.equal(bottomShim(true, 390, 844, 844, 390), 0);
    assert.equal(bottomShim(true, 390, 844, 844, 370), 20);
  });

  it('laisse tranquille un iPad en fenêtre', () => {
    // Split View ou Stage Manager : la fenêtre ne prend pas toute la largeur,
    // l'écart de hauteur n'est pas une barre d'état.
    assert.equal(bottomShim(true, 820, 1180, 500, 1156), 0);
  });

  it('ignore un écart qui n’est pas une barre d’état', () => {
    // Clavier ouvert : des centaines de points.
    assert.equal(bottomShim(true, 390, 844, 390, 844 - MAX_SHIM), MAX_SHIM);
    assert.equal(bottomShim(true, 390, 844, 390, 844 - MAX_SHIM - 1), 0);
    assert.equal(bottomShim(true, 390, 844, 390, 500), 0);
  });

  it('ne se fie pas à une mesure absurde', () => {
    assert.equal(bottomShim(true, 0, 844, 390, 797), 0);
    assert.equal(bottomShim(true, 390, Number.NaN, 390, 797), 0);
    assert.equal(bottomShim(true, 390, 844, 390, -1), 0);
    assert.equal(bottomShim(true, 390, 844, 390, 900), 0, 'une page plus haute que l’écran');
  });
});

describe('injection', () => {
  it('porte une fonction autonome, sans référence extérieure', () => {
    // Son texte est recopié dans la page : elle ne doit rien attendre du
    // module — ni `MAX_SHIM`, ni import.
    const standalone = new Function(`return ${bottomShim.toString()}`)();
    assert.equal(standalone(true, 390, 844, 390, 797), 47);
    assert.ok(SHIM_SCRIPT.includes('function bottomShim'));
  });

  it('s’ajoute au document publié, avant le bundle', () => {
    const page =
      '<!doctype html><html><head><title>x</title>' +
      '<script src="/_expo/static/js/web/entry.js" defer></script></head>' +
      '<body><div id="root"></div></body></html>';
    const { html } = decorate(page);
    assert.ok(html.includes('club-shim'));
    assert.ok(html.includes(VIEWPORT_SHIM.trim().slice(0, 40)));
    assert.deepEqual(missingTags(html), []);
    // Un script en ligne dans `<head>` s'exécute pendant la lecture du
    // document : avant le corps, et avant le bundle, qui est différé.
    assert.ok(
      html.indexOf('function bottomShim') < html.indexOf('</head>'),
      'la page doit être à la bonne hauteur avant le premier rendu',
    );
  });

  it('remesure après le lancement, pas seulement au retour de l’arrière-plan', () => {
    // Sur le terrain : l'app s'ouvrait avec la bande, et ne la perdait qu'au
    // retour de l'arrière-plan — seul moment où l'on remesurait.
    assert.ok(SHIM_SCRIPT.includes("addEventListener('load'"));
    assert.ok(SHIM_SCRIPT.includes('DOMContentLoaded'));
    for (const ms of SETTLE_DELAYS_MS) assert.ok(SHIM_SCRIPT.includes(String(ms)));
    assert.ok(SHIM_SCRIPT.includes('__clubViewport'), 'les mesures restent lisibles');
  });

  it('ne mesure jamais en continu', () => {
    // Une sonde suivie par ResizeObserver réagissait à sa propre correction :
    // le bas de l'app clignotait à chaque image.
    assert.ok(!SHIM_SCRIPT.includes('new ResizeObserver'));
    assert.ok(!SHIM_SCRIPT.includes('requestAnimationFrame'));
  });

  it('ne prolonge pas la sonde comme une feuille', () => {
    // Elle porte un id : le sélecteur des feuilles l'exclut.
    assert.ok(SHIM_SCRIPT.includes("probe.id = 'club-viewport-probe'"));
    assert.ok(SHIM_STYLE.includes('body > div:not([id])'));
  });

  it('fait échouer le déploiement d’un document qui ne l’a pas', () => {
    const bare = '<html><head></head><body></body></html>';
    assert.ok(missingTags(bare).includes('club-shim'));
  });
});

/**
 * Une page simulée, juste ce que le script touche : de quoi le faire tourner
 * dans Node, et reproduire le clignotement vu sur iPhone.
 */
function fakePage({ innerHeight }) {
  const handlers = {};
  const props = new Map();
  const classes = new Set();
  const on = (target) => (type, fn) => {
    (handlers[`${target}:${type}`] ??= []).push(fn);
  };
  const root = {
    style: {
      setProperty: (k, v) => props.set(k, v),
      getPropertyValue: (k) => props.get(k) ?? '',
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
  };
  const window = {
    navigator: { standalone: true },
    screen: { width: 390, height: 844 },
    innerWidth: 390,
    scrollY: 0,
    scrollTo() {},
    setTimeout() {},
    addEventListener: on('window'),
    document: {
      documentElement: root,
      body: null,
      visibilityState: 'visible',
      addEventListener: on('document'),
    },
  };
  Object.defineProperty(window, 'innerHeight', { get: () => innerHeight(classes) });
  window.window = window;
  vm.createContext(window);
  vm.runInContext(SHIM_SCRIPT, window);
  const fire = (key) => (handlers[key] ?? []).forEach((fn) => fn());
  return { window, classes, fire };
}

describe('coupe-circuit', () => {
  it('pose la bande au lancement sur l’iPhone du club', () => {
    const page = fakePage({ innerHeight: () => 797 });
    assert.ok(page.classes.has('club-shim'));
    assert.equal(page.window.__clubViewport.gap, 47);
  });

  it('ne laisse pas la page clignoter, même si iOS réagit à chaque correction', () => {
    // Le pire cas : dès qu'on allonge la page, iOS annonce la bonne hauteur ;
    // dès qu'on la raccourcit, il annonce de nouveau la hauteur tronquée.
    let flips = 0;
    let last = null;
    const page = fakePage({ innerHeight: (classes) => (classes.has('club-shim') ? 844 : 797) });
    for (let i = 0; i < 500; i++) {
      page.fire('window:resize');
      const now = page.classes.has('club-shim');
      if (last !== null && now !== last) flips += 1;
      last = now;
    }
    assert.ok(flips < MAX_TOGGLES, `${flips} bascules après le lancement`);
    assert.equal(page.window.__clubViewport.frozen, true);
  });

  it('se réarme au retour au premier plan, sans boucler pour autant', () => {
    let height = 844;
    const page = fakePage({ innerHeight: () => height });
    assert.ok(!page.classes.has('club-shim'));
    height = 797;
    page.fire('document:visibilitychange');
    assert.ok(page.classes.has('club-shim'), 'la bande apparue plus tard est prise en compte');
    assert.equal(page.window.__clubViewport.frozen, false);
  });
});
