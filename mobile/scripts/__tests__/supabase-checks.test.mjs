/**
 * Verdicts du diagnostic Supabase.
 *
 * Un diagnostic qui se trompe est pire que pas de diagnostic : il envoie
 * chercher une panne ailleurs. Comme aucun projet en ligne n'est disponible
 * pendant les tests, chaque réponse de la plateforme est rejouée ici telle
 * qu'elle arrive — codes PostgREST compris.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkAnonKey,
  checkUrl,
  describeKey,
  describeNetworkError,
  formatReport,
  EDGE_FUNCTIONS,
  interpretColumn,
  interpretFunction,
  interpretMembers,
  interpretReachable,
  interpretSettings,
  interpretSiteUrl,
  interpretTable,
  needsSecretKey,
  schemaNote,
  leakedPublicSecrets,
  parseCount,
  parseEnv,
  projectRef,
  secretsInText,
  summarize,
  TABLES,
} from '../supabase-checks.mjs';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const HEADER = b64({ alg: 'HS256', typ: 'JWT' });

/** Un JWT Supabase crédible : ce sont les revendications qui nous intéressent. */
const jwt = (claims) => `${HEADER}.${b64(claims)}.c2lnbmF0dXJl`;

const REF = 'abcdefghijklmnopqrst';
const URL_OK = `https://${REF}.supabase.co`;
const ANON = jwt({ iss: 'supabase', ref: REF, role: 'anon', exp: 2_000_000_000 });
const SERVICE = jwt({ iss: 'supabase', ref: REF, role: 'service_role', exp: 2_000_000_000 });

describe('lecture du .env', () => {
  it('ignore les commentaires et les lignes vides', () => {
    const env = parseEnv('# rien\n\nA=1\n  # encore\nB=2\n');
    assert.deepEqual([...env], [['A', '1'], ['B', '2']]);
  });

  it('retire les guillemets et le mot-clé export', () => {
    const env = parseEnv('export A="un"\nB=\'deux\'\nC=""\n');
    assert.equal(env.get('A'), 'un');
    assert.equal(env.get('B'), 'deux');
    assert.equal(env.get('C'), '');
  });

  it('garde les signes égal de la valeur', () => {
    // Les JWT n'en contiennent pas, mais les mots de passe SMTP, si.
    assert.equal(parseEnv('K=a=b=c').get('K'), 'a=b=c');
  });
});

describe('description d’une clé', () => {
  it('lit le rôle et le projet d’un JWT sans le divulguer', () => {
    const info = describeKey(ANON);
    assert.equal(info.kind, 'jwt');
    assert.equal(info.role, 'anon');
    assert.equal(info.ref, REF);
    assert.equal(JSON.stringify(info).includes(ANON), false);
  });

  it('reconnaît les clés nommées à leur préfixe', () => {
    assert.deepEqual(describeKey('sb_publishable_abcdef123456'), { kind: 'publishable', role: 'anon' });
    assert.deepEqual(describeKey('sb_secret_abcdef123456'), { kind: 'secret', role: 'service_role' });
  });

  it('ne se laisse pas avoir par une copie tronquée', () => {
    assert.equal(describeKey('eyJhbGciOi').kind, 'inconnu');
    assert.equal(describeKey('   ').kind, 'absent');
  });

  it('extrait l’identifiant de projet de l’URL', () => {
    assert.equal(projectRef(URL_OK), REF);
    assert.equal(projectRef('https://club.example.com'), null);
    assert.equal(projectRef('pas une url'), null);
  });
});

