/**
 * Les règles de `push-setup.mjs` qui ne touchent ni au réseau ni au disque —
 * testées à part (`scripts/__tests__/push.test.mjs`).
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';

/** `https://abcd.supabase.co` → `abcd`. `null` pour une autre adresse. */
export function projectRefOf(url) {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url ?? '').trim());
  return match ? match[1] : null;
}

/**
 * Une paire VAPID : la clé publique en point non compressé (65 octets), la
 * privée en scalaire `d` (32 octets), toutes deux en base64url — les formes
 * qu'attendent le navigateur et `_shared/webpush.ts`.
 */
export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  return {
    publicKey: Buffer.concat([Buffer.from([4]), x, y]).toString('base64url'),
    privateKey: jwk.d,
  };
}

/** Vrai si la paire a la bonne forme — une clé tronquée au copier-coller se voit ici. */
export function validVapidKeys(publicKey, privateKey) {
  const pub = Buffer.from(String(publicKey ?? ''), 'base64url');
  const priv = Buffer.from(String(privateKey ?? ''), 'base64url');
  return pub.length === 65 && pub[0] === 4 && priv.length === 32;
}

/** Le secret d'appel de `notify` : 32 octets, en hexadécimal. */
export function newNotifySecret() {
  return randomBytes(32).toString('hex');
}

/**
 * Pose ou remplace des variables dans le texte d'un `.env`, sans toucher au
 * reste : commentaires, ordre et autres clés restent tels quels.
 */
export function upsertEnv(text, entries, comment) {
  const lines = String(text ?? '').split(/\r?\n/);
  const pending = new Map(Object.entries(entries));

  const out = lines.map((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match && pending.has(match[1])) {
      const value = pending.get(match[1]);
      pending.delete(match[1]);
      return `${match[1]}=${value}`;
    }
    return line;
  });

  if (pending.size > 0) {
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
    out.push('');
    if (comment) for (const line of comment.split('\n')) out.push(`# ${line}`.trimEnd());
    for (const [key, value] of pending) out.push(`${key}=${value}`);
  }
  return `${out.join('\n').replace(/\n*$/, '')}\n`;
}

/**
 * Le diagnostic de `notify_status()`, en lignes lisibles : `ok` et un détail,
 * ou ce qu'il faut faire.
 */
export function describeStatus(status) {
  if (!status || typeof status !== 'object') {
    return [
      {
        ok: false,
        label: 'Base',
        detail: 'diagnostic illisible — la migration est-elle passée ?',
      },
    ];
  }
  return [
    {
      ok: Boolean(status.configured),
      label: 'Coffre-fort',
      detail: status.configured ? 'adresse et secret rangés' : 'adresse ou secret absent',
    },
    {
      ok: Boolean(status.scheduled),
      label: 'Battement',
      detail: status.scheduled
        ? 'pg_cron appelle notify_tick() chaque minute'
        : 'pas de tâche planifiée',
    },
    {
      ok: true,
      label: 'Appareils',
      detail: `${status.subscriptions ?? 0} abonné(s)`,
    },
    {
      ok: !(status.abandoned > 0),
      label: 'File',
      detail:
        `${status.pending ?? 0} en attente` +
        (status.abandoned > 0 ? `, ${status.abandoned} abandonnée(s) après 5 essais` : ''),
    },
  ];
}
