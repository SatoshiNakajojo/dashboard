/**
 * Web Push, sans dépendance : chiffrement du message et signature VAPID.
 *
 * Une notification ne passe pas en clair par Apple, Google ou Mozilla : le
 * message est chiffré pour **un** appareil (RFC 8291, `aes128gcm` de la RFC
 * 8188), avec les clés que le navigateur a données en s'abonnant. Et le serveur
 * signe chaque envoi (VAPID, RFC 8292) : le service de push vérifie que c'est
 * bien lui qui a obtenu l'abonnement.
 *
 * Tout passe par WebCrypto, présent dans Deno comme dans Node : le même fichier
 * sert la fonction Edge et ses tests, qui le recoupent avec le vecteur de la
 * RFC 8291 et avec la bibliothèque `web-push`.
 */

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Base64url
// ---------------------------------------------------------------------------

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '==='.slice((base64.length + 3) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/*
 * Les fonctions internes rendent des tableaux qu'elles ont créés, et laissent
 * TypeScript en inférer le type : depuis TS 5.7, `Uint8Array` seul désigne un
 * tableau sur *n'importe quel* tampon, que WebCrypto refuse ; le type inféré,
 * lui, porte un vrai `ArrayBuffer`. Les entrées venues de l'appelant sont
 * recopiées (`new Uint8Array(…)`) pour la même raison.
 */

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', new Uint8Array(ikm), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ---------------------------------------------------------------------------
// Chiffrement — RFC 8291
// ---------------------------------------------------------------------------

/** La paire éphémère du serveur : une par message. */
export interface LocalKeys {
  /** Point public non compressé, 65 octets. */
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}

export async function generateLocalKeys(): Promise<LocalKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey, privateKey: pair.privateKey };
}

/** Une paire imposée — pour rejouer le vecteur de test de la RFC. */
export async function importLocalKeys(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<LocalKeys> {
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: b64urlEncode(privateKey),
      x: b64urlEncode(publicKey.slice(1, 33)),
      y: b64urlEncode(publicKey.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  return { publicKey, privateKey: key };
}

/** Taille d'enregistrement annoncée : un seul enregistrement, toujours. */
const RECORD_SIZE = 4096;

/**
 * Chiffre `plaintext` pour l'abonnement `(p256dh, auth)`.
 *
 * Renvoie le corps complet : en-tête `aes128gcm` (sel, taille d'enregistrement,
 * clé publique éphémère) suivi de l'unique enregistrement chiffré.
 *
 * `salt` et `local` ne s'imposent que pour les tests : réutiliser un sel avec
 * la même clé ruinerait le chiffrement.
 */
export async function encrypt(
  plaintext: Uint8Array,
  uaPublicKey: Uint8Array,
  authSecret: Uint8Array,
  options: { salt?: Uint8Array; local?: LocalKeys } = {},
) {
  // Délimiteur (1 octet) et étiquette GCM (16 octets) compris.
  if (plaintext.length + 17 > RECORD_SIZE) {
    throw new Error(`Message trop long pour une notification (${plaintext.length} octets)`);
  }
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const local = options.local ?? (await generateLocalKeys());

  const uaKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(uaPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublicKey, local.publicKey);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // Dernier (et seul) enregistrement : délimiteur 0x02, sans bourrage.
  const record = concat(plaintext, new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + local.publicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = local.publicKey.length;
  header.set(local.publicKey, 21);

  return concat(header, ciphertext);
}

// ---------------------------------------------------------------------------
// VAPID — RFC 8292
// ---------------------------------------------------------------------------

export interface VapidKeys {
  /** Point public non compressé, base64url — celui que l'app donne au navigateur. */
  publicKey: string;
  /** Scalaire privé `d`, base64url. Ne quitte jamais le serveur. */
  privateKey: string;
  /** Contact de l'expéditeur : `mailto:` ou `https:`. */
  subject: string;
}

/** Validité d'une signature : Apple et Google refusent au-delà de 24 h. */
const VAPID_TTL_S = 12 * 3600;

/** L'en-tête `Authorization` d'un envoi vers `endpoint`. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  now: number = Date.now(),
): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Clé publique VAPID invalide');

  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + VAPID_TTL_S,
        sub: vapid.subject,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: vapid.privateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto signe au format `r || s` de 64 octets : celui qu'attend un JWS.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(`${header}.${claims}`),
    ),
  );

  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export interface PushTarget {
  endpoint: string;
  /** Clé publique de l'appareil, base64url. */
  p256dh: string;
  /** Secret d'authentification de l'appareil, base64url. */
  auth: string;
}

export interface PushOutcome {
  status: number;
  ok: boolean;
  /** L'abonnement n'existe plus (404, 410) : à oublier. */
  gone: boolean;
  detail: string | null;
}

/** Les services de push à qui l'on accepte d'écrire : rien d'autre. */
const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

/**
 * Vrai si l'adresse est celle d'un service de push connu, en HTTPS.
 *
 * Un abonnement est écrit par un client : sans ce filtre, n'importe quel
 * membre pourrait faire envoyer au serveur des requêtes vers l'adresse de son
 * choix.
 */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export async function sendPush(
  target: PushTarget,
  message: unknown,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<PushOutcome> {
  if (!isPushEndpoint(target.endpoint)) {
    return { status: 0, ok: false, gone: true, detail: 'service de push inconnu' };
  }
  const body = await encrypt(
    encoder.encode(JSON.stringify(message)),
    b64urlDecode(target.p256dh),
    b64urlDecode(target.auth),
  );
  const response = await (options.fetchImpl ?? fetch)(target.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(options.ttlSeconds ?? 24 * 3600),
      urgency: options.urgency ?? 'normal',
      authorization: await vapidAuthorization(target.endpoint, vapid),
    },
    body,
  });
  const gone = response.status === 404 || response.status === 410;
  const detail = response.ok ? null : (await response.text().catch(() => '')).slice(0, 200);
  return { status: response.status, ok: response.ok, gone, detail };
}
