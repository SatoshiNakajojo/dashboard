/**
 * Les règles des notifications côté navigateur qui ne dépendent pas du
 * navigateur lui-même — testables hors de React Native.
 */

/**
 * Ce que l'appareil permet :
 *
 *   • `ready` — le navigateur sait recevoir des notifications ;
 *   • `needs-install` — iPhone ou iPad, app ouverte dans Safari : il faut
 *     d'abord l'ajouter à l'écran d'accueil ;
 *   • `unsupported` — navigateur sans push ;
 *   • `native` — build native : hors du périmètre de cette PWA.
 */
export type PushSupport = 'ready' | 'needs-install' | 'unsupported' | 'native';

export interface BrowserTraits {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
  /** Ouverte depuis l'écran d'accueil, et non dans un onglet. */
  standalone: boolean;
}

export function pushSupportOf(traits: BrowserTraits): PushSupport {
  if (traits.isIos && !traits.standalone) return 'needs-install';
  return traits.hasServiceWorker && traits.hasPushManager && traits.hasNotification
    ? 'ready'
    : 'unsupported';
}

/** `BNcR…` (base64url) → octets, la forme qu'attend `pushManager.subscribe`. */
export function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '==='.slice((base64.length + 3) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Vrai si l'abonnement a été pris avec cette clé-là. */
export function sameKey(
  current: ArrayBuffer | null | undefined,
  expected: Uint8Array,
): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);
}
