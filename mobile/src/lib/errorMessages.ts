/**
 * Traduction des erreurs Supabase.
 *
 * Module volontairement pur — aucune dépendance React Native — pour que ces
 * phrases, les seules qu'un membre verra quand quelque chose coince, soient
 * testables directement.
 */

/**
 * Messages Supabase qu'un membre peut réellement croiser, traduits.
 *
 * Laisser passer la chaîne brute n'est pas neutre : « Signups not allowed for
 * otp » est le message qu'obtient quelqu'un dont l'adresse n'est pas inscrite —
 * il doit lire qu'il n'est pas sur la liste, pas une erreur technique en
 * anglais. L'ordre compte : le premier motif trouvé gagne.
 */
const TRANSLATIONS: [pattern: RegExp, message: string][] = [
  [
    /signups? not allowed|user not found|email not confirmed/i,
    'Cette adresse n’est pas sur la liste du club.',
  ],
  [
    /email rate limit|over_email_send_rate_limit/i,
    'Trop de codes demandés. Réessayez dans une heure.',
  ],
  [
    /only request this after (\d+) seconds?/i,
    'Un code vient d’être envoyé. Patientez quelques secondes.',
  ],
  /**
   * Le jeton d'authentification de l'app, pas le code du membre.
   *
   * GoTrue répond « invalid token » aussi bien pour un en-tête `Authorization`
   * qu'il n'arrive pas à lire que pour un code à six chiffres inconnu. Les
   * confondre coûte cher : on cherche l'erreur dans la boîte de réception du
   * membre alors qu'elle est dans la configuration de l'app.
   */
  [
    /unable to parse or verify signature|bad_jwt|invalid claim|invalid jwt/i,
    'L’application n’arrive pas à s’authentifier auprès du serveur. Le code n’est pas en cause.',
  ],
  [/token has expired|otp_expired|invalid token/i, 'Ce code est expiré ou incorrect.'],
  [/violates row-level security/i, 'Cette ligne ne vous appartient pas.'],
  [
    /failed to fetch|network request failed|load failed/i,
    'Connexion indisponible.',
  ],
  [/duplicate key|already exists/i, 'Cet élément existe déjà.'],
];

/**
 * Message lisible par un humain à partir de ce que renvoie Supabase.
 * On ne remonte jamais un code Postgres brut à l'écran.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Erreur inconnue';
  if (typeof error !== 'object' || !('message' in error)) return String(error);

  const message = String((error as { message: unknown }).message);
  for (const [pattern, translation] of TRANSLATIONS) {
    if (pattern.test(message)) return translation;
  }
  return message;
}
