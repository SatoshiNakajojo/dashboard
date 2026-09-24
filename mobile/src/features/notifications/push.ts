/**
 * Les notifications, côté navigateur : savoir si l'appareil peut en recevoir,
 * et s'abonner auprès de son service de push.
 *
 * L'app est une PWA. Sur iPhone, Safari n'ouvre le push qu'aux apps **ajoutées
 * à l'écran d'accueil** (iOS 16.4 et suivants) : dans un onglet, l'API n'existe
 * tout simplement pas. Il faut le dire au membre plutôt que de lui montrer un
 * bouton qui ne ferait rien — d'où `needs-install`.
 *
 * La clé publique VAPID vient de `.env` au moment de la build
 * (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`, posée par `npm run push:setup`) : c'est elle
 * qui lie l'abonnement au serveur du club, et à lui seul.
 */

import { Platform } from 'react-native';

import {
  keyToBytes,
  pushSupportOf,
  sameKey,
  type BrowserTraits,
  type PushSupport,
} from './pushSupport';

export type { PushSupport } from './pushSupport';

export const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function browserTraits(): BrowserTraits {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  const ua = nav?.userAgent ?? '';
  // L'iPad se présente comme un Mac depuis iPadOS 13 ; l'écran tactile le trahit.
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone =
    Boolean((nav as { standalone?: boolean } | undefined)?.standalone) ||
    Boolean(win?.matchMedia?.('(display-mode: standalone)').matches);
  return {
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasPushManager: Boolean(win && 'PushManager' in win),
    hasNotification: Boolean(win && 'Notification' in win),
    isIos,
    standalone,
  };
}

export function pushSupport(): PushSupport {
  if (Platform.OS !== 'web') return 'native';
  return pushSupportOf(browserTraits());
}

/** Le service worker de l'app, une fois actif. */
async function registration(): Promise<ServiceWorkerRegistration> {
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Service worker introuvable — rechargez l’app.')), 8_000),
  );
  return await Promise.race([ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ready') return null;
  const reg = await registration();
  return await reg.pushManager.getSubscription();
}

/**
 * Abonne cet appareil. La permission doit déjà être accordée.
 *
 * Un abonnement pris avec une autre clé (clé renouvelée par `push:setup`) est
 * inutilisable par le serveur : on le remplace.
 */
export async function subscribe(): Promise<PushSubscription> {
  const reg = await registration();
  // Une version plus récente du service worker attend peut-être : c'est elle
  // qui sait afficher les notifications. On la laisse prendre la main — ici
  // seulement, au moment où le membre s'abonne.
  reg.waiting?.postMessage('SKIP_WAITING');
  const key = keyToBytes(VAPID_PUBLIC_KEY);
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing.options.applicationServerKey, key)) return existing;
  if (existing) await existing.unsubscribe();
  return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** Ce que le serveur doit connaître d'un abonnement pour écrire à l'appareil. */
export function subscriptionKeys(
  subscription: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}
