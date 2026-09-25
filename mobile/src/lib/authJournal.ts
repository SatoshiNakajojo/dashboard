/**
 * Le journal de session de l'appareil.
 *
 * Un membre qui doit « se reconnecter à chaque ouverture » n'a aucun moyen de
 * dire pourquoi, et aucun outil de développement n'est ouvert sur un iPhone.
 * Trois causes très différentes donnent le même écran :
 *
 *   • le renouvellement du jeton a échoué **un instant** au démarrage (réseau
 *     pas encore là) : la session est intacte, il suffisait d'attendre ;
 *   • le serveur a **refusé** le renouvellement (jeton déjà utilisé, révoqué) :
 *     la session est morte, il faut un nouveau code ;
 *   • le navigateur a **tout effacé** à la fermeture : plus de session, plus de
 *     journal non plus.
 *
 * Le journal garde les derniers événements — jamais un jeton, seulement leur
 * nature, un statut HTTP et un code d'erreur — dans le stockage de l'app. Le
 * panneau « À propos » et l'écran de connexion en tirent une ligne : une
 * capture d'écran suffit à trancher.
 *
 * Pur, à part `readJournal` / `record`.
 */

export const JOURNAL_KEY = 'club_auth_journal';
export const JOURNAL_MAX = 30;

export type JournalEvent =
  /** Connexion par code. */
  | 'SIGNED_IN'
  /** Jeton renouvelé. */
  | 'TOKEN_REFRESHED'
  /** Session supprimée par supabase-js. */
  | 'SIGNED_OUT'
  /** Au démarrage : session rangée, pas encore renouvelée. On la garde. */
  | 'PENDING'
  /** Session en attente, renouvelée : on reprend. */
  | 'RECOVERED'
  /** Le serveur a refusé le renouvellement : `d` porte statut et code. */
  | 'REFRESH_REFUSED'
  /** Le renouvellement n'a pas atteint le serveur. */
  | 'REFRESH_NETWORK'
  /** Réponse de `navigator.storage.persist()`. */
  | 'PERSIST';

export interface JournalEntry {
  /** Horodatage, en millisecondes. */
  t: number;
  e: JournalEvent;
  /** Détail court, sans secret : `400 refresh_token_already_used`. */
  d?: string;
}

/** Deux événements identiques à moins de dix minutes n'en font qu'un. */
const SAME_EVENT_WINDOW_MS = 10 * 60_000;

export function appendEntry(
  entries: readonly JournalEntry[],
  entry: JournalEntry,
  max = JOURNAL_MAX,
): JournalEntry[] {
  // supabase-js annonce une connexion à chaque retour au premier plan : sans
  // regroupement, elles chasseraient du journal le refus qu'on y cherche.
  const last = entries[entries.length - 1];
  if (
    last &&
    last.e === entry.e &&
    last.d === entry.d &&
    entry.t - last.t < SAME_EVENT_WINDOW_MS
  ) {
    return [...entries.slice(0, -1), entry];
  }
  return [...entries, entry].slice(-max);
}

export function parseJournal(raw: string | null): JournalEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is JournalEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as JournalEntry).t === 'number' &&
        typeof (item as JournalEntry).e === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * L'utilisateur d'une session rangée par supabase-js, lue sans lui.
 *
 * Ce qui compte : un jeton de renouvellement est là. Tant qu'il y est, la
 * session peut revivre dès que le réseau répond — ce n'est pas le moment de
 * renvoyer le membre à la porte.
 */
export function storedSessionUser(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as {
      refresh_token?: unknown;
      user?: { id?: unknown } | null;
    } | null;
    const id = session?.user?.id;
    return typeof session?.refresh_token === 'string' &&
      session.refresh_token.length > 0 &&
      typeof id === 'string' &&
      id.length > 0
      ? id
      : null;
  } catch {
    return null;
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `Array.prototype.findLastIndex`, que tous les moteurs n'ont pas encore. */
function lastIndexWhere<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i -= 1) if (test(items[i]!)) return i;
  return -1;
}

function lastWhere<T>(items: readonly T[], test: (item: T) => boolean): T | undefined {
  const index = lastIndexWhere(items, test);
  return index === -1 ? undefined : items[index];
}

