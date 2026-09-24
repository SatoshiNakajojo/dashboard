import { useCallback, useEffect, useState } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import type { NotificationPrefsRow } from '@/types/database';
import {
  VAPID_PUBLIC_KEY,
  currentSubscription,
  pushSupport,
  subscribe,
  subscriptionKeys,
  type PushSupport,
} from './push';

/** Les quatre réglages, dans l'ordre où le profil les montre. */
export const NOTIFICATION_TOPICS = [
  { key: 'nights', label: 'Nouvelles soirées', hint: 'Dès qu’un membre en propose une.' },
  { key: 'reminders', label: 'Rappel le jour J', hint: 'À 9 h, le jour de la soirée.' },
  { key: 'calls', label: 'Calls', hint: 'Publiés et clôturés.' },
  { key: 'oracle', label: 'Mes paris résolus', hint: 'Quand un de vos paris arrive à terme.' },
] as const;

export type TopicKey = (typeof NOTIFICATION_TOPICS)[number]['key'];
export type TopicPrefs = Record<TopicKey, boolean>;

const ALL_ON: TopicPrefs = { nights: true, reminders: true, calls: true, oracle: true };

export interface NotificationsState {
  support: PushSupport;
  /** Le serveur du club sait envoyer : backend et clé VAPID présents. */
  configured: boolean;
  /** `null` tant qu'on ne sait pas encore. */
  subscribed: boolean | null;
  /** Le membre a refusé la permission ; seuls les réglages du téléphone y reviennent. */
  denied: boolean;
  busy: boolean;
  error: string | null;
  /** Le résultat du dernier essai. */
  info: string | null;
  prefs: TopicPrefs;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<void>;
  setTopic: (key: TopicKey, on: boolean) => void;
}

function permissionDenied(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

/**
 * Les notifications de ce membre, sur cet appareil.
 *
 * L'abonnement est **par appareil** (le navigateur le tient) ; les réglages
 * sont **par membre** (la base les tient) : décocher « Calls » sur le
 * téléphone vaut aussi pour l'ordinateur.
 */
export function useNotifications(userId: string | null): NotificationsState {
  const [support] = useState<PushSupport>(() => pushSupport());
  const configured = Boolean(supabase) && VAPID_PUBLIC_KEY.length > 0;

  // Sans push possible, la réponse est connue d'emblée ; sinon, elle vient du
  // navigateur, un instant plus tard.
  const [subscribed, setSubscribed] = useState<boolean | null>(() =>
    support === 'ready' ? null : false,
  );
  const [denied, setDenied] = useState(() => permissionDenied());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<TopicPrefs>(ALL_ON);

  // L'état de l'abonnement de cet appareil — et, s'il existe, on le redit au
  // serveur : un abonnement effacé côté base (appareil prêté, compte changé)
  // se recolle ainsi à la prochaine ouverture du profil.
  useEffect(() => {
    if (support !== 'ready') return;
    let active = true;
    (async () => {
      try {
        const subscription = await currentSubscription();
        if (!active) return;
        setSubscribed(subscription !== null);
        const keys = subscription ? subscriptionKeys(subscription) : null;
        if (keys && supabase && userId && configured) {
          await supabase.rpc('register_push_subscription', {
            p_endpoint: keys.endpoint,
            p_p256dh: keys.p256dh,
            p_auth: keys.auth,
            p_user_agent: navigator.userAgent,
          });
        }
      } catch {
        if (active) setSubscribed(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [support, userId, configured]);

  // Les réglages du membre. Pas de ligne : tout est coché.
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    let active = true;
    (async () => {
      const { data } = await client
        .from('notification_prefs')
        .select('nights, reminders, calls, oracle')
        .eq('user_id', userId)
        .maybeSingle();
      if (active && data) setPrefs({ ...ALL_ON, ...data });
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const enable = useCallback(async () => {
    if (busy) return;
    setError(null);
    setInfo(null);
    if (!configured || !supabase || !userId) {
      setError('Les notifications ne sont pas encore activées sur le serveur du club.');
      return;
    }
    setBusy(true);
    try {
      // En premier, et sans rien attendre avant : iOS n'accorde la demande
      // que dans le prolongement direct d'un toucher.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setDenied(permission === 'denied');
        setError(
          permission === 'denied'
            ? 'Notifications refusées. Elles se réactivent dans les réglages du téléphone.'
            : 'Permission non accordée.',
        );
        return;
      }
      const subscription = await subscribe();
      const keys = subscriptionKeys(subscription);
      if (!keys) throw new Error('Abonnement incomplet — réessayez.');
      const { error: cause } = await supabase.rpc('register_push_subscription', {
        p_endpoint: keys.endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_user_agent: navigator.userAgent,
      });
      if (cause) throw cause;
      setSubscribed(true);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, configured, userId]);

  const disable = useCallback(async () => {
    if (busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      const keys = subscription ? subscriptionKeys(subscription) : null;
      if (keys && supabase) {
        await supabase.rpc('unregister_push_subscription', { p_endpoint: keys.endpoint });
      }
      await subscription?.unsubscribe();
      setSubscribed(false);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const sendTest = useCallback(async () => {
    const client = supabase;
    if (busy || !client) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const { data, error: cause } = await client.functions.invoke<{
        sent: number;
        devices: number;
      }>('notify', { body: { test: true } });
      if (cause) throw cause;
      const sent = data?.sent ?? 0;
      const devices = data?.devices ?? 0;
      setInfo(
        devices === 0
          ? 'Aucun appareil abonné côté serveur — réactivez les notifications.'
          : sent === devices
            ? `Essai envoyé à ${devices} appareil${devices > 1 ? 's' : ''}.`
            : `Essai reçu par ${sent} appareil${sent > 1 ? 's' : ''} sur ${devices}.`,
      );
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const setTopic = useCallback(
    (key: TopicKey, on: boolean) => {
      setPrefs((current) => ({ ...current, [key]: on }));
      const client = supabase;
      if (!client || !userId) return;
      // Seule la colonne touchée part : l'upsert ne réécrit pas les trois autres.
      const row: Partial<NotificationPrefsRow> & { user_id: string } = { user_id: userId };
      row[key] = on;
      void client
        .from('notification_prefs')
        .upsert(row, { onConflict: 'user_id' })
        .then(({ error: cause }) => {
          if (!cause) return;
          // L'écran revient à ce que la base connaît, et dit pourquoi.
          setPrefs((current) => ({ ...current, [key]: !on }));
          setError(describeError(cause));
        });
    },
    [userId],
  );

  return {
    support,
    configured,
    subscribed,
    denied,
    busy,
    error,
    info,
    prefs,
    enable,
    disable,
    sendTest,
    setTopic,
  };
}
