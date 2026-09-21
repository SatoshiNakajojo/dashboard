/**
 * Ce qu'il faut ajouter à un document exporté par Expo pour qu'il soit l'app.
 *
 * Deux choses qu'Expo ne met pas et qu'on ne peut pas mettre depuis React :
 * les balises PWA (sans elles, « Sur l'écran d'accueil » ne crée qu'un
 * marque-page) et la coquille d'attente (sans elle, le temps de charger 2,7 Mo
 * de bundle, l'app est un rectangle noir).
 *
 * Le même traitement s'applique à `dist/` juste après la build et à `club/` au
 * moment de publier : les deux doivent être identiques, sinon on vérifie autre
 * chose que ce qu'on livre. Les deux injections sont idempotentes.
 *
 * Usage : `node scripts/decorate-web.mjs <dossier>`
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectBootShell } from './boot-shell.mjs';
import { injectPwaHead } from './pwa-head.mjs';

/** Tous les documents HTML d'un dossier, quel que soit le mode de rendu. */
export function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Applique les deux injections à un document. */
export function decorate(html) {
  const head = injectPwaHead(html);
  const shell = injectBootShell(head.html);
  return { html: shell.html, injected: head.injected || shell.injected };
}

/** Traite un dossier entier. Renvoie le nombre de documents modifiés. */
export function decorateDir(dir) {
  let count = 0;
  for (const file of htmlFiles(dir)) {
    const result = decorate(readFileSync(file, 'utf8'));
    if (result.injected) {
      writeFileSync(file, result.html);
      count += 1;
    }
  }
  return count;
}

// Exécuté directement : `node scripts/decorate-web.mjs dist`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage : node scripts/decorate-web.mjs <dossier>');
    process.exit(1);
  }
  const count = decorateDir(dir);
  console.log(`${count} document(s) complété(s) dans ${dir}/`);
}
