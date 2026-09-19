import { useCallback, useEffect, useState } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import { MOCK_CURRENT_USER_ID } from '@/mocks/members';
import { initialsFrom, pickColor } from './profile';

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

    if (digits.length !== 6) {
      setError('Le code compte six chiffres.');
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

export { initialsFrom, pickColor } from './profile';

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

export function useProfileBootstrap(userId: string | null): ProfileBootstrap {
  const [needsProfile, setNeedsProfile] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
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
    })();

    return () => controller.abort();
  }, [userId]);

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
      const { data: taken } = await client.rpc('taken_profile_colors');
      const color = pickColor(taken ?? []);

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
      return true;
    },
    [userId],
  );

  return {
    checking: Boolean(supabase) && Boolean(userId) && checked !== userId,
    needsProfile,
    error,
    create,
  };
}
