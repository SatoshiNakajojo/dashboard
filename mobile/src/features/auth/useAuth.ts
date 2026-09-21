import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import { MOCK_CURRENT_USER_ID } from '@/mocks/members';
import { colorFor, initialsFrom, pickColor } from './profile';

/**
 * Connexion par code à usage unique.
 *
 * Un club privé de sept membres n'a pas besoin de mots de passe : l'e-mail
 * suffit à prouver qu'on est sur la liste. Le code à six chiffres évite
 * l'aller-retour par un lien profond, qui casse dès qu'on ouvre le courriel
 * sur un autre appareil que le téléphone.
 *
 * Sans backend configuré, le module se met de côté et l'app démarre sur
 * l'identité mock.
 */

export type AuthStep = 'email' | 'code';

export interface AuthState {
  step: AuthStep;
  email: string;
  setEmail: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  /** Écriture en cours — le bouton se verrouille. */
  busy: boolean;
  error: string | null;
  requestCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  changeEmail: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function useAuth(): AuthState {
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = useCallback(async () => {
    const client = supabase;
    const address = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(address)) {
      setError('Adresse e-mail invalide.');
      return;
    }
    if (!client || busy) return;

    setBusy(true);
    setError(null);
    try {
      const { error: cause } = await client.auth.signInWithOtp({
        email: address,
        // Le club est fermé : on n'inscrit personne à la volée. Un membre doit
        // déjà exister côté Supabase pour recevoir un code.
        options: { shouldCreateUser: false },
      });
      if (cause) {
        setError(describeError(cause));
        return;
      }
      setStep('code');
    } finally {
      setBusy(false);
    }
  }, [busy, email]);

  const verifyCode = useCallback(async () => {
    const client = supabase;
    const digits = code.replace(/\D/g, '');

    /**
     * Supabase laisse régler la longueur du code, de six à dix chiffres.
     *
     * La figer à six était une erreur coûteuse : sur un projet réglé à huit, le
     * champ tronquait, et l'app envoyait six chiffres parfaitement formés que
     * le serveur ne reconnaissait pas. Le membre lisait « code expiré ou
     * incorrect » devant un code tout frais, correctement recopié.
     *
     * On ne vérifie donc qu'un minimum plausible. C'est au serveur de dire si
     * le code est bon — lui seul le sait.
     */
    if (digits.length < 6) {
      setError('Saisissez le code reçu par courriel.');
      return;
    }
    if (!client || busy) return;

    setBusy(true);
    setError(null);
    try {
      const { error: cause } = await client.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: digits,
        type: 'email',
      });
      // En cas de succès, `onAuthStateChange` prend le relais et la garde de
      // route bascule d'elle-même : rien à faire de plus ici.
      if (cause) setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, code, email]);

  const changeEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setError(null);
  }, []);

  return { step, email, setEmail, code, setCode, busy, error, requestCode, verifyCode, changeEmail };
}

// ---------------------------------------------------------------------------
// Amorçage du profil
// ---------------------------------------------------------------------------

export { colorFor, initialsFrom, pickColor } from './profile';

/**
 * Un compte `auth.users` ne suffit pas à être membre : `is_member()` exige une
 * ligne dans `profiles`. Au premier accès, on la crée — les deux décisions qui
 * en découlent (initiales, couleur) vivent dans `./profile`.
 */

export interface ProfileBootstrap {
  /** `true` tant qu'on ne sait pas si le profil existe. */
  checking: boolean;
  /** `true` quand l'utilisateur est connecté mais sans ligne `profiles`. */
  needsProfile: boolean;
  error: string | null;
  create: (displayName: string) => Promise<boolean>;
}

/**
 * L'existence d'un profil est lue à deux endroits — la garde de route et
 * l'écran de connexion — et **elle doit être la même des deux côtés**.
 *
 * Deux instances du hook, c'était deux vérités : la création du profil ne
 * parvenait qu'à celle de l'écran. La garde conservait son ancienne réponse,
 * ne redirigeait jamais, et l'écran, sorti de l'étape du prénom, retombait sur
 * le champ du code. Le membre créait son profil et se retrouvait devant la
 * porte, sans un mot.
 *
 * Un compteur partagé suffit : l'incrémenter fait revérifier tout le monde.
 */
let bootstrapRevision = 0;
const bootstrapListeners = new Set<() => void>();

function announceProfileChange(): void {
  bootstrapRevision += 1;
  for (const listener of bootstrapListeners) listener();
}

function subscribeToProfileChange(listener: () => void): () => void {
  bootstrapListeners.add(listener);
  return () => {
    bootstrapListeners.delete(listener);
  };
}

const readRevision = () => bootstrapRevision;

export function useProfileBootstrap(userId: string | null): ProfileBootstrap {
  const revision = useSyncExternalStore(subscribeToProfileChange, readRevision, readRevision);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || userId === MOCK_CURRENT_USER_ID) return;

    const controller = new AbortController();

    (async () => {
      const { data, error: cause } = await client
        .from('profiles')
        .select('id')
        .eq('id', userId)
        // `abortSignal` avant `maybeSingle` : ce dernier renvoie un builder
        // terminal, qui ne porte plus l'annulation.
        .abortSignal(controller.signal)
        .maybeSingle();

      if (controller.signal.aborted) return;
      if (cause) setError(describeError(cause));
      setNeedsProfile(!data);
      setChecked(userId);
      setCheckedAt(revision);
    })();

    return () => controller.abort();
  }, [revision, userId]);

  const create = useCallback(
    async (displayName: string): Promise<boolean> => {
      const client = supabase;
      if (!client || !userId) return false;

      const name = displayName.trim();
      if (name.length === 0) {
        setError('Il faut un prénom.');
        return false;
      }

      // Pas un `select` sur `profiles` : la RLS le refuserait à qui n'est pas
      // encore membre — c'est-à-dire à tout le monde, ici. La fonction rend les
      // couleurs et rien d'autre.
      //
      // Si elle manque, on ne retombe pas sur la première de la palette : ce
      // serait redonner la même couleur à tout le club, le défaut même qu'elle
      // corrige. On décale d'après l'identifiant.
      const { data: taken, error: colorFailed } = await client.rpc('taken_profile_colors');
      const color = colorFailed ? colorFor(userId) : pickColor(taken ?? []);

      const { error: cause } = await client.from('profiles').insert({
        id: userId,
        display_name: name,
        initials: initialsFrom(name),
        color,
      });

      if (cause) {
        setError(describeError(cause));
        return false;
      }
      setNeedsProfile(false);
      // La garde de route lit sa propre instance : sans cet appel, elle
      // ignorerait la création et laisserait le membre devant la porte.
      announceProfileChange();
      return true;
    },
    [userId],
  );

  return {
    checking:
      Boolean(supabase) && Boolean(userId) && (checked !== userId || checkedAt !== revision),
    needsProfile,
    error,
    create,
  };
}
