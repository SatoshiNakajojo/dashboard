import { useSyncExternalStore } from 'react';

import { readAppRefresh, subscribeToAppRefresh } from '@/lib/appRefresh';

/**
 * Change à chaque « actualiser » — bouton ↻, retour dans l'app, notification
 * touchée. Un chargement de données le met dans ses dépendances pour se
 * relire (`src/lib/appRefresh.ts`).
 */
export function useAppRefresh(): number {
  return useSyncExternalStore(subscribeToAppRefresh, readAppRefresh, readAppRefresh);
}