describe('vérification de l’URL', () => {
  it('accepte une URL de projet', () => {
    assert.equal(checkUrl(URL_OK).level, 'ok');
  });

  it('refuse une variable vide', () => {
    assert.equal(checkUrl('').level, 'fail');
  });

  it('refuse l’adresse d’une API collée à la place du projet', () => {
    const check = checkUrl(`${URL_OK}/rest/v1`);
    assert.equal(check.level, 'fail');
    assert.match(check.detail, /API/);
  });

  it('signale la barre oblique finale sans en faire un drame', () => {
    assert.equal(checkUrl(`${URL_OK}/`).level, 'warn');
  });

  it('accepte la pile locale, qui écoute en clair', () => {
    const check = checkUrl('http://127.0.0.1:54321');
    assert.equal(check.level, 'ok');
    assert.match(check.detail, /locale/);
    assert.equal(checkUrl('http://exemple.fr').level, 'fail');
  });
});

describe('vérification de la clé anon', () => {
  it('accepte la bonne clé', () => {
    assert.equal(checkAnonKey(ANON, URL_OK).level, 'ok');
    assert.equal(checkAnonKey('sb_publishable_abcdef123456', URL_OK).level, 'ok');
  });

  it('crie quand c’est la clé service_role', () => {
    const check = checkAnonKey(SERVICE, URL_OK);
    assert.equal(check.level, 'fail');
    assert.match(check.detail, /SERVICE_ROLE/);
    assert.match(check.remedy, /révoquez/);
  });

  it('détecte une clé qui vient d’un autre projet', () => {
    const other = jwt({ ref: 'zzzzzzzzzzzzzzzzzzzz', role: 'anon', exp: 2_000_000_000 });
    assert.equal(checkAnonKey(other, URL_OK).level, 'fail');
  });

  it('détecte une clé expirée', () => {
    const old = jwt({ ref: REF, role: 'anon', exp: 1_000_000_000 });
    const check = checkAnonKey(old, URL_OK, 1_700_000_000_000);
    assert.equal(check.level, 'fail');
    assert.match(check.detail, /expirée/);
  });
});

describe('fuite de secret', () => {
  it('refuse une clé service_role derrière un préfixe EXPO_PUBLIC_', () => {
    const leaks = leakedPublicSecrets(parseEnv(`EXPO_PUBLIC_SUPABASE_ANON_KEY=${SERVICE}`));
    assert.equal(leaks.length, 1);
    assert.equal(leaks[0].level, 'fail');
  });

  it('laisse tranquille la même clé sans préfixe', () => {
    assert.deepEqual(leakedPublicSecrets(parseEnv(`SUPABASE_SERVICE_ROLE_KEY=${SERVICE}`)), []);
  });

  it('retrouve un secret dans un fichier déjà publié', () => {
    assert.deepEqual(secretsInText(`const k="${SERVICE}"`), ['un JWT de rôle service_role']);
    assert.deepEqual(secretsInText('x=sb_secret_abcdef123456'), ['une clé sb_secret_']);
  });

  it('ne signale pas la clé anon, qui est publique par construction', () => {
    assert.deepEqual(secretsInText(`const k="${ANON}"`), []);
  });
});

describe('joignabilité du projet', () => {
  it('accepte une réponse des paramètres d’authentification', () => {
    assert.equal(interpretReachable({ status: 200, body: { external: {} } }).level, 'ok');
  });

  it('conclut à un projet en pause sur une 5xx', () => {
    const check = interpretReachable({ status: 503, body: null });
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /Restore/);
  });

  it('conclut à une clé refusée sur une 401', () => {
    assert.equal(
      interpretReachable({ status: 401, body: { message: 'Invalid API key' } }).level,
      'fail',
    );
  });

  it('n’accuse pas la clé quand c’est le point d’entrée qui exige un secret', () => {
    // Message réel d'un projet sain sondé sur la racine PostgREST avec une clé
    // `sb_publishable_`. La clé est bonne ; c'était la sonde qui était fausse.
    const refused = { status: 401, body: { message: 'Secret API key required' } };
    assert.equal(needsSecretKey(refused.body), true);
    assert.match(interpretReachable(refused).detail, /n’est pas en cause/);
  });

  it('distingue une API de données fermée aux clés publiables d’une table absente', () => {
    const refused = { status: 401, body: { message: 'Secret API key required' } };
    const check = interpretTable('events', refused);
    assert.match(check.detail, /clés secrètes/);
    assert.match(check.remedy, /Data API/);
  });
});

