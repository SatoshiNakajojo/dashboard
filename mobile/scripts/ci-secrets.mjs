/**
 * Donne à GitHub, une fois pour toutes, ce qu'il faut pour construire l'app.
 *
 *   npm run ci:secrets
 *
 * Le déploiement automatique (`.github/workflows/deploy-club.yml`) construit
 * l'app sur les serveurs de GitHub, qui n'ont pas votre `mobile/.env`. Ce
 * script en recopie les variables **publiques** — celles qui partent de toute
 * façon dans l'app publiée — dans les secrets du dépôt :
 *
 *   • avec la CLI GitHub (`gh`, connectée), il les pose lui-même ;
 *   • sans elle, il ouvre la page des secrets et, pour chacune, copie la valeur
 *     dans le presse-papiers : on colle, on valide, on passe à la suivante.
 *
 * Aucune valeur n'est affichée : seulement les noms. Les clés privées
 * (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`) ne sont jamais lues.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { OPTIONAL_ENV, REQUIRED_ENV, envProblems } from './ci.mjs';
import { parseEnv } from './supabase-checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, '..', '.env');

/** `SatoshiNakajojo/dashboard`, d'après l'adresse du dépôt. */
export function repoSlug(remoteUrl) {
  const match = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Les secrets à poser : les requises, et les facultatives renseignées. */
export function secretsToSet(env) {
  return [...REQUIRED_ENV, ...OPTIONAL_ENV.filter((name) => (env[name] ?? '').trim())];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

async function main() {
  if (!existsSync(ENV_FILE)) {
    console.error(
      'mobile/.env est introuvable : lancez ce script depuis votre Mac, dans mobile/.',
    );
    process.exit(1);
  }
  const env = Object.fromEntries(parseEnv(readFileSync(ENV_FILE, 'utf8')));

  const problems = envProblems(env);
  if (problems.length > 0) {
    console.error('mobile/.env n’est pas prêt :');
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exit(1);
  }

  const remote = run('git', ['remote', 'get-url', 'origin']).stdout ?? '';
  const repo = repoSlug(remote);
  if (!repo) {
    console.error('Impossible de reconnaître le dépôt GitHub (git remote get-url origin).');
    process.exit(1);
  }

  const names = secretsToSet(env);
  const gh = run('gh', ['auth', 'status'], { stdio: 'ignore' });

  if (gh.status === 0) {
    console.log(`Secrets du dépôt ${repo}, via la CLI GitHub :`);
    for (const name of names) {
      // La valeur passe par l'entrée standard : ni à l'écran, ni dans la
      // liste des processus.
      const set = run('gh', ['secret', 'set', name, '--repo', repo], {
        input: env[name].trim(),
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      if (set.status !== 0) {
        console.error(`  ✗ ${name} : ${(set.stderr ?? '').trim()}`);
        process.exit(1);
      }
      console.log(`  ✓ ${name}`);
    }
    const dispatch = run('gh', ['workflow', 'run', 'deploy-club.yml', '--repo', repo], {
      stdio: 'ignore',
    });
    console.log(
      dispatch.status === 0
        ? '\nPremier déploiement lancé : onglet Actions du dépôt, « Déployer le club ».'
        : '\nC’est prêt. Le prochain push sur main déploiera l’app.',
    );
    return;
  }

  // Sans la CLI : la page web, et le presse-papiers.
  const page = `https://github.com/${repo}/settings/secrets/actions/new`;
  const canCopy = run('which', ['pbcopy']).status === 0;
  console.log('La CLI GitHub (gh) n’est pas connectée : on passe par la page web.');
  console.log(`Page : ${page}\n`);
  run('open', [page], { stdio: 'ignore' });

  if (!canCopy) {
    console.log(
      'Pour chacun de ces noms, créez un secret avec la valeur lue dans mobile/.env :',
    );
    for (const name of names) console.log(`  · ${name}`);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const [index, name] of names.entries()) {
    run('pbcopy', [], { input: env[name].trim() });
    console.log(`${index + 1}/${names.length}  Nom : ${name}`);
    console.log('      La valeur est dans le presse-papiers : collez-la dans « Secret »,');
    console.log('      puis « Add secret ». Revenez ensuite sur « New repository secret ».');
    await rl.question('      Entrée quand c’est fait… ');
  }
  rl.close();
  run('pbcopy', [], { input: '' });
  console.log('\nC’est prêt. Pour le premier déploiement : onglet Actions du dépôt,');
  console.log('« Déployer le club », bouton « Run workflow ».');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
