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

/**
 * Où trouver `canvaskit.wasm`.
 *
 * L'app est publiée sous un sous-chemin (`/dashboard/club/`) : une URL absolue
 * en `/canvaskit.wasm` tomberait à la racine du domaine. On la résout donc
 * relativement au document — ce qui marche aussi bien à la racine que sous un
 * sous-chemin, et en développement.
 */
function assetUrl(file: string): string {
  if (typeof document === 'undefined') return `/${file}`;

  const base = process.env.EXPO_BASE_URL ?? '';
  if (base) return `${base.replace(/\/$/, '')}/${file}`;

  return new URL(file, document.baseURI).href;
}

/** Charge CanvasKit sur le web. Idempotent, et ne rejette jamais. */
export async function loadSkia(): Promise<void> {
  if (ready || started) return;
  started = true;

  try {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb({ locateFile: assetUrl });
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
