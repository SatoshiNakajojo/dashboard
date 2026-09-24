#!/usr/bin/env node
/**
 * Met en place les notifications push, de bout en bout — `npm run push:setup`,
 * depuis `mobile/`, une fois la migration `20260927090000_push_notifications`
 * poussée (`npx supabase db push`).
 *
 *   1. Clés VAPID : générées une fois, gardées dans `.env` — la publique pour
 *      la build (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), la privée pour ce script
 *      seulement (`VAPID_PRIVATE_KEY`, sans préfixe : elle n'entre jamais dans
 *      l'app). Les renouveler désabonne tous les appareils : `--rotate` exprès.
 *   2. Secrets de la fonction `notify` (`supabase secrets set`), dont un
 *      secret d'appel neuf à chaque passage.
 *   3. Déploiement de `notify`, sans vérification de jeton par la passerelle :
 *      la fonction vérifie elle-même (secret du battement, ou jeton du membre).
 *   4. Adresse et secret d'appel dans le coffre-fort de la base
 *      (`set_notify_config`), où `notify_tick()` les lit chaque minute.
 *   5. Planification, si la migration n'a pas pu la poser.
 *   6. Diagnostic, et un appel réel de la fonction pour prouver la chaîne.
 *
 * Rejouable. N'affiche aucun secret.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { keyKind } from './members.mjs';
import {
  describeStatus,
  generateVapidKeys,
  newNotifySecret,
  projectRefOf,
  upsertEnv,
  validVapidKeys,
} from './push.mjs';
import { parseEnv } from './supabase-checks.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const SITE = 'https://satoshinakajojo.github.io/dashboard/club/';
const rotate = process.argv.includes('--rotate');

function stop(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function step(title) {
  console.log(`\n— ${title}`);
}

async function call(url, options) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } catch (cause) {
    return { status: 0, body: cause instanceof Error ? cause.message : String(cause) };
  }
}

/**
 * La CLI Supabase, sortie à l'écran : ses propres messages valent mieux qu'un
 * résumé.
 *
 * Sans entrée clavier (`ignore`) : ces commandes n'ont rien à demander avec
 * `--project-ref`, et une invite ouverte avalait les lignes collées après
 * `npm run push:setup` — `build:web` et `deploy` ne s'exécutaient jamais.
 */
function supabaseCli(args) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return result.status === 0;
}

// --- 0. Ce qu'il faut déjà avoir ----------------------------------------------

