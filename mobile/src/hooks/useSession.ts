import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import { record, recordChange, storedSessionUser } from '@/lib/authJournal';
import { supabase } from '@/lib/supabase';
import { MOCK_CURRENT_USER_ID } from '@/mocks/members';

export interface SessionState {
  userId: string | null;
  loading: boolean;
  /**
   * Une session est rangée sur l'appareil mais n'a pas encore pu être
   * renouvelée : le réseau a manqué au démarrage. Le membre reste dans l'app,
   * et l'on réessaie.
   */
  pending: boolean;
  /**
   * Augmente quand une session en attente redevient valide. L'app se remonte
   * sur cette clé : ce qu'elle a lu avec un jeton expiré se relit.
   */
  epoch: number;
}

/**
 * Identité de l'utilisateur courant — un seul état pour toute l'app.
 *
 * Sans backend configuré, on rend l'identité mock (« Toi ») : l'app reste
 * pleinement navigable en développement.
 *
 * **Le bug de la porte à chaque ouverture.** Le jeton d'accès vit une heure.
 * Rouverte plus tard, l'app doit le renouveler au démarrage ; si cet appel
 * échoue un instant — réseau pas encore là, 4G lente —, supabase-js garde la
 * session dans le stockage mais répond « pas de session ». On renvoyait alors
 * le membre à l'e-mail et au code, pour une session parfaitement vivante.
 *
 * Désormais, « pas de session » ne suffit pas : tant qu'un jeton de
 * renouvellement est rangé sur l'appareil, le membre reste dans l'app
 * (`pending`), et l'on réessaie — au retour du réseau, au retour au premier
 * plan, toutes les 20 s. Seul un `SIGNED_OUT` (jeton refusé par le serveur,
 * supprimé par supabase-js) ramène à la porte.
 */

const MOCK_STATE: SessionState = {
  userId: MOCK_CURRENT_USER_ID,
  loading: false,
  pending: false,
  epoch: 0,
};

let state: SessionState = supabase
  ? { userId: null, loading: true, pending: false, epoch: 0 }
  : MOCK_STATE;
const listeners = new Set<() => void>();
let started = false;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let persistAsked = false;

function set(next: Omit<SessionState, 'epoch'>) {
  const recovered = state.pending && !next.pending && next.userId !== null;
  if (recovered) record('RECOVERED');
  if (next.pending && !state.pending) record('PENDING');
  const epoch = recovered ? state.epoch + 1 : state.epoch;
  if (
    next.userId === state.userId &&
    next.loading === state.loading &&
    next.pending === state.pending &&
    epoch === state.epoch
  ) {
    return;
  }
  state = { ...next, epoch };
  listeners.forEach((listener) => listener());
  scheduleRetries();
}

/** La clé sous laquelle supabase-js range la session : `sb-<projet>-auth-token`. */
function storageKey(client: NonNullable<typeof supabase>): string {
  return (client.auth as unknown as { storageKey: string }).storageKey;
}

async function apply(
  client: NonNullable<typeof supabase>,
  session: Session | null,
  signedOut: boolean,
) {
  if (session) {
    set({ userId: session.user.id, loading: false, pending: false });
    askPersistentStorage();
    return;
  }
  if (signedOut) {
    set({ userId: null, loading: false, pending: false });
    return;
  }
  let stored: string | null = null;
  try {
    stored = storedSessionUser(await AsyncStorage.getItem(storageKey(client)));
  } catch {
    stored = null;
  }
  set({ userId: stored, loading: false, pending: stored !== null });
}

/** Relance le renouvellement — hors des rappels de supabase-js, qui l'interdisent. */
function retry() {
  const client = supabase;
  if (!client || !state.pending) return;
  void client.auth
    .getSession()
    .then(({ data }) => apply(client, data.session, false))
    .catch(() => undefined);
}

function scheduleRetries() {
  if (state.pending && retryTimer === null) {
    retryTimer = setInterval(retry, 20_000);
  } else if (!state.pending && retryTimer !== null) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

/**
 * Demande au navigateur de ne pas évincer le stockage de l'app. Accordé
 * d'office à une app installée sur la plupart des téléphones ; ne coûte rien.
 */
function askPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    const storage = (globalThis.navigator as Navigator | undefined)?.storage;
    if (typeof storage?.persist !== 'function') return;
    void storage
      .persist()
      .then((granted) => recordChange('PERSIST', granted ? 'oui' : 'non'))
      .catch(() => undefined);
  } catch {
    // Rien à demander ici.
  }
}

function start() {
  const client = supabase;
  if (started || !client) return;
  started = true;

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
      record(event);
    }
    // Pas d'appel à supabase-js depuis ce rappel : il tient un verrou. Lire le
    // stockage, si.
    void apply(client, session, event === 'SIGNED_OUT');
  });

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') retry();
    });
  }
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
