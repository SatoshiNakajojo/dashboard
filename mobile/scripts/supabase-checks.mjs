/**
 * Interprétation des réponses d'un projet Supabase.
 *
 * Module **pur** : ni réseau, ni disque. Chaque verdict est donc vérifiable
 * sans projet en ligne (`scripts/__tests__/supabase-checks.test.mjs`), ce qui
 * compte ici plus qu'ailleurs — un diagnostic qui se trompe envoie chercher une
 * panne qui n'existe pas. Les entrées/sorties vivent dans `check-supabase.mjs`.
 *
 * Règle de fond : on ne renvoie **jamais** la valeur d'une clé, seulement ce
 * qu'on peut en dire (rôle, projet, validité). Un rapport qu'on recopie dans
 * une conversation ne doit pas être un secret qui fuit.
 */

/** Les sept tables de `20260905120000_init.sql`. */
export const TABLES = [
  'profiles',
  'events',
  'event_attendees',
  'potluck_items',
  'tickers',
  'ticker_votes',
  'predictions',
];

/**
 * Colonnes ajoutées après coup. Elles distinguent « la première migration est
 * passée » de « toutes les migrations sont passées » — un écart invisible
 * autrement, jusqu'à ce qu'une action refuse de s'enregistrer.
 */
export const COLUMNS = [
  { table: 'tickers', column: 'yahoo_symbol', migration: '20260914120000_yahoo_symbol.sql' },
  { table: 'tickers', column: 'closed_on', migration: '20260926090000_closed_calls.sql' },
  { table: 'ticker_votes', column: 'reason', migration: '20260928090000_argued_votes.sql' },
  {
    table: 'ticker_votes',
    column: 'changed_at',
    migration: '20260929090000_one_vote_change.sql',
  },
  { table: 'events', column: 'edited_at', migration: '20260930090000_edit_nights.sql' },
  {
    table: 'tickers',
    column: 'entry_confirmed_at',
    migration: '20261002090000_live_entry_price.sql',
  },
  { table: 'event_proposals', column: 'status', migration: '20261003090000_event_proposals.sql' },
  {
    table: 'tickers',
    column: 'exit_confirmed_at',
    migration: '20261007090000_live_exit_price.sql',
  },
];

const ok = (label, detail) => ({ level: 'ok', label, detail });
const warn = (label, detail, remedy) => ({ level: 'warn', label, detail, remedy });
const fail = (label, detail, remedy) => ({ level: 'fail', label, detail, remedy });

// ---------------------------------------------------------------------------
// Fichier .env
// ---------------------------------------------------------------------------

/**
 * Lecture d'un fichier `.env`. Volontairement minimale : ni interpolation, ni
 * valeurs multi-lignes. Expo n'en fait pas davantage, et un analyseur plus
 * malin donnerait ici un résultat différent de celui de la build.
 */
