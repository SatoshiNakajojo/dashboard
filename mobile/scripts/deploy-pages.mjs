/**
 * Publie la build web dans `club/` à la racine du dépôt, d'où GitHub Pages la
 * sert à l'adresse `https://<compte>.github.io/dashboard/club/`.
 *
 * Le dashboard JCGI occupe déjà la racine ; les deux cohabitent sans se marcher
 * dessus, et une seule Page suffit.
 *
 * Le script **vérifie** ce qu'il publie : si un document sortait sans ses
 * balises PWA, l'app cesserait d'être installable sans que rien ne le signale,
 * jusqu'à ce qu'un membre se retrouve avec un marque-page. Mieux vaut échouer
 * ici.
 *
 * Il ne commite rien : à vous de relire puis de pousser.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectPwaHead, missingTags } from './pwa-head.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const TARGET = path.join(HERE, '..', '..', 'club');

if (!existsSync(DIST)) {
  console.error('dist/ est absent — lancez d’abord `npm run build:web`.');
  process.exit(1);
}

// On vide la cible : un ancien bundle à empreinte laissé derrière ferait grossir
// le dépôt à chaque déploiement.
rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });
cpSync(DIST, TARGET, { recursive: true });

/** Tous les documents HTML publiés, quel que soit le mode de rendu. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let injected = 0;
for (const file of htmlFiles(TARGET)) {
  const result = injectPwaHead(readFileSync(file, 'utf8'));
  if (result.injected) {
    writeFileSync(file, result.html);
    injected += 1;
  }
}

/**
 * GitHub Pages n'a pas de réécriture d'URL : sans ce fichier, ouvrir
 * `/dashboard/club/oracle` directement donne un 404. Le 404 sert la coquille,
 * et le routeur reprend la main côté client.
 */
cpSync(path.join(TARGET, 'index.html'), path.join(TARGET, '404.html'));

/** `.nojekyll` : sans lui, GitHub Pages ignore les dossiers commençant par `_`
 *  — ce qui est exactement le cas de `_expo/static/`, donc de tout le bundle. */
writeFileSync(path.join(TARGET, '.nojekyll'), '');

// --- Vérification -----------------------------------------------------------

const entry = path.join(TARGET, 'index.html');
const missing = missingTags(readFileSync(entry, 'utf8'));

if (missing.length > 0) {
  console.error('\nLe document publié n’est pas installable. Balises manquantes :');
  for (const tag of missing) console.error(`  · ${tag}`);
  console.error('\nRien n’a été publié de fiable — corrigez avant de pousser.');
  process.exit(1);
}

for (const asset of ['manifest.json', 'sw.js', 'apple-touch-icon.png', 'icon-512.png']) {
  if (!existsSync(path.join(TARGET, asset))) {
    console.error(`\n${asset} est absent de la publication.`);
    process.exit(1);
  }
}

const pages = htmlFiles(TARGET).length;
console.log(`Publié dans ${path.relative(process.cwd(), TARGET)}/`);
console.log(`  ${pages} document(s) HTML, dont ${injected} complété(s) avec les balises PWA`);
console.log('  installable : oui');
console.log('\nRelisez, puis : git add club && git commit && git push');
