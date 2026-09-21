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

describe('animation', () => {
  it('remplit la chaîne puis la laisse pleine', () => {
    const pourcents = [...BOOT_SHELL.matchAll(/^\s*([\d.]+)% \{ width: 100%; \}/gm)].map((m) =>
      Number(m[1]),
    );
    assert.equal(pourcents.length, 2, 'un palier de remplissage, puis la pause');
    // 8 blocs × 150 ms sur un cycle de 1650 ms.
    assert.ok(Math.abs(pourcents[0] - 72.73) < 0.02, `palier à ${pourcents[0]} %`);
    assert.equal(pourcents[1], 100);
  });

  it('découpe la chaîne au lieu de la comprimer', () => {
    // Des blocs flexibles se tassent dans la largeur animée : la chaîne se
    // remplit alors de tranches dorées, pas de blocs. Vu à l'écran, corrigé
    // ici pour qu'on ne le revoie pas.
    assert.ok(/\.boot-row \{[^}]*width: max-content/.test(BOOT_SHELL));
    assert.ok(/\.boot-b \{\s*flex: none/.test(BOOT_SHELL));
    assert.ok(/#boot-fill \{[^}]*overflow: hidden/.test(BOOT_SHELL));
  });

  it('avance par autant de crans qu’il y a de blocs', () => {
    const blocs = [...BOOT_SHELL.matchAll(/class="boot-b"/g)].length;
    const crans = Number(BOOT_SHELL.match(/steps\((\d+), end\)/)[1]);
    assert.equal(crans, blocs, 'un cran par bloc, sinon un bloc se remplit à moitié');
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
