/**
 * Publie la build web dans `club/` à la racine du dépôt, d'où GitHub Pages la
 * sert à l'adresse `https://<compte>.github.io/dashboard/club/`.
 *
 * Le dashboard JCGI occupe déjà la racine ; les deux cohabitent sans se
 * marcher dessus, et une seule Page suffit.
 *
 * Ce script ne commite rien : il prépare les fichiers, à vous de relire puis
 * de pousser.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * GitHub Pages n'a pas de réécriture d'URL : sans ce fichier, ouvrir
 * `/dashboard/club/oracle` directement donne un 404. Le 404 sert la coquille,
 * et le routeur reprend la main côté client.
 */
cpSync(path.join(TARGET, 'index.html'), path.join(TARGET, '404.html'));

/** `.nojekyll` : sans lui, GitHub Pages ignore les dossiers commençant par `_`
 *  — ce qui est exactement le cas de `_expo/static/`, donc de tout le bundle. */
writeFileSync(path.join(TARGET, '.nojekyll'), '');

console.log(`Publié dans ${path.relative(process.cwd(), TARGET)}/`);
console.log('Relisez, puis : git add club && git commit && git push');
