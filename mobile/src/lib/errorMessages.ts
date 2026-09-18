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
  [/token has expired|invalid token|otp_expired/i, 'Ce code est expiré ou incorrect.'],
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
