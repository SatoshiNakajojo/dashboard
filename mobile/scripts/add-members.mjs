/**
 * `npm run members:add -- alex@mail.com lea@mail.nc …` — inscrit les membres.
 *
 * Le club est fermé : l'app demande un code avec `shouldCreateUser: false`, et
 * seules les adresses déjà inscrites en reçoivent un. Cette commande crée les
 * comptes (confirmés d'office) ; chaque membre ouvre ensuite l'app, saisit son
 * adresse, reçoit son code, choisit son prénom — et son profil existe.
 *
 * Sans adresse, elle liste les comptes et dit qui a déjà créé son profil.
 *
 * Elle a besoin de la clé **secrète** du projet, `SUPABASE_SERVICE_ROLE_KEY`,
 * lue dans `.env` — sans préfixe `EXPO_PUBLIC_`, donc jamais embarquée dans
 * l'app. Elle ne l'affiche jamais. Relancer avec la même liste est sans
 * danger : une adresse déjà inscrite est signalée, pas recréée.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { interpretCreate, keyKind, memberRows, parseEmails } from './members.mjs';
import { parseEnv } from './supabase-checks.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT = 15_000;

function loadEnv() {
  const env = new Map();
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (existsSync(file)) {
      for (const [key, value] of parseEnv(readFileSync(file, 'utf8'))) env.set(key, value);
    }
  }
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (process.env[name]) env.set(name, process.env[name]);
  }
  return env;
}

async function call(url, options) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function stop(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const env = loadEnv();
const url = (env.get('EXPO_PUBLIC_SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
const key = (env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

// https, ou un Supabase local (`supabase start` sert sur http://127.0.0.1).
if (!/^https:\/\/\S+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  stop('EXPO_PUBLIC_SUPABASE_URL manque dans mobile/.env — la même adresse que pour la build.');
}
switch (keyKind(key)) {
  case 'missing':
    stop(
      'SUPABASE_SERVICE_ROLE_KEY manque dans mobile/.env.\n' +
        '  Supabase → Project Settings → API Keys → clé « service_role » (ou « secret »).\n' +
        '  Ajoutez la ligne  SUPABASE_SERVICE_ROLE_KEY=…  dans mobile/.env,\n' +
        '  SANS le préfixe EXPO_PUBLIC_ : cette clé ne doit jamais entrer dans l’app.',
    );
    break;
  case 'public':
    stop(
      'SUPABASE_SERVICE_ROLE_KEY contient la clé publique (anon / publishable).\n' +
        '  Il faut la clé secrète : Project Settings → API Keys → « service_role » (ou « secret »).',
    );
    break;
  default:
}

const headers = {
  apikey: key,
  authorization: `Bearer ${key}`,
  'content-type': 'application/json',
};

const { valid, invalid } = parseEmails(process.argv.slice(2));

if (invalid.length > 0) {
  console.log(`\nIgnoré — pas une adresse : ${invalid.join(', ')}`);
}

if (valid.length > 0) {
  console.log(`\nInscription de ${valid.length} membre(s)…\n`);
  let failed = 0;
  for (const email of valid) {
    const response = await call(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      // Confirmé d'office : sans ça, le membre devrait valider son adresse avant
      // de pouvoir demander un code.
      body: JSON.stringify({ email, email_confirm: true }),
    });
    const result = interpretCreate(response.status, response.body);
    if (result.kind === 'created') console.log(`  ✓ ${email} — compte créé`);
    else if (result.kind === 'exists') console.log(`  · ${email} — déjà inscrit`);
    else {
      failed += 1;
      console.log(`  ✗ ${email} — ${result.detail}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

// Le tableau, toujours : c'est ce qui dit où en est chacun.
const users = await call(`${url}/auth/v1/admin/users?per_page=200`, { headers });
const profiles = await call(`${url}/rest/v1/profiles?select=id,display_name`, { headers });

if (users.status !== 200) {
  stop(interpretCreate(users.status, users.body).detail ?? `liste des comptes illisible (${users.status})`);
}

const rows = memberRows(users.body?.users, Array.isArray(profiles.body) ? profiles.body : []);
console.log(`\nMembres inscrits (${rows.length}) :\n`);
for (const row of rows) {
  const status = row.name ? `profil créé — ${row.name}` : 'pas encore connecté';
  console.log(`  ${row.email.padEnd(34)} ${status}`);
}

const waiting = rows.filter((row) => !row.name).length;
if (waiting > 0) {
  console.log(
    `\n${waiting} membre(s) à prévenir : qu’ils ouvrent l’app, saisissent leur adresse,\n` +
      'recopient le code reçu par courriel et choisissent leur prénom.\n',
  );
} else {
  console.log('\nTout le monde a créé son profil.\n');
}