const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const env = new Map(parseEnv(envText));
const url = (env.get('EXPO_PUBLIC_SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
const serviceKey = (env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const ref = projectRefOf(url);

if (!ref)
  stop(
    'EXPO_PUBLIC_SUPABASE_URL manque dans mobile/.env, ou n’est pas une adresse *.supabase.co.',
  );
if (keyKind(serviceKey) === 'missing' || keyKind(serviceKey) === 'public') {
  stop(
    'SUPABASE_SERVICE_ROLE_KEY (la clé secrète, « service_role ») manque dans mobile/.env.\n' +
      '  Supabase → Project Settings → API Keys. Sans le préfixe EXPO_PUBLIC_ : elle ne\n' +
      '  doit jamais entrer dans l’app.',
  );
}

const admin = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

// La migration d'abord : sans elle, rien de ce qui suit n'a où s'accrocher.
const probe = await call(`${url}/rest/v1/rpc/notify_status`, {
  method: 'POST',
  headers: admin,
  body: '{}',
});
if (probe.status === 404) {
  stop(
    'La migration des notifications n’est pas en base. Lancez d’abord :  npx supabase db push',
  );
}
if (probe.status !== 200) {
  stop(`La base ne répond pas comme prévu (${probe.status}) : ${JSON.stringify(probe.body)}`);
}

// --- 1. Clés VAPID -------------------------------------------------------------

step('Clés VAPID');
let publicKey = env.get('EXPO_PUBLIC_VAPID_PUBLIC_KEY') ?? '';
let privateKey = env.get('VAPID_PRIVATE_KEY') ?? '';
if (rotate || !validVapidKeys(publicKey, privateKey)) {
  if (!rotate && (publicKey || privateKey)) {
    console.log('  Les clés présentes dans .env sont incomplètes : nouvelle paire.');
  }
  ({ publicKey, privateKey } = generateVapidKeys());
  writeFileSync(
    ENV_FILE,
    upsertEnv(
      envText,
      { EXPO_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey },
      'Notifications push — posées par `npm run push:setup`.\n' +
        'La publique entre dans la build ; la privée ne sort jamais de cette machine\n' +
        'et du serveur (pas de préfixe EXPO_PUBLIC_).',
    ),
  );
  console.log(
    rotate
      ? '  ✓ nouvelle paire écrite dans .env — les appareils abonnés devront réactiver'
      : '  ✓ paire générée et écrite dans .env',
  );
} else {
  console.log('  ✓ paire existante reprise de .env');
}

// --- 2. Secrets de la fonction -------------------------------------------------

step('Secrets de la fonction notify');
const notifySecret = newNotifySecret();
const scratch = mkdtempSync(path.join(tmpdir(), 'ssc-push-'));
const secretsFile = path.join(scratch, 'secrets.env');
try {
  writeFileSync(
    secretsFile,
    [
      `VAPID_PUBLIC_KEY=${publicKey}`,
      `VAPID_PRIVATE_KEY=${privateKey}`,
      `VAPID_SUBJECT=${SITE}`,
      `NOTIFY_SECRET=${notifySecret}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  if (!supabaseCli(['secrets', 'set', '--project-ref', ref, '--env-file', secretsFile])) {
    stop('supabase secrets set a échoué — voir le message ci-dessus (npx supabase login ?).');
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// --- 3. Déploiement ------------------------------------------------------------

step('Déploiement de notify');
if (!supabaseCli(['functions', 'deploy', 'notify', '--project-ref', ref, '--no-verify-jwt'])) {
  stop('Le déploiement a échoué — voir le message ci-dessus.');
}

// --- 4. Coffre-fort --------------------------------------------------------------

step('Adresse et secret d’appel dans la base');
const configured = await call(`${url}/rest/v1/rpc/set_notify_config`, {
  method: 'POST',
  headers: admin,
  body: JSON.stringify({ p_url: `${url}/functions/v1/notify`, p_secret: notifySecret }),
});
if (configured.status !== 200 && configured.status !== 204) {
  stop(
    `set_notify_config a échoué (${configured.status}) : ${JSON.stringify(configured.body)}`,
  );
}
console.log('  ✓ rangés dans le coffre-fort (Vault)');

// --- 5. Planification ----------------------------------------------------------

step('Battement (pg_cron)');
let status = (
  await call(`${url}/rest/v1/rpc/notify_status`, { method: 'POST', headers: admin, body: '{}' })
).body;
if (!status?.scheduled) {
  const scheduled = await call(`${url}/rest/v1/rpc/schedule_notifications`, {
    method: 'POST',
    headers: admin,
    body: '{}',
  });
  console.log(`  ${scheduled.body === 'planifié' ? '✓' : '✗'} ${scheduled.body}`);
  if (scheduled.body !== 'planifié') {
    console.log(
      '    → Supabase → Database → Extensions : activer pg_cron et pg_net, puis relancer\n' +
        '      npm run push:setup',
    );
  }
} else {
  console.log('  ✓ déjà planifié');
}

// --- 6. Diagnostic ---------------------------------------------------------------

step('Vérification');
// Un appel réel, avec le secret : prouve déploiement, secrets et accès à la base.
const ping = await call(`${url}/functions/v1/notify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-notify-secret': notifySecret },
  body: '{}',
});
console.log(
  ping.status === 200
    ? `  ✓ notify répond (${ping.body?.jobs ?? 0} notification(s) en attente traitée(s))`
    : `  ✗ notify répond ${ping.status} : ${JSON.stringify(ping.body)}`,
);

status = (
  await call(`${url}/rest/v1/rpc/notify_status`, { method: 'POST', headers: admin, body: '{}' })
).body;
for (const line of describeStatus(status)) {
  console.log(`  ${line.ok ? '✓' : '✗'} ${line.label.padEnd(12)} ${line.detail}`);
}

console.log(
  '\nReste à reconstruire l’app, pour qu’elle embarque la clé publique :\n' +
    '  npm run build:web\n' +
    '  npm run deploy\n' +
    'puis, depuis ~/dashboard : git add club && git commit -m "Club : nouvelle version" && git push\n' +
    '\nEnsuite, sur chaque téléphone : Mon profil → Notifications → Activer sur cet appareil.\n' +
    'Sur iPhone, l’app doit être ouverte depuis l’écran d’accueil.\n',
);
if (ping.status !== 200) process.exitCode = 1;