export function parseEnv(text) {
  const out = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const name = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    out.set(name, value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clés
// ---------------------------------------------------------------------------

const JWT_RE = /^[\w-]+\.[\w-]+\.[\w-]*$/;

/** Toute chaîne qui ressemble à un jeton JWT, où qu'elle soit trouvée. */
export const JWT_PATTERN = /eyJ[\w-]{4,}\.eyJ[\w-]{4,}\.[\w-]+/g;

/** Les clés secrètes du nouveau format s'annoncent d'elles-mêmes. */
export const SECRET_PATTERN = /sb_secret_[A-Za-z0-9_-]{8,}/g;

/**
 * Ce qu'on peut dire d'une clé sans la divulguer.
 *
 * Supabase a deux générations de clés : les JWT historiques (`eyJ…`, dont la
 * charge utile annonce le rôle et le projet en clair) et les clés nommées
 * (`sb_publishable_…` / `sb_secret_…`), opaques mais dont le préfixe suffit.
 */
export function describeKey(value) {
  const key = (value ?? '').trim();
  if (!key) return { kind: 'absent' };
  if (key.startsWith('sb_publishable_')) return { kind: 'publishable', role: 'anon' };
  if (key.startsWith('sb_secret_')) return { kind: 'secret', role: 'service_role' };
  if (!JWT_RE.test(key)) return { kind: 'inconnu' };

  const [, payload] = key.split('.');
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return {
      kind: 'jwt',
      role: typeof claims.role === 'string' ? claims.role : undefined,
      ref: typeof claims.ref === 'string' ? claims.ref : undefined,
      expiresAt: typeof claims.exp === 'number' ? claims.exp * 1000 : undefined,
    };
  } catch {
    return { kind: 'inconnu' };
  }
}

/** `true` si cette clé contourne la RLS. */
export function isSecretKey(value) {
  const { role } = describeKey(value);
  return role === 'service_role';
}

/** L'identifiant du projet, tel qu'il apparaît dans l'URL et dans les JWT. */
export function projectRef(url) {
  try {
    const host = new URL(url).hostname;
    const match = /^([a-z0-9]+)\.supabase\.(co|in|red)$/.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** La pile locale (`supabase start`) écoute en clair, sur la machine même. */
export const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

export function checkUrl(value) {
  const url = (value ?? '').trim();
  if (!url) {
    return fail(
      'URL du projet',
      'EXPO_PUBLIC_SUPABASE_URL est vide — l’app tourne sur les données de démonstration',
      'Supabase → Project Settings → Data API → Project URL',
    );
  }
  const local = LOCAL_RE.test(url);
  if (!local && !/^https:\/\//.test(url)) {
    return fail('URL du projet', 'elle doit commencer par https://');
  }
  if (/\/rest\/v1|\/auth\/v1/.test(url)) {
    return fail(
      'URL du projet',
      'c’est l’adresse d’une API, pas celle du projet',
      'ne gardez que https://<projet>.supabase.co',
    );
  }
  if (url.endsWith('/')) {
    return warn('URL du projet', 'la barre oblique finale est tolérée, mais autant l’enlever');
  }
  if (local) return ok('URL du projet', 'pile Supabase locale');

  const ref = projectRef(url);
  return ref
    ? ok('URL du projet', `projet ${ref}`)
    : ok('URL du projet', 'domaine personnalisé — l’identifiant de projet n’est pas vérifiable');
}

export function checkAnonKey(value, url, now = Date.now()) {
  const key = (value ?? '').trim();
  if (!key) {
    return fail(
      'Clé anonyme',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY est vide',
      'Supabase → Project Settings → API Keys → anon / public',
    );
  }

  const info = describeKey(key);

  if (info.role === 'service_role') {
    return fail(
      'Clé anonyme',
      'c’est la clé SERVICE_ROLE — elle contourne la RLS et elle est publiée avec l’app',
      'remplacez-la par la clé anon, puis révoquez celle-ci (API Keys → Rotate)',
    );
  }
  if (info.kind === 'inconnu') {
    return fail('Clé anonyme', 'format non reconnu — copie incomplète ?');
  }
  if (info.kind === 'jwt' && info.role && info.role !== 'anon') {
    return fail('Clé anonyme', `cette clé porte le rôle « ${info.role} », pas « anon »`);
  }
  if (info.expiresAt !== undefined && info.expiresAt < now) {
    return fail(
      'Clé anonyme',
      `expirée le ${new Date(info.expiresAt).toISOString().slice(0, 10)}`,
      'Supabase → Project Settings → API Keys',
    );
  }

  const ref = projectRef(url ?? '');
  if (ref && info.ref && info.ref !== ref) {
    return fail(
      'Clé anonyme',
      `elle appartient au projet ${info.ref}, l’URL pointe vers ${ref}`,
      'les deux valeurs viennent du même écran : recopiez-les ensemble',
    );
  }

  return ok('Clé anonyme', info.kind === 'publishable' ? 'clé publiable' : 'rôle anon, projet concordant');
}

/**
 * Cherche une clé secrète là où elle ne doit jamais être.
 *
 * Expo publie dans le bundle **toute** variable préfixée `EXPO_PUBLIC_`. Une
 * clé service_role posée là n'est pas une mauvaise pratique : c'est un accès
 * total à la base, offert à quiconque ouvre le site.
 */
export function leakedPublicSecrets(env) {
  const leaks = [];
  for (const [name, value] of env) {
    if (!name.startsWith('EXPO_PUBLIC_')) continue;
    if (isSecretKey(value)) {
      leaks.push(
        fail(
          name,
          'cette variable contient une clé secrète et part dans le bundle',
          'retirez le préfixe EXPO_PUBLIC_, puis révoquez la clé — elle est à considérer comme compromise',
        ),
      );
    }
  }
  return leaks;
}

/** Les mêmes secrets, mais cherchés dans du texte déjà publié. */
export function secretsInText(text) {
  const found = new Set();
  // On nomme la forme du secret, jamais ses caractères : ce rapport est fait
  // pour être recopié dans une conversation.
  if (SECRET_PATTERN.test(text)) found.add('une clé sb_secret_');
  for (const token of text.match(JWT_PATTERN) ?? []) {
    if (isSecretKey(token)) found.add('un JWT de rôle service_role');
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Réponses HTTP
// ---------------------------------------------------------------------------

function pgCode(body) {
  return body && typeof body === 'object' && typeof body.code === 'string' ? body.code : '';
}

function pgMessage(body) {
  if (!body || typeof body !== 'object') return '';
  for (const field of ['message', 'msg', 'error_description', 'error']) {
    if (typeof body[field] === 'string') return body[field];
  }
  return '';
}

/**
 * Un refus qui parle de clé **secrète** ne dit pas « votre clé est fausse ».
 *
 * Supabase réserve certains points d'entrée aux clés secrètes — la racine
 * PostgREST, qui sert le schéma OpenAPI, en fait partie. Une clé publiable y
 * est refusée par construction, projet parfaitement sain. Sonder cette racine
 * était mon erreur ; reconnaître le message reste utile ailleurs.
 */
export function needsSecretKey(body) {
  return /secret\s+api\s+key/i.test(pgMessage(body));
}

/**
 * Le projet répond-il ?
 *
 * On interroge `/auth/v1/settings`, public et accessible aux deux générations
 * de clés. Il prouve d'un coup que l'hôte résout, que le projet existe et que
 * la clé est acceptée — sans rien exiger de plus qu'un visiteur.
 */
export function interpretReachable({ status, body }) {
  if (status === 200) return ok('Projet', 'joignable, clé acceptée');
  if (needsSecretKey(body)) {
    return fail(
      'Projet',
      'ce point d’entrée exige une clé secrète — la clé publiable n’est pas en cause',
    );
  }
  if (status === 401 || status === 403) {
    return fail('Projet', `clé refusée — ${pgMessage(body) || 'vérifiez la clé anon'}`);
  }
  if (status === 404) {
    return fail('Projet', 'introuvable — l’URL ne désigne pas un projet Supabase');
  }
  if (status >= 500) {
    return fail(
      'Projet',
      `réponse ${status} — en pause ou en cours de démarrage ?`,
      'Supabase → Home → Restore project',
    );
  }
  return warn('Projet', `réponse inattendue (${status})`);
}

/**
 * Une table lue **sans session**.
 *
 * Toutes les politiques du club sont `to authenticated` : un visiteur anonyme
 * doit repartir les mains vides. S'il rapporte des lignes, la RLS n'est pas
 * active — et la base est ouverte à qui connaît l'adresse, qui est publique.
 */
export function interpretTable(table, { status, body }) {
  if (status === 200) {
    if (Array.isArray(body) && body.length > 0) {
      return fail(
        table,
        'un visiteur anonyme lit ses lignes — la RLS n’est pas active',
        `alter table public.${table} enable row level security;`,
      );
    }
    return ok(table, 'présente, fermée aux visiteurs');
  }
  if (status === 404 || pgCode(body) === 'PGRST205' || pgCode(body) === '42P01') {
    return fail(table, 'absente', 'appliquez supabase/migrations/20260905120000_init.sql');
  }
  if (needsSecretKey(body)) {
    return fail(
      table,
      'l’API de données n’accepte que les clés secrètes',
      'Supabase → Project Settings → Data API : autoriser les clés publiables',
    );
  }
  if (pgCode(body) === '42501') {
    // Le rôle anon n'a même pas le droit de lecture. Plus fermé que prévu, donc
    // sans danger : les membres passent par le rôle authenticated.
    return ok(table, 'présente, lecture anonyme révoquée');
  }
  if (status === 401 || status === 403) {
    return fail(table, `accès refusé — ${pgMessage(body) || 'clé invalide'}`);
  }
  return warn(table, `réponse inattendue (${status})`);
}

/**
 * Sept tables absentes d'un coup ne se lisent pas comme sept oublis.
 *
 * Soit la migration n'est jamais passée, soit l'API de données est coupée et
 * répond 404 à tout. Le script ne peut pas trancher, mais il peut nommer les
 * deux hypothèses plutôt que de laisser conclure à la première.
 */
export function schemaNote(checks) {
  const missing = checks.filter((check) => check.detail === 'absente');
  if (missing.length < checks.length || checks.length === 0) return undefined;
  return 'Aucune table ne répond : soit la migration n’est jamais passée, soit l’API de données est désactivée (Project Settings → Data API).';
}

/**
 * Les fonctions appelées par l'app, sondées avec la clé anon.
 *
 * `taken_profile_colors` n'est accordée qu'au rôle `authenticated` : un refus
 * de permission est donc la bonne réponse, et prouve à la fois qu'elle existe
 * et qu'elle est fermée. Son absence, elle, ne se verrait nulle part — l'app
 * retomberait sur une couleur de repli sans rien dire.
 */
export const RPCS = [
  { name: 'taken_profile_colors', migration: '20260919090000_profile_colors.sql' },
  { name: 'notify_status', migration: '20260927090000_push_notifications.sql' },
];

export function interpretRpc({ name, migration }, { status, body }) {
  const code = pgCode(body);
  if (code === '42501' || ((status === 401 || status === 403) && !code)) {
    return ok(name, 'présente, fermée aux visiteurs');
  }
  if (status === 404 || code === 'PGRST202') {
    return fail(name, 'absente', `appliquez supabase/migrations/${migration}`);
  }
  if (status === 200) {
    return fail(
      name,
      'un visiteur anonyme peut l’appeler',
      `revoke execute on function public.${name}() from anon;`,
    );
  }
  return warn(name, `réponse inattendue (${status})`);
}

export function interpretColumn({ table, column, migration }, { status, body }) {
  const label = `${table}.${column}`;
  if (status === 200) return ok(label, 'présente');
  if (pgCode(body) === '42703' || /does not exist/i.test(pgMessage(body))) {
    return fail(label, 'absente', `appliquez supabase/migrations/${migration}`);
  }
  if (pgCode(body) === '42501') return ok(label, 'non vérifiable, lecture anonyme révoquée');
  if (status === 404) return fail(label, `la table ${table} est absente`);
  return warn(label, `réponse inattendue (${status})`);
}

/** `/auth/v1/settings` est public : il dit comment le projet accueille un nouveau venu. */
export function interpretSettings({ status, body }) {
  if (status !== 200 || !body || typeof body !== 'object') {
    return [warn('Authentification', `paramètres illisibles (${status})`)];
  }

  const checks = [];
  const emailEnabled = body.external?.email !== false;
  checks.push(
    emailEnabled
      ? ok('Connexion par courriel', 'activée')
      : fail(
          'Connexion par courriel',
          'le fournisseur Email est désactivé — personne ne peut se connecter',
          'Authentication → Sign In / Providers → Email : activer',
        ),
  );

  checks.push(
    body.disable_signup === true
      ? ok('Inscription', 'fermée — seuls les comptes créés à la main peuvent se connecter')
      : warn(
          'Inscription',
          'ouverte : n’importe quelle adresse peut demander un code et devenir membre',
          'Authentication → Sign In / Providers → Allow new users to sign up : désactiver',
        ),
  );

  return checks;
}

/**
 * Où mène le lien d'un courriel de connexion.
 *
 * GoTrue renvoie un jeton invalide vers le *Site URL* du projet, avec l'erreur
 * en fragment. Un jeton volontairement faux révèle donc cette adresse sans
 * consommer le moindre courriel — et c'est la seule façon de la lire depuis
 * l'extérieur, elle n'apparaît dans aucune API publique.
 *
 * Sur un projet neuf elle vaut `http://localhost:3000`. Le membre reçoit alors
 * un courriel parfaitement valide dont le lien ne mène nulle part depuis un
 * téléphone — une panne qui n'a l'air d'en être une nulle part ailleurs.
 */
export function interpretSiteUrl({ status, headers }) {
  const location = headers?.get?.('location') ?? '';
  if (status < 300 || status >= 400 || !location) {
    return warn('Site URL', 'non vérifiable depuis ici', 'Authentication → URL Configuration');
  }

  let origin;
  try {
    origin = new URL(location).origin;
  } catch {
    return warn('Site URL', `redirection illisible (${location.slice(0, 40)})`);
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(origin)) {
    return fail(
      'Site URL',
      `${origin} — les liens des courriels ne mènent nulle part depuis un téléphone`,
      'Authentication → URL Configuration → Site URL : l’adresse publiée de l’app',
    );
  }
  return ok('Site URL', origin);
}

/**
 * Les fonctions Edge du club, et le refus qui prouve qu'elles tournent.
 *
 * `refusal` est le message que la fonction produit **elle-même** quand elle
 * écarte un appel. C'est ce qui distingue « déployée » de « la passerelle a
 * répondu 401 pour une autre raison » : un code de statut seul ne dit pas quel
 * programme l'a écrit.
 */
export const EDGE_FUNCTIONS = [
  { name: 'quote', path: 'quote?symbol=AAPL', method: 'GET', refusal: /réservé aux membres/i },
  { name: 'refresh-prices', path: 'refresh-prices', method: 'POST', refusal: /non autorisé/i },
  // Sans secret de battement, `notify` croit à un essai et exige un membre.
  { name: 'notify', path: 'notify', method: 'POST', refusal: /réservé aux membres/i },
];

/**
 * Une fonction Edge sondée avec la clé anon.
 *
 * Chacune refuse l'appel avant tout travail — `quote` sur la session,
 * `refresh-prices` sur `x-refresh-secret` — donc sonder n'écrit rien et ne
 * consomme aucun quota. Encore faut-il que le refus vienne bien d'elle.
 */
export function interpretFunction(name, { status, body }, refusal) {
  const message = pgMessage(body);

  if (status === 404) {
    return fail(name, 'non déployée', `supabase functions deploy ${name}`);
  }
  if (status === 401 && /jwt|authorization|api key/i.test(message)) {
    return fail(name, 'la passerelle refuse la clé anon', 'vérifiez la clé avant de conclure');
  }
  if (status === 401) {
    return refusal && refusal.test(message)
      ? ok(name, 'déployée — elle refuse un appel non authentifié, c’est voulu')
      : warn(
          name,
          `refus 401, mais pas le sien${message ? ` — « ${message} »` : ''}`,
          'redéployez-la pour lever le doute',
        );
  }
  if (status === 200) return ok(name, 'déployée et fonctionnelle');
  if (status === 400) return ok(name, 'déployée');
  if (status === 502) return warn(name, 'déployée, mais le fournisseur de cotations a refusé l’appel');
  if (status === 500 || status === 503) {
    return fail(
      name,
      `déployée mais en échec (${status}) — ${message || 'variable d’environnement manquante ?'}`,
      'supabase secrets set --env-file supabase/.env',
    );
  }
  return warn(name, `réponse inattendue (${status})`);
}

/** `content-range: 0-0/7` → 7. PostgREST ne renvoie le total que sur demande. */
export function parseCount(contentRange) {
  const match = /\/(\d+)\s*$/.exec(contentRange ?? '');
  return match ? Number(match[1]) : null;
}

export function interpretMembers(profiles, accounts) {
  if (profiles === null) return warn('Membres', 'nombre illisible');
  if (accounts !== null && accounts === 0) {
    return fail(
      'Membres',
      'aucun compte — personne ne peut se connecter',
      'Authentication → Users → Add user, une adresse par membre',
    );
  }
  if (profiles === 0) {
    return warn(
      'Membres',
      accounts === null
        ? 'aucun profil — personne ne s’est encore connecté'
        : `${accounts} compte(s), aucun profil — personne ne s’est encore connecté`,
      'le profil se crée à la première connexion réussie',
    );
  }
  const suffix = accounts !== null && accounts > profiles ? `, sur ${accounts} compte(s)` : '';
  return ok('Membres', `${profiles} profil(s)${suffix}`);
}

// ---------------------------------------------------------------------------
// Erreurs réseau
// ---------------------------------------------------------------------------

/** Ce que veut dire, en français, un `fetch` qui n'aboutit pas. */
export function describeNetworkError(error) {
  const text = [error?.name, error?.message, error?.cause?.code, error?.cause?.message]
    .filter(Boolean)
    .join(' ');
  if (/TimeoutError|aborted|ETIMEDOUT/i.test(text)) return 'délai dépassé';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) return 'nom d’hôte introuvable — l’URL est-elle correcte ?';
  if (/ECONNREFUSED/i.test(text)) return 'connexion refusée';
  if (/ECONNRESET|EPIPE/i.test(text)) return 'connexion interrompue';
  if (/certificate|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(text)) return 'certificat TLS refusé';
  return error?.message ? String(error.message) : 'échec réseau';
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const MARK = { ok: '✓', warn: '!', fail: '✗' };
const COLOUR = { ok: '\u001b[32m', warn: '\u001b[33m', fail: '\u001b[31m' };
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

/** Largeur de la colonne des intitulés, alignée sur le plus long. */
function labelWidth(sections) {
  let width = 0;
  for (const section of sections) {
    for (const check of section.checks) width = Math.max(width, check.label.length);
  }
  return Math.min(width, 30);
}

export function formatReport(sections, { colour = false } = {}) {
  const paint = (text, code) => (colour ? `${code}${text}${RESET}` : text);
  const width = labelWidth(sections);
  const lines = [];

  for (const section of sections) {
    if (section.checks.length === 0 && !section.note) continue;
    lines.push('', paint(section.title, BOLD));
    for (const check of section.checks) {
      const mark = paint(MARK[check.level], COLOUR[check.level]);
      lines.push(`  ${mark} ${check.label.padEnd(width)}  ${check.detail}`);
      if (check.remedy) lines.push(`    ${paint(`→ ${check.remedy}`, DIM)}`);
    }
    if (section.note) lines.push(paint(`  ${section.note}`, DIM));
  }

  return lines.join('\n');
}

export function summarize(sections) {
  const tally = { ok: 0, warn: 0, fail: 0 };
  for (const section of sections) {
    for (const check of section.checks) tally[check.level] += 1;
  }
  return tally;
}
