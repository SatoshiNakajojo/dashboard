/**
 * `npm run check:supabase` — dit en une commande ce qui manque au backend.
 *
 * Le tableau de bord Supabase répartit la configuration du club sur sept
 * écrans ; une case oubliée ne se manifeste que plus tard, par un courriel qui
 * n'arrive pas ou une liste vide. Ce script pose les questions à la place du
 * membre et répond en clair, avec le remède à côté de chaque manque.
 *
 * Il lit le même `.env` que la build : ce qu'il teste est bien ce que l'app
 * utilisera. Il n'écrit rien, n'affiche aucune clé, et se contente de la clé
 * anon — publique par construction. Une variable `SUPABASE_SERVICE_ROLE_KEY`
 * (sans préfixe `EXPO_PUBLIC_`, donc jamais embarquée) débloque en plus le
 * décompte des membres.
 *
 * Sortie non nulle dès qu'un point bloquant est détecté, pour qu'un script
 * d'intégration puisse s'en servir.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLUMNS,
  TABLES,
  checkAnonKey,
  checkUrl,
  describeNetworkError,
  formatReport,
  interpretColumn,
  interpretFunction,
  interpretMembers,
  interpretRest,
  interpretSettings,
  interpretTable,
  leakedPublicSecrets,
  parseCount,
  parseEnv,
  secretsInText,
  summarize,
} from './supabase-checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TIMEOUT = 12_000;

// ---------------------------------------------------------------------------
// Environnement
// ---------------------------------------------------------------------------

/**
 * Même ordre de priorité qu'Expo : `.env.local` l'emporte sur `.env`, et une
 * variable déjà présente dans le shell l'emporte sur les deux.
 */
function loadEnv() {
  const env = new Map();
  const files = [];
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    files.push(name);
    for (const [key, value] of parseEnv(readFileSync(file, 'utf8'))) env.set(key, value);
  }
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (process.env[name]) env.set(name, process.env[name]);
  }
  return { env, files };
}

// ---------------------------------------------------------------------------
// Réseau
// ---------------------------------------------------------------------------

/** Un appel qui ne lève jamais : l'échec devient une réponse comme une autre. */
async function probe(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  } catch (error) {
    return { status: 0, body: null, headers: new Headers(), error };
  }
}

/** Traduit une panne réseau avant qu'un interpréteur n'en fasse un « code 0 ». */
function guard(label, response, interpret) {
  if (response.error) {
    return { level: 'fail', label, detail: describeNetworkError(response.error) };
  }
  return interpret(response);
}

// ---------------------------------------------------------------------------
// Ce qui est déjà publié
// ---------------------------------------------------------------------------

/** Les fichiers texte d'un dossier de build, où une clé aurait pu se glisser. */
function textFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) textFiles(full, out);
    else if (/\.(js|mjs|html|json|map)$/.test(entry.name) && statSync(full).size < 16_000_000) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Une clé secrète dans un `.env` se corrige ; publiée, elle est compromise pour
 * de bon. Le dossier `club/` étant servi tel quel par GitHub Pages, c'est le
 * seul endroit où une erreur est irréversible — on le relit donc à chaque fois.
 */
