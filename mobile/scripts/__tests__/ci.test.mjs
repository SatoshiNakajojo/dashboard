/**
 * Les garde-fous du déploiement automatique.
 *
 * Un robot publie l'app à chaque push, sans relecture : ces contrôles sont
 * tout ce qui l'empêche de mettre en ligne l'app de démonstration, ou une clé
 * secrète.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { OPTIONAL_ENV, REQUIRED_ENV, bundleProblems, envProblems } from '../ci.mjs';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const HEADER = b64({ alg: 'HS256', typ: 'JWT' });
const jwt = (claims) => `${HEADER}.${b64(claims)}.c2lnbmF0dXJl`;
const REF = 'abcdefghijklmnopqrst';
const ANON = jwt({ iss: 'supabase', ref: REF, role: 'anon', exp: 2_000_000_000 });
const SERVICE = jwt({ iss: 'supabase', ref: REF, role: 'service_role', exp: 2_000_000_000 });

const ENV = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
  EXPO_PUBLIC_VAPID_PUBLIC_KEY: 'BPublicVapidKeyForTestsOnly_abcdefghijklmnop',
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(
  path.join(HERE, '..', '..', '..', '.github', 'workflows', 'deploy-club.yml'),
  'utf8',
);

describe('configuration de la build', () => {
  it('passe quand tout est là', () => {
    assert.deepEqual(envProblems(ENV), []);
  });

  it('refuse une build sans Supabase — ce serait l’app de démonstration', () => {
    const problems = envProblems({ ...ENV, EXPO_PUBLIC_SUPABASE_URL: '' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /EXPO_PUBLIC_SUPABASE_URL/);
    assert.equal(envProblems({}).length, REQUIRED_ENV.length);
  });

  it('refuse une adresse qui n’est pas Supabase', () => {
    assert.ok(
      envProblems({ ...ENV, EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321' }).length,
    );
  });

  it('refuse une clé secrète dans une variable publique', () => {
    const problems = envProblems({ ...ENV, EXPO_PUBLIC_SUPABASE_ANON_KEY: SERVICE });
    assert.ok(problems.some((p) => /clé secrète/.test(p)));
    assert.ok(envProblems({ ...ENV, [OPTIONAL_ENV[0]]: 'sb_secret_abcdef123456' }).length);
  });

  it('ne cite jamais une valeur', () => {
    const problems = envProblems({ ...ENV, EXPO_PUBLIC_SUPABASE_ANON_KEY: SERVICE });
    for (const problem of problems) assert.ok(!problem.includes(SERVICE.slice(0, 20)));
  });
});

describe('bundle publié', () => {
  const good = `const u="${ENV.EXPO_PUBLIC_SUPABASE_URL}",k="${ANON}",v="${ENV.EXPO_PUBLIC_VAPID_PUBLIC_KEY}";`;

  it('passe pour une vraie build', () => {
    assert.deepEqual(bundleProblems(good, ENV), []);
  });

  it('repère l’app de démonstration', () => {
    const mock = `const u=undefined,v="${ENV.EXPO_PUBLIC_VAPID_PUBLIC_KEY}";`;
    assert.ok(bundleProblems(mock, ENV).some((p) => /démonstration/.test(p)));
  });

  it('repère une clé secrète', () => {
    assert.ok(
      bundleProblems(`${good}const s="${SERVICE}";`, ENV).some((p) => /service_role/.test(p)),
    );
  });

  it('repère des notifications absentes', () => {
    const noPush = `const u="${ENV.EXPO_PUBLIC_SUPABASE_URL}";`;
    assert.ok(bundleProblems(noPush, ENV).some((p) => /VAPID/.test(p)));
  });
});

describe('le robot de déploiement', () => {
  it('est un fichier que GitHub sait lire', async () => {
    // Un « : » dans une commande non protégée suffit à rendre le fichier
    // invalide — et GitHub ignore alors le robot sans prévenir personne.
    const { parse } = await import('yaml');
    const workflow = parse(WORKFLOW);
    assert.deepEqual(workflow.on.push.branches, ['main']);
    assert.ok(workflow.jobs.deploy.steps.length >= 8);
  });

  it('passe par les garde-fous avant de publier', () => {
    const order = [
      'ci.mjs env',
      'npm ci',
      'npm test',
      'build:web',
      'npm run deploy',
      'ci.mjs bundle',
      'git push',
    ];
    let at = -1;
    for (const step of order) {
      const next = WORKFLOW.indexOf(step);
      assert.ok(next > at, `« ${step} » doit venir après l’étape précédente`);
      at = next;
    }
  });

  it('publie sa build sur le main du moment, sans rejouer un club/ sur un autre', () => {
    // Deux exécutions à la suite : la seconde trouvait main avancé par la
    // publication de la première, et `pull --rebase` butait sur les bundles
    // renommés (v1.01, run 15). La build est recopiée sur le main à jour.
    assert.ok(!WORKFLOW.includes('pull --rebase'), 'pas de rebase de club/');
    const push = WORKFLOW.slice(WORKFLOW.indexOf('- name: Pousser club/'));
    for (const step of [
      'cp -a club/.',
      'git fetch',
      '-B publish origin/main',
      'cp -a "$build/." club/',
    ]) {
      assert.ok(push.includes(step), `« ${step} » attendu dans l’étape de publication`);
    }
  });

  it('ne lit que des variables publiques', () => {
    for (const name of REQUIRED_ENV) assert.ok(WORKFLOW.includes(`secrets.${name}`));
    assert.ok(!/SERVICE_ROLE|VAPID_PRIVATE/.test(WORKFLOW), 'aucune clé privée dans la build');
  });

  it('ne se relance pas sur sa propre publication', () => {
    // Il ne réagit qu'aux changements de l'app ; son commit ne touche que club/.
    assert.ok(WORKFLOW.includes("- 'mobile/**'"));
    assert.ok(!/- 'club\//.test(WORKFLOW));
  });
});

describe('pose des secrets', () => {
  it('reconnaît le dépôt, en https comme en ssh', async () => {
    const { repoSlug } = await import('../ci-secrets.mjs');
    assert.equal(
      repoSlug('https://github.com/SatoshiNakajojo/dashboard.git'),
      'SatoshiNakajojo/dashboard',
    );
    assert.equal(
      repoSlug('https://github.com/SatoshiNakajojo/dashboard'),
      'SatoshiNakajojo/dashboard',
    );
    assert.equal(
      repoSlug('git@github.com:SatoshiNakajojo/dashboard.git\n'),
      'SatoshiNakajojo/dashboard',
    );
    assert.equal(repoSlug('https://gitlab.com/x/y.git'), null);
  });

  it('pose les requises, et les facultatives seulement si elles sont remplies', async () => {
    const { secretsToSet } = await import('../ci-secrets.mjs');
    assert.deepEqual(secretsToSet(ENV), REQUIRED_ENV);
    assert.deepEqual(secretsToSet({ ...ENV, [OPTIONAL_ENV[0]]: 'cg-key' }), [
      ...REQUIRED_ENV,
      OPTIONAL_ENV[0],
    ]);
  });

  it('ne lit jamais les clés privées', () => {
    const source = readFileSync(path.join(HERE, '..', 'ci-secrets.mjs'), 'utf8');
    assert.ok(!/env\[['"`]?(SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY)/.test(source));
    assert.ok(!/console\.log\([^)]*env\[/.test(source), 'aucune valeur à l’écran');
  });
});
