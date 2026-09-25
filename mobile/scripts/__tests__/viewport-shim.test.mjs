/**
 * La bande vide sous l'app installée sur iPhone.
 *
 * Le défaut ne se voit que sur un vrai iPhone, en mode autonome : la machine
 * de développement ne le montre jamais. Ces cas rejouent ce qu'on a relevé
 * sur l'iPhone d'un membre — « ÉCRAN 896 · INNER 852 », puis 896 dès que la
 * page est allongée — et contrôlent que le correctif ne touche à rien
 * ailleurs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import { decorate } from '../decorate-web.mjs';
import { missingTags } from '../pwa-head.mjs';
import {
  HOLD,
  MAX_SHIM,
  MAX_TOGGLES,
  SETTLE_DELAYS_MS,
  SHIM_SCRIPT,
  SHIM_STYLE,
  VIEWPORT_SHIM,
  pageHeight,
} from '../viewport-shim.mjs';

describe('hauteur de la page', () => {
  it('prend l’écran entier sur l’iPhone du club', () => {
    // Relevé : écran 896, iOS n'en donne que 852 (la barre d'état, 44 pt).
    assert.equal(pageHeight(true, 414, 896, 414, 852, 'portrait'), 896);
    // iPhone 12 à 14 : 844, dont 47 de barre d'état.
    assert.equal(pageHeight(true, 390, 844, 390, 797, 'portrait'), 844);
  });

  it('reste la même quand iOS annonce l’écran entier — sa propre correction', () => {
    // C'est le point fixe qui manquait : allongée, la page fait annoncer 896
    // à iOS ; la règle doit répondre la même chose qu'avant, pas « rien ».
    assert.equal(pageHeight(true, 414, 896, 414, 896, 'portrait'), 896);
  });

  it('ne fait rien hors de l’app installée sur iOS', () => {
    // Onglet Safari (la barre d'outils mange légitimement le bas), Android,
    // ordinateur : `navigator.standalone` y vaut `false` ou n'existe pas.
    assert.equal(pageHeight(false, 390, 844, 390, 664, 'portrait'), 0);
    assert.equal(pageHeight(undefined, 412, 915, 412, 843, 'portrait'), 0);
  });

  it('suit l’orientation de l’écran', () => {
    // iOS donne l'écran en portrait même en paysage.
    assert.equal(pageHeight(true, 414, 896, 896, 414, 'landscape'), 414);
    assert.equal(pageHeight(true, 414, 896, 896, 394, 'landscape'), 414);
  });

  it('ne se laisse pas tromper par le clavier', () => {
    // Clavier ouvert en portrait : la fenêtre devient plus large que haute.
    // L'orientation vient de l'écran — on garde l'état, on ne l'enlève pas.
    assert.equal(pageHeight(true, 414, 896, 414, 380, 'portrait'), HOLD);
    assert.equal(pageHeight(true, 414, 896, 414, 896 - MAX_SHIM - 1, 'portrait'), HOLD);
    assert.equal(pageHeight(true, 414, 896, 414, 896 - MAX_SHIM, 'portrait'), 896);
  });

  it('laisse tranquille un iPad en fenêtre', () => {
    assert.equal(pageHeight(true, 820, 1180, 500, 1156, 'portrait'), 0);
  });

  it('ne se fie pas à une mesure absurde', () => {
    assert.equal(pageHeight(true, 0, 896, 414, 852, 'portrait'), 0);
    assert.equal(pageHeight(true, 414, Number.NaN, 414, 852, 'portrait'), 0);
    assert.equal(pageHeight(true, 414, 896, 414, -1, 'portrait'), 0);
    assert.equal(
      pageHeight(true, 414, 896, 414, 950, 'portrait'),
      HOLD,
      'plus haute que l’écran',
    );
  });
});

describe('injection', () => {
  it('porte une fonction autonome, sans référence extérieure', () => {
    // Son texte est recopié dans la page : elle ne doit rien attendre du
    // module — ni constante, ni import.
    const standalone = new Function(`return ${pageHeight.toString()}`)();
    assert.equal(standalone(true, 414, 896, 414, 852, 'portrait'), 896);
    assert.ok(SHIM_SCRIPT.includes('function pageHeight'));
  });

  it('s’ajoute au document publié, dans <head>', () => {
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
    assert.ok(html.indexOf('function pageHeight') < html.indexOf('</head>'));
  });

  it('ne mesure jamais en continu', () => {
    // Une sonde suivie par ResizeObserver réagissait à sa propre correction :
    // le bas de l'app clignotait à chaque image.
    assert.ok(!SHIM_SCRIPT.includes('new ResizeObserver'));
    assert.ok(!SHIM_SCRIPT.includes('requestAnimationFrame'));
    for (const ms of SETTLE_DELAYS_MS) assert.ok(SHIM_SCRIPT.includes(String(ms)));
  });

  it('donne aux feuilles la hauteur de la page, pas celle d’iOS', () => {
    assert.ok(SHIM_STYLE.includes('height: var(--club-height)'));
    assert.ok(SHIM_STYLE.includes('body > div:not([id])'), 'la sonde, qui a un id, est exclue');
  });

  it('fait échouer le déploiement d’un document qui ne l’a pas', () => {
    assert.ok(missingTags('<html><head></head><body></body></html>').includes('club-shim'));
  });
});

/**
 * Une page simulée, juste ce que le script touche : de quoi le faire tourner
 * dans Node et rejouer l'iPhone du club.
 */
