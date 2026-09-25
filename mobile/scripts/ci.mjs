/**
 * Les garde-fous du déploiement automatique (`.github/workflows/deploy-club.yml`).
 *
 * Un robot publie désormais l'app à chaque push : personne ne relit ce qu'il
 * met en ligne. Deux erreurs seraient silencieuses, et graves :
 *
 *   • **une build sans Supabase.** Sans `EXPO_PUBLIC_SUPABASE_URL`, l'app ne
 *     plante pas : elle tourne sur ses données de démonstration. Publiée, elle
 *     remplacerait l'app du club par un club fictif — sept faux membres, des
 *     calls inventés ;
 *   • **une clé secrète dans le bundle.** Tout ce qui est préfixé
 *     `EXPO_PUBLIC_` part dans le JavaScript public : une clé `service_role`
 *     posée là par erreur ouvrirait toute la base à quiconque ouvre le site.
 *
 * On vérifie donc la configuration avant de construire, et le bundle avant de
 * pousser. Aucune valeur n'est jamais écrite dans les journaux : on nomme les
 * variables, jamais leur contenu.
 *
 *   node scripts/ci.mjs env      — avant la build
 *   node scripts/ci.mjs bundle   — après `npm run deploy`, sur `club/`
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSecretKey, secretsInText } from './supabase-checks.mjs';

/** Sans elles, pas d'app du club : la build partirait en démonstration. */
export const REQUIRED_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_VAPID_PUBLIC_KEY',
];

/** Facultatives : l'app s'en passe. */
export const OPTIONAL_ENV = ['EXPO_PUBLIC_COINGECKO_API_KEY'];

/** Les problèmes de configuration, sans jamais citer une valeur. */
export function envProblems(env) {
  const problems = [];
  for (const name of REQUIRED_ENV) {
    if (!String(env[name] ?? '').trim()) problems.push(`${name} est vide ou absent`);
  }
  const url = String(env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL n’est pas une adresse https://….supabase.co');
  }
  for (const name of [...REQUIRED_ENV, ...OPTIONAL_ENV]) {
    if (isSecretKey(String(env[name] ?? '').trim())) {
      problems.push(`${name} contient une clé secrète — elle partirait dans le bundle public`);
    }
  }
  return problems;
}

/** Les problèmes d'un bundle publié : une app de démonstration, ou un secret. */
export function bundleProblems(code, env) {
  const problems = [];
  const url = String(env.EXPO_PUBLIC_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!url || !code.includes(url)) {
    problems.push(
      'l’adresse Supabase n’est pas dans le bundle : ce serait l’app de démonstration',
    );
  }
  const vapid = String(env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  if (!vapid || !code.includes(vapid)) {
    problems.push('la clé publique VAPID n’est pas dans le bundle : plus de notifications');
  }
  for (const secret of secretsInText(code)) {
    problems.push(`le bundle contient ${secret}`);
  }
  return problems;
}

/** Tout le JavaScript publié, mis bout à bout. */
function publishedCode(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
}

function report(title, problems) {
  if (problems.length === 0) {
    console.log(`✓ ${title}`);
    return;
  }
  console.error(`✗ ${title}`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

// Exécuté directement : `node scripts/ci.mjs env|bundle`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const step = process.argv[2];
  if (step === 'env') {
    report(
      'configuration de la build',
      envProblems(process.env).map(
        (problem) => `${problem} — voir « Déploiement automatique » dans docs/INSTALLATION.md`,
      ),
    );
  } else if (step === 'bundle') {
    const club = path.join(HERE, '..', '..', 'club', '_expo');
    report('bundle publié', bundleProblems(publishedCode(club), process.env));
  } else {
    console.error('Usage : node scripts/ci.mjs env|bundle');
    process.exit(1);
  }
}
