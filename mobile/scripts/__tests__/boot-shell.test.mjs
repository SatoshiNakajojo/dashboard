/**
 * La coquille d'attente du document publié.
 *
 * Elle s'exécute avant tout le reste et sans JavaScript : une erreur ici ne
 * dégrade pas l'app, elle la remplace par un écran figé. C'est le seul code du
 * projet dont une panne ne laisse aucun recours à l'utilisateur.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BOOT_SENTINEL, BOOT_SHELL, injectBootShell } from '../boot-shell.mjs';
import { decorate } from '../decorate-web.mjs';
import { missingTags } from '../pwa-head.mjs';

const DOCUMENT =
  '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';

describe('injection', () => {
  it('se pose juste avant la fermeture du corps', () => {
    const { html, injected } = injectBootShell(DOCUMENT);
    assert.equal(injected, true);
    assert.ok(html.includes(BOOT_SENTINEL));
    assert.ok(
      html.indexOf(BOOT_SENTINEL) < html.indexOf('</body>'),
      'la coquille doit être dans le corps',
    );
    assert.ok(
      html.indexOf('<div id="root">') < html.indexOf(BOOT_SENTINEL),
      'elle se superpose à #root, elle ne le précède pas',
    );
  });

  it('ne se pose pas deux fois', () => {
    const une = injectBootShell(DOCUMENT).html;
    const deux = injectBootShell(une);
    assert.equal(deux.injected, false);
    assert.equal(deux.html, une, 'une publication répétée ne doit rien empiler');
  });

  it('laisse un document sans corps intact plutôt que de le casser', () => {
    const result = injectBootShell('<html><head></head></html>');
    assert.equal(result.injected, false);
  });
});

describe('ce que la coquille charge', () => {
  it('ne demande aucune ressource distante', () => {
    // Elle doit s'afficher avant le bundle, donc avant tout ce qui se
    // télécharge. Une police Google ici, et elle attend le réseau qu'elle est
    // censée masquer.
    assert.ok(!/https?:\/\//.test(BOOT_SHELL), BOOT_SHELL.match(/https?:\/\/\S+/)?.[0] ?? '');
    const sources = [...BOOT_SHELL.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      sources,
      ['icon-192.png'],
      'la seule image est celle que la PWA a en cache',
    );
  });

  it('n’embarque pas de script', () => {
    assert.ok(!/<script/i.test(BOOT_SHELL), 'elle doit tenir sans JavaScript');
  });

  it('respecte le refus des animations', () => {
    assert.ok(BOOT_SHELL.includes('prefers-reduced-motion'));
  });
});

describe('la chaîne', () => {
  const BLOCK = 16;
  const LINK = 8;
  const COUNT = 8;

  it('dessine huit blocs reliés par sept maillons', () => {
    // Une rangée de carrés n'est pas une chaîne : ce sont les maillons qui
    // font la différence, et il y en a un de moins que de blocs.
    const rangée = BOOT_SHELL.match(/<div class="boot-row">(.*?)<\/div>/)[1];
    assert.equal([...rangée.matchAll(/<i class="boot-b[^"]*">/g)].length, COUNT);
    assert.equal([...rangée.matchAll(/<u class="boot-b[^"]*">/g)].length, COUNT - 1);
  });

  it('donne à chaque bloc ses deux lignes de données', () => {
    const premier = BOOT_SHELL.match(/<i class="boot-b">(.*?)<\/i>/)[1];
    assert.equal([...premier.matchAll(/<b><\/b>/g)].length, 2);
  });

  it('s’arrête au bord d’un bloc, jamais au milieu d’un maillon', () => {
    // Des crans réguliers tomberaient dans les maillons et laisseraient des
    // tranches dorées à l'écran — le défaut de la première version.
    const paliers = [...BOOT_SHELL.matchAll(/^\s*([\d.]+)% \{ width: (\d+)px; \}/gm)].map(
      (m) => ({ temps: Number(m[1]), largeur: Number(m[2]) }),
    );
    assert.equal(paliers.length, COUNT + 2, 'un palier par bloc, plus zéro, plus la pause');

    const attendues = Array.from({ length: COUNT + 1 }, (_, k) =>
      k === 0 ? 0 : k * BLOCK + (k - 1) * LINK,
    );
    assert.deepEqual(
      paliers.slice(0, COUNT + 1).map((p) => p.largeur),
      attendues,
    );
    assert.equal(paliers[COUNT + 1].temps, 100, 'la chaîne reste pleine pendant la pause');
    assert.equal(paliers[COUNT + 1].largeur, attendues[COUNT]);
  });

  it('tient le rythme des huit blocs sur le cycle', () => {
    const paliers = [...BOOT_SHELL.matchAll(/^\s*([\d.]+)% \{ width: \d+px; \}/gm)].map((m) =>
      Number(m[1]),
    );
    assert.equal(paliers[0], 0);
    // 8 blocs × 150 ms sur un cycle de 1650 ms.
    assert.ok(Math.abs(paliers[COUNT] - 72.73) < 0.02, `dernier bloc à ${paliers[COUNT]} %`);
  });

  it('découpe la chaîne au lieu de la comprimer', () => {
    // Des blocs flexibles se tassent dans la largeur animée : la chaîne se
    // remplit alors de tranches dorées, pas de blocs. Vu à l'écran, corrigé
    // ici pour qu'on ne le revoie pas.
    assert.ok(/\.boot-row \{[^}]*width: max-content/.test(BOOT_SHELL));
    assert.ok(/\.boot-b \{\s*flex: none/.test(BOOT_SHELL));
    assert.ok(/#boot-fill \{[^}]*overflow: hidden/.test(BOOT_SHELL));
  });
});

describe('document publié', () => {
  it('passe la vérification de publication une fois décoré', () => {
    const { html } = decorate(DOCUMENT);
    assert.deepEqual(missingTags(html), []);
  });

  it('décorer deux fois ne change rien', () => {
    const une = decorate(DOCUMENT).html;
    const deux = decorate(une);
    assert.equal(deux.injected, false);
    assert.equal(deux.html, une);
  });
});