function fakePage({ innerHeight, screen = { width: 414, height: 896 } }) {
  const handlers = {};
  const props = new Map();
  const classes = new Set();
  const on = (target) => (type, fn) => {
    (handlers[`${target}:${type}`] ??= []).push(fn);
  };
  const root = {
    style: {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
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
    screen: { ...screen, orientation: { type: 'portrait-primary' } },
    innerWidth: screen.width,
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
  return { window, classes, props, fire };
}

describe('sur l’iPhone du club', () => {
  it('prend l’écran entier dès le lancement', () => {
    const page = fakePage({ innerHeight: () => 852 });
    assert.ok(page.classes.has('club-shim'));
    assert.equal(page.props.get('--club-height'), '896px');
  });

  it('ne bascule plus, même si iOS réagit à la correction', () => {
    // Exactement le relevé : 852 sans correction, 896 avec.
    const page = fakePage({ innerHeight: (classes) => (classes.has('club-shim') ? 896 : 852) });
    for (let i = 0; i < 500; i++) page.fire('window:resize');
    const info = page.window.__clubViewport;
    assert.equal(info.toggles, 1, 'posée une fois, jamais retirée');
    assert.equal(info.frozen, false);
    assert.equal(info.height, 896);
    assert.ok(page.classes.has('club-shim'));
  });

  it('est déjà à la bonne hauteur si iOS ne raccourcit la page qu’après le lancement', () => {
    let height = 896;
    const page = fakePage({ innerHeight: () => height });
    assert.equal(page.props.get('--club-height'), '896px');
    height = 852; // plus tard, sans le moindre événement
    assert.equal(page.props.get('--club-height'), '896px');
  });

  it('garde sa hauteur quand le clavier s’ouvre', () => {
    let height = 852;
    const page = fakePage({ innerHeight: () => height });
    height = 380;
    page.fire('window:resize');
    assert.equal(page.props.get('--club-height'), '896px');
    assert.equal(page.window.__clubViewport.toggles, 1);
  });

  it('garde un coupe-circuit, au cas où', () => {
    // Un iOS qui ferait tourner l'écran sans arrêt : la hauteur changerait à
    // chaque fois. Au-delà de MAX_TOGGLES, on fige.
    let landscape = false;
    const page = fakePage({ innerHeight: () => (landscape ? 394 : 852) });
    for (let i = 0; i < 20; i++) {
      landscape = i % 2 === 0;
      page.window.screen.orientation.type = i % 2 ? 'portrait-primary' : 'landscape-primary';
      page.window.innerWidth = i % 2 ? 414 : 896;
      page.fire('window:resize');
    }
    assert.ok(page.window.__clubViewport.toggles <= MAX_TOGGLES);
    assert.equal(page.window.__clubViewport.frozen, true);
  });
});
