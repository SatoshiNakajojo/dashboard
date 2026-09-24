/**
 * Règles pures de `npm run members:add` — sans réseau, donc testables.
 *
 * Le club est fermé (`shouldCreateUser: false`) : seules les adresses déjà
 * inscrites reçoivent un code de connexion. Inscrire les membres passait par le
 * tableau de bord Supabase, une adresse à la fois, avec une case à ne pas
 * oublier. La commande le fait en une ligne.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Les adresses passées à la commande, nettoyées.
 *
 * On accepte ce qu'on colle naturellement : séparées par des espaces, des
 * virgules ou des points-virgules, avec des majuscules. Les doublons sont
 * retirés ; ce qui n'est pas une adresse est rendu à part, pour le signaler
 * plutôt que de l'envoyer à Supabase.
 */
export function parseEmails(args) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const token of args.join(' ').split(/[\s,;]+/)) {
    const email = token.trim().replace(/^<|>$/g, '').toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      invalid.push(token.trim());
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid };
}

/**
 * Ce que Supabase a répondu à la création d'un compte.
 *
 * Une adresse déjà inscrite n'est pas une erreur : relancer la commande avec
 * la même liste doit être sans danger.
 */
export function interpretCreate(status, body) {
  if (status >= 200 && status < 300) return { kind: 'created' };
  const code = body?.error_code ?? body?.code;
  const message = String(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? '');
  if (code === 'email_exists' || /already been registered|already registered|already exists/i.test(message)) {
    return { kind: 'exists' };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'error',
      detail: 'clé refusée — SUPABASE_SERVICE_ROLE_KEY doit être la clé secrète (service_role)',
    };
  }
  if (status === 0) return { kind: 'error', detail: 'Supabase injoignable — connexion Internet ?' };
  return { kind: 'error', detail: message || `réponse ${status}` };
}

/**
 * Le tableau des membres : chaque compte, et s'il a déjà créé son profil.
 *
 * Un compte sans profil, c'est un membre invité qui ne s'est pas encore
 * connecté — le profil se crée à la première connexion.
 */
export function memberRows(users, profiles) {
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return (users ?? [])
    .filter((u) => u?.email)
    .map((u) => ({
      email: String(u.email).toLowerCase(),
      name: names.get(u.id) ?? null,
      lastSignIn: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Quelle sorte de clé a-t-on sous la main ?
 *
 * Créer un compte demande la clé **secrète** (`service_role`, ou `sb_secret_…`
 * dans le nouveau format). La clé publique de l'app (`anon`,
 * `sb_publishable_…`) n'y suffit pas : autant le dire avant d'essayer, avec
 * le bon remède, plutôt que d'afficher sept refus.
 */
export function keyKind(key) {
  const value = String(key ?? '').trim();
  if (!value) return 'missing';
  if (value.startsWith('sb_secret_')) return 'secret';
  if (value.startsWith('sb_publishable_')) return 'public';
  const parts = value.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role') return 'secret';
      if (payload?.role === 'anon') return 'public';
    } catch {
      // Pas un JWT lisible : on laisse Supabase trancher.
    }
  }
  return 'unknown';
}
