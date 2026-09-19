/**
 * Gabarits de courriel.
 *
 * Deux fois de suite j'ai livré un courriel illisible : mis en page comme une
 * page web, puis peint aux couleurs sombres du club. Les clients de messagerie
 * suppriment les fonds ; il restait du texte crème sur du blanc, et le premier
 * élément à disparaître était le code lui-même. Le membre voyait un courriel
 * vide.
 *
 * Ces règles ne jugent pas du goût. Elles vérifient qu'un courriel reste
 * lisible **quand le client ne garde rien** de ce qu'on lui demande.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'templates');
const FILES = readdirSync(DIR).filter((name) => name.endsWith('.html'));

const read = (name) => readFileSync(path.join(DIR, name), 'utf8');

/** Luminance relative — WCAG 2.1. */
function luminance(hex) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastOnWhite(hex) {
  return 1.05 / (luminance(hex) + 0.05);
}

describe('gabarits de courriel', () => {
  it('il y en a au moins un, et le repli minimal', () => {
    assert.ok(FILES.length >= 2, FILES.join(', '));
    assert.ok(FILES.includes('magic-link-minimal.html'));
  });

  for (const name of FILES) {
    describe(name, () => {
      const html = read(name);

      it('envoie un code, pas un lien', () => {
        // `{{ .ConfirmationURL }}` ouvrirait Safari sur iOS, jamais l'app de
        // l'écran d'accueil : la session atterrirait dans un stockage que la
        // PWA ne voit pas.
        assert.match(html, /\{\{\s*\.Token\s*\}\}/);
        assert.doesNotMatch(html, /ConfirmationURL/);
      });

      it('ne dépend d’aucun fond', () => {
        // Un fond supprimé ne doit rien coûter. S'il porte le contraste, il
        // emporte le texte avec lui.
        assert.doesNotMatch(html, /bgcolor=/i, 'attribut bgcolor');
        assert.doesNotMatch(html, /background(-color)?\s*:/i, 'propriété background');
      });

      it('reste lisible sur fond blanc', () => {
        const faibles = [...html.matchAll(/color:\s*(#[0-9a-fA-F]{6})/g)]
          .map((m) => m[1])
          .filter((hex) => contrastOnWhite(hex) < 4.5)
          .map((hex) => `${hex} (${contrastOnWhite(hex).toFixed(2)}:1)`);
        assert.deepEqual(faibles, [], 'couleurs trop pâles sur blanc');
      });

      it('ne commence pas par un commentaire', () => {
        // Le moteur de gabarits traite tout ce qu'on lui donne, y compris ce
        // qui est entre `<!-- -->`, et un en-tête collé par mégarde se
        // retrouve dans le courriel.
        assert.doesNotMatch(html, /<!--/);
      });
    });
  }
});