function checkPublished(dir, label) {
  if (!existsSync(dir)) return [];
  const leaks = [];
  for (const file of textFiles(dir)) {
    for (const what of secretsInText(readFileSync(file, 'utf8'))) {
      leaks.push({
        level: 'fail',
        label: path.relative(ROOT, file),
        detail: `contient ${what}`,
        remedy: 'révoquez la clé immédiatement, puis reconstruisez et republiez',
      });
    }
  }
  return leaks.length > 0
    ? leaks
    : [{ level: 'ok', label, detail: 'aucune clé secrète dans les fichiers publiés' }];
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

async function main() {
  const { env, files } = loadEnv();
  const url = (env.get('EXPO_PUBLIC_SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
  const anonKey = (env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY') ?? '').trim();
  const serviceKey = (env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

  const configuration = {
    title: 'Configuration',
    checks: [
      files.length > 0
        ? { level: 'ok', label: 'Source', detail: files.join(', ') }
        : url || anonKey
          ? { level: 'ok', label: 'Source', detail: 'variables du shell (aucun .env)' }
          : {
              level: 'fail',
              label: 'Source',
              detail: 'aucun .env — l’app tourne sur les données de démonstration',
              remedy: 'cp .env.example .env, puis remplissez les deux premières lignes',
            },
      checkUrl(env.get('EXPO_PUBLIC_SUPABASE_URL')),
      checkAnonKey(anonKey, url),
      ...leakedPublicSecrets(env),
    ],
  };

  const sections = [configuration];
  const blocked = configuration.checks.some((check) => check.level === 'fail');

  if (!blocked) {
    const anon = { apikey: anonKey, authorization: `Bearer ${anonKey}` };

    const restRoot = await probe(`${url}/rest/v1/`, { headers: anon });
    const rest = guard('API REST', restRoot, interpretRest);

    const connection = { title: 'Connexion', checks: [rest] };
    sections.push(connection);

    if (rest.level === 'fail') {
      connection.note = 'Le reste du diagnostic est suspendu : rien d’autre ne peut répondre.';
    } else {
      // --- schéma -----------------------------------------------------------
      const tables = await Promise.all(
        TABLES.map(async (table) => {
          const response = await probe(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: anon });
          return guard(table, response, (r) => interpretTable(table, r));
        }),
      );
      const columns = await Promise.all(
        COLUMNS.map(async (probeSpec) => {
          const { table, column } = probeSpec;
          const response = await probe(`${url}/rest/v1/${table}?select=${column}&limit=1`, { headers: anon });
          return guard(`${table}.${column}`, response, (r) => interpretColumn(probeSpec, r));
        }),
      );
      sections.push({
        title: 'Schéma',
        checks: [...tables, ...columns],
        note: '« fermée aux visiteurs » veut dire que la RLS répond : sans session, aucune ligne ne sort.',
      });

      // --- authentification -------------------------------------------------
      const settings = await probe(`${url}/auth/v1/settings`, { headers: anon });
      sections.push({
        title: 'Authentification',
        checks: settings.error
          ? [{ level: 'fail', label: 'Authentification', detail: describeNetworkError(settings.error) }]
          : interpretSettings(settings),
      });

      // --- fonctions Edge ---------------------------------------------------
      // `quote` s'arrête à la vérification de session : sonder ne coûte aucun
      // appel sortant. `refresh-prices` est protégée par REFRESH_SECRET ; à
      // défaut de secret configuré, le sondage déclenche une mise à jour des
      // prix — c'est exactement ce que fait la planification horaire.
      const quote = await probe(`${url}/functions/v1/quote?symbol=AAPL`, { headers: anon });
      const refresh = await probe(`${url}/functions/v1/refresh-prices`, {
        method: 'POST',
        headers: { ...anon, 'x-refresh-secret': 'diagnostic' },
      });
      sections.push({
        title: 'Fonctions Edge',
        checks: [
          guard('quote', quote, (r) => interpretFunction('quote', r)),
          guard('refresh-prices', refresh, (r) => interpretFunction('refresh-prices', r)),
        ],
      });

      // --- membres ----------------------------------------------------------
      if (serviceKey) {
        const service = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
        const profiles = await probe(`${url}/rest/v1/profiles?select=id`, {
          headers: { ...service, prefer: 'count=exact', range: '0-0' },
        });
        const users = await probe(`${url}/auth/v1/admin/users?per_page=200`, { headers: service });
        const accounts = Array.isArray(users.body?.users) ? users.body.users.length : null;
        sections.push({
          title: 'Membres',
          checks: [
            guard('Membres', profiles, (r) =>
              interpretMembers(parseCount(r.headers.get('content-range')), accounts),
            ),
          ],
        });
      } else {
        sections.push({
          title: 'Membres',
          checks: [],
          note: 'Non vérifié. Ajoutez SUPABASE_SERVICE_ROLE_KEY=… dans .env (sans préfixe EXPO_PUBLIC_) pour compter les comptes.',
        });
      }
    }
  }

  sections.push({
    title: 'Ce qui est publié',
    checks: [
      ...checkPublished(path.join(ROOT, '..', 'club'), 'club/'),
      ...checkPublished(path.join(ROOT, 'dist'), 'dist/'),
    ],
  });

  const tally = summarize(sections);
  const colour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

  console.log(formatReport(sections, { colour }));
  console.log(`\n${tally.ok} ✓   ${tally.warn} !   ${tally.fail} ✗`);

  console.log(
    [
      '',
      'Hors de portée d’un script — à vérifier dans le tableau de bord :',
      '  • Le modèle « Magic Link » doit contenir {{ .Token }}, sinon le courriel',
      '    envoie un lien au lieu du code à six chiffres attendu par l’app.',
      '    Authentication → Emails → Magic Link',
      '  • Le SMTP personnalisé lève la limite de 3 courriels par heure.',
      '    Authentication → Emails → SMTP',
      '  • Les tables publiées en temps réel, à confirmer dans le SQL Editor :',
      "    select tablename from pg_publication_tables where pubname = 'supabase_realtime';",
      '    Attendu : potluck_items, event_attendees, ticker_votes, tickers.',
    ].join('\n'),
  );

  process.exitCode = tally.fail > 0 ? 1 : 0;
}

await main();