describe('lecture d’ensemble du schéma', () => {
  it('ne conclut pas à sept oublis quand rien ne répond', () => {
    const absent = { status: 404, body: { code: 'PGRST205' } };
    const checks = TABLES.map((table) => interpretTable(table, absent));
    assert.match(schemaNote(checks), /API de données est désactivée/);
  });

  it('se tait dès qu’une table répond', () => {
    const checks = [
      interpretTable('profiles', { status: 200, body: [] }),
      interpretTable('events', { status: 404, body: { code: 'PGRST205' } }),
    ];
    assert.equal(schemaNote(checks), undefined);
  });
});

describe('tables', () => {
  it('voit une table présente et fermée quand rien ne sort', () => {
    assert.equal(interpretTable('events', { status: 200, body: [] }).level, 'ok');
  });

  it('voit une RLS absente quand un visiteur anonyme lit des lignes', () => {
    const check = interpretTable('events', { status: 200, body: [{ id: 1 }] });
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /enable row level security/);
  });

  it('voit une migration non appliquée', () => {
    const missing = {
      status: 404,
      body: { code: 'PGRST205', message: "Could not find the table 'public.predictions' in the schema cache" },
    };
    const check = interpretTable('predictions', missing);
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /init\.sql/);
  });

  it('accepte une lecture anonyme révoquée : plus fermé, pas moins', () => {
    const denied = { status: 403, body: { code: '42501', message: 'permission denied for table events' } };
    assert.equal(interpretTable('events', denied).level, 'ok');
  });
});

describe('colonnes ajoutées après coup', () => {
  const spec = { table: 'tickers', column: 'yahoo_symbol', migration: '20260914120000_yahoo_symbol.sql' };

  it('accepte une colonne présente', () => {
    assert.equal(interpretColumn(spec, { status: 200, body: [] }).level, 'ok');
  });

  it('nomme la migration manquante', () => {
    const absent = { status: 400, body: { code: '42703', message: 'column tickers.yahoo_symbol does not exist' } };
    const check = interpretColumn(spec, absent);
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /yahoo_symbol\.sql/);
  });
});

describe('paramètres d’authentification', () => {
  it('bloque si le fournisseur Email est désactivé', () => {
    const checks = interpretSettings({ status: 200, body: { external: { email: false }, disable_signup: true } });
    assert.equal(checks[0].level, 'fail');
  });

  it('avertit si l’inscription est ouverte', () => {
    const checks = interpretSettings({ status: 200, body: { external: { email: true }, disable_signup: false } });
    assert.equal(checks[0].level, 'ok');
    assert.equal(checks[1].level, 'warn');
  });

  it('valide un club fermé', () => {
    const checks = interpretSettings({ status: 200, body: { external: { email: true }, disable_signup: true } });
    assert.deepEqual(checks.map((c) => c.level), ['ok', 'ok']);
  });
});

describe('où mène le lien d’un courriel', () => {
  const redirect = (location) => ({
    status: 302,
    headers: new Headers(location ? { location } : {}),
  });

  it('refuse le localhost par défaut d’un projet neuf', () => {
    const check = interpretSiteUrl(redirect('http://localhost:3000/#error=invalid'));
    assert.equal(check.level, 'fail');
    assert.match(check.detail, /ne mènent nulle part/);
    assert.match(check.remedy, /Site URL/);
  });

  it('accepte une adresse publiée et la montre', () => {
    const check = interpretSiteUrl(redirect('https://moi.github.io/dashboard/club/#error=x'));
    assert.equal(check.level, 'ok');
    assert.equal(check.detail, 'https://moi.github.io');
  });

  it('doute plutôt que de conclure quand il n’y a pas de redirection', () => {
    assert.equal(interpretSiteUrl({ status: 200, headers: new Headers() }).level, 'warn');
    assert.equal(interpretSiteUrl(redirect('')).level, 'warn');
  });
});

