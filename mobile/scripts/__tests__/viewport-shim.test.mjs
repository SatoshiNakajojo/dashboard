/**
 * La bande vide sous l'app installée sur iPhone.
 *
 * Le défaut ne se voit que sur un vrai iPhone, en mode autonome : la
 * machine de développement ne le montre jamais. D'où ces cas mesurés, et le
 * contrôle que le correctif ne touche à rien ailleurs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decorate } from '../decorate-web.mjs';
import { missingTags } from '../pwa-head.mjs';
import { MAX_SHIM, SHIM_SCRIPT, VIEWPORT_SHIM, bottomShim } from '../viewport-shim.mjs';

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

  it('fait échouer le déploiement d’un document qui ne l’a pas', () => {
    const bare = '<html><head></head><body></body></html>';
    assert.ok(missingTags(bare).includes('club-shim'));
  });
});