/** `25/09 18:02`, à l'heure de l'appareil. */
function when(t: number): string {
  const date = new Date(t);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Pourquoi cet appareil n'est plus connecté, si le journal le sait.
 *
 * `null` quand il n'y a rien à dire : premier passage, ou un navigateur qui a
 * effacé le journal avec le reste — ce qui, faute de trace, se lit aussi.
 */
export function signOutReason(entries: readonly JournalEntry[]): string | null {
  const lastIn = lastIndexWhere(
    entries,
    (entry) =>
      entry.e === 'SIGNED_IN' || entry.e === 'TOKEN_REFRESHED' || entry.e === 'RECOVERED',
  );
  if (lastIn === -1) return null;
  const after = entries.slice(lastIn + 1);
  const refused = lastWhere(after, (entry) => entry.e === 'REFRESH_REFUSED');
  const out = lastWhere(after, (entry) => entry.e === 'SIGNED_OUT');
  if (refused) {
    return `Déconnecté le ${when(refused.t)} : le serveur a refusé de renouveler la session (${refused.d ?? 'sans code'}).`;
  }
  if (out) return `Déconnecté le ${when(out.t)}.`;
  // Connecté la dernière fois, et plus rien : la session a disparu du stockage.
  return `Cet appareil était connecté (${when(entries[lastIn]!.t)}), puis sa session a été effacée — par le navigateur ou le système.`;
}

/** `SESSION · 4 RENOUVELLEMENTS · 1 REPRISE · DERNIER REFUS 25/09 18:02 (400 …)`. */
export function describeJournal(entries: readonly JournalEntry[]): string {
  if (entries.length === 0) return 'SESSION · AUCUN ÉVÉNEMENT';
  const count = (event: JournalEvent) => entries.filter((entry) => entry.e === event).length;
  const refreshed = count('TOKEN_REFRESHED');
  const recovered = count('RECOVERED');
  const refused = lastWhere(entries, (entry) => entry.e === 'REFRESH_REFUSED');
  const network = count('REFRESH_NETWORK');
  const persist = lastWhere(entries, (entry) => entry.e === 'PERSIST');
  return [
    'SESSION',
    `${refreshed} ${refreshed > 1 ? 'RENOUVELLEMENTS' : 'RENOUVELLEMENT'}`,
    ...(recovered ? [`${recovered} ${recovered > 1 ? 'REPRISES' : 'REPRISE'}`] : []),
    ...(network ? [`${network} ÉCHEC${network > 1 ? 'S' : ''} RÉSEAU`] : []),
    ...(refused ? [`DERNIER REFUS ${when(refused.t)} (${refused.d ?? '—'})`] : []),
    ...(persist ? [`STOCKAGE ${persist.d === 'oui' ? 'PERSISTANT' : 'ORDINAIRE'}`] : []),
  ].join(' · ');
}

// --- Stockage ------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readJournal(): JournalEntry[] {
  try {
    return parseJournal(storage()?.getItem(JOURNAL_KEY) ?? null);
  } catch {
    return [];
  }
}

export function record(e: JournalEvent, d?: string): void {
  try {
    const store = storage();
    if (!store) return;
    const entry: JournalEntry = d ? { t: Date.now(), e, d } : { t: Date.now(), e };
    store.setItem(JOURNAL_KEY, JSON.stringify(appendEntry(readJournal(), entry)));
  } catch {
    // Un journal plein ou refusé ne doit rien empêcher.
  }
}

/** Note un événement seulement s'il dit autre chose que sa dernière occurrence. */
export function recordChange(e: JournalEvent, d: string): void {
  if (lastWhere(readJournal(), (entry) => entry.e === e)?.d === d) return;
  record(e, d);
}

/**
 * `fetch`, avec une trace des renouvellements de session qui échouent.
 *
 * On ne lit que le statut et le code d'erreur de la réponse — jamais le corps
 * d'une réponse réussie, qui porte les jetons.
 */
export function journaledFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const refreshing = url.includes('/auth/v1/token') && url.includes('refresh_token');
    if (!refreshing) return fetchImpl(input, init);
    try {
      const response = await fetchImpl(input, init);
      if (response.status >= 500) {
        // Serveur indisponible : supabase-js réessaiera, la session tient.
        record('REFRESH_NETWORK', String(response.status));
      } else if (!response.ok) {
        let code = '';
        try {
          const body = (await response.clone().json()) as {
            error_code?: string;
            code?: string;
          };
          code = String(body.error_code ?? body.code ?? '');
        } catch {
          // Corps illisible : le statut suffira.
        }
        record('REFRESH_REFUSED', `${response.status}${code ? ` ${code}` : ''}`);
      }
      return response;
    } catch (cause) {
      record('REFRESH_NETWORK', cause instanceof Error ? cause.message.slice(0, 60) : 'réseau');
      throw cause;
    }
  };
}