describe('fonctions Edge', () => {
  const QUOTE = EDGE_FUNCTIONS.find((fn) => fn.name === 'quote').refusal;

  it('lit une 404 comme une fonction non déployée', () => {
    const check = interpretFunction('quote', { status: 404, body: { code: 'NOT_FOUND' } }, QUOTE);
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /functions deploy quote/);
  });

  it('lit le refus « réservé aux membres » comme une preuve de déploiement', () => {
    const refused = { status: 401, body: { error: 'Réservé aux membres' } };
    assert.equal(interpretFunction('quote', refused, QUOTE).level, 'ok');
  });

  it('ne conclut pas au déploiement sur une 401 qui n’est pas la sienne', () => {
    // Un 401 seul ne dit pas quel programme l'a écrit. Sans le message de la
    // fonction, le script doute à voix haute plutôt que de rassurer à tort.
    const check = interpretFunction('quote', { status: 401, body: {} }, QUOTE);
    assert.equal(check.level, 'warn');
    assert.match(check.detail, /pas le sien/);
  });

  it('couvre chaque fonction du club', () => {
    assert.deepEqual(EDGE_FUNCTIONS.map((fn) => fn.name), ['quote', 'refresh-prices']);
    for (const fn of EDGE_FUNCTIONS) assert.ok(fn.refusal instanceof RegExp, fn.name);
  });

  it('distingue le refus de la passerelle de celui de la fonction', () => {
    const gateway = { status: 401, body: { message: 'Invalid JWT' } };
    const check = interpretFunction('quote', gateway, QUOTE);
    assert.equal(check.level, 'fail');
    assert.match(check.detail, /passerelle/);
  });

  it('pointe les secrets manquants sur une 500', () => {
    const refused = { status: 500, body: { error: 'Environnement incomplet' } };
    const check = interpretFunction('refresh-prices', refused);
    assert.equal(check.level, 'fail');
    assert.match(check.remedy, /secrets set/);
  });
});

describe('membres', () => {
  it('lit le total dans l’en-tête content-range', () => {
    assert.equal(parseCount('0-0/7'), 7);
    assert.equal(parseCount('*/0'), 0);
    assert.equal(parseCount(null), null);
  });

  it('bloque quand aucun compte n’existe', () => {
    assert.equal(interpretMembers(0, 0).level, 'fail');
  });

  it('avertit quand les comptes existent mais que personne ne s’est connecté', () => {
    assert.equal(interpretMembers(0, 7).level, 'warn');
  });

  it('compte les profils et rappelle les comptes en attente', () => {
    const check = interpretMembers(3, 7);
    assert.equal(check.level, 'ok');
    assert.match(check.detail, /3 profil\(s\), sur 7 compte\(s\)/);
  });
});

describe('pannes réseau', () => {
  it('traduit ce qu’un fetch peut lever', () => {
    assert.match(describeNetworkError(new Error('x', { cause: { code: 'ENOTFOUND' } })), /introuvable/);
    assert.equal(describeNetworkError(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'délai dépassé');
    assert.match(describeNetworkError(new Error('x', { cause: { code: 'ECONNREFUSED' } })), /refusée/);
  });
});

describe('rapport', () => {
  const sections = [
    {
      title: 'Schéma',
      checks: [
        { level: 'ok', label: 'events', detail: 'présente' },
        { level: 'fail', label: 'predictions', detail: 'absente', remedy: 'appliquez la migration' },
      ],
    },
  ];

  it('reste lisible sans couleur', () => {
    const report = formatReport(sections);
    assert.equal(report.includes('\u001b['), false);
    assert.match(report, /✓ events/);
    assert.match(report, /→ appliquez la migration/);
  });

  it('compte les verdicts', () => {
    assert.deepEqual(summarize(sections), { ok: 1, warn: 0, fail: 1 });
  });
});
