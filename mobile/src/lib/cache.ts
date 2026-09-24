/**
 * Cache mémoire + disque à TTL, avec repli explicite sur la valeur périmée.
 *
 * C'est la pièce qui rend l'état « HORS LIGNE » possible (README §6) : quand le
 * réseau tombe, on sert la dernière valeur connue **en la marquant périmée**,
 * plutôt que d'afficher un écran d'erreur bloquant.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> {
  value: T;
  storedAt: number;
}

const memory = new Map<string, Entry<unknown>>();

const diskKey = (key: string) => `ssc.cache.${key}`;

export async function readCache<T>(key: string): Promise<Entry<T> | null> {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) return hit;

  try {
    const raw = await AsyncStorage.getItem(diskKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (typeof parsed?.storedAt !== 'number') return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    // Un cache illisible n'est pas une panne : on repart d'un cache vide.
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  const entry: Entry<T> = { value, storedAt: Date.now() };
  memory.set(key, entry);
  try {
    await AsyncStorage.setItem(diskKey(key), JSON.stringify(entry));
  } catch {
    // Le cache disque est un confort ; le cache mémoire suffit à la session.
  }
}

export interface CachedResult<T> {
  value: T;
  /** Vrai si la valeur dépasse son TTL — l'UI doit afficher `HORS LIGNE`. */
  stale: boolean;
  storedAt: number;
}

/** Chargements en vol, par clé : deux demandes simultanées n'en font qu'une. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Sert la valeur fraîche du cache, sinon appelle `load`, sinon retombe sur la
 * valeur périmée. Ne lève que si le réseau échoue **et** qu'aucune valeur
 * n'a jamais été mise en cache.
 *
 * Deux appels simultanés pour la même clé partagent le même chargement. Sans
 * ça, trois écrans qui se rafraîchissent ensemble font trois requêtes — et
 * CoinGecko, qui limite l'API publique à quelques appels par minute, refuse
 * les suivantes.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<CachedResult<T>> {
  const pending = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (pending) return pending;

  const task = resolveCached(key, ttlMs, load).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

async function resolveCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<CachedResult<T>> {
  const cached = await readCache<T>(key);
  const now = Date.now();

  if (cached && now - cached.storedAt < ttlMs) {
    return { value: cached.value, stale: false, storedAt: cached.storedAt };
  }

  try {
    const value = await load();
    await writeCache(key, value);
    return { value, stale: false, storedAt: Date.now() };
  } catch (error) {
    if (cached) return { value: cached.value, stale: true, storedAt: cached.storedAt };
    throw error;
  }
}

/** Vide le cache — utilisé par les tests et le « tirer pour rafraîchir ». */
export async function invalidate(key: string): Promise<void> {
  memory.delete(key);
  try {
    await AsyncStorage.removeItem(diskKey(key));
  } catch {
    // sans effet
  }
}
