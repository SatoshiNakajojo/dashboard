/**
 * Disponibilité du moteur Skia.
 *
 * Sur iOS et Android, Skia est natif : prêt immédiatement. Sur le web, c'est un
 * binaire WebAssembly de 8 Mo qu'il faut servir soi-même (`public/canvaskit.wasm`,
 * copié par `npm run canvaskit`).
 *
 * Le chargement ne bloque **jamais** le démarrage de l'app : un CanvasKit lent
 * ou absent dégrade l'onglet Oracle, il ne blanchit pas l'écran. Les composants
 * s'abonnent via `useSkiaReady()` et se redessinent quand le moteur arrive.
 */

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

let ready = Platform.OS !== 'web';
let started = false;
const listeners = new Set<() => void>();

function publish(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => ready;

/** Charge CanvasKit sur le web. Idempotent, et ne rejette jamais. */
export async function loadSkia(): Promise<void> {
  if (ready || started) return;
  started = true;

  try {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
    ready = true;
  } catch {
    // L'onglet Oracle affichera « graphique indisponible » ; le reste de l'app
    // n'en sait rien et fonctionne normalement.
    ready = false;
  } finally {
    publish();
  }
}

/** `true` quand Skia peut peindre. Redéclenche un rendu au moment du passage. */
export function useSkiaReady(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
