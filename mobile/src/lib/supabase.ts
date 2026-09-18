/**
 * Client Supabase.
 *
 * L'app fonctionne **sans backend** : tant que les variables d'environnement
 * sont absentes, `supabase` vaut `null` et les hooks basculent sur les mocks
 * (`src/mocks`). C'est ce qui permet de livrer l'étape 3 avant l'étape 2 sans
 * dupliquer un seul composant.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** `true` dès que le backend est configuré. */
export const isSupabaseConfigured = Boolean(URL && ANON_KEY);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(URL!, ANON_KEY!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Pas de session dans l'URL : on n'est pas dans un navigateur.
        detectSessionInUrl: false,
      },
      realtime: {
        // Plafond de messages par seconde — le potluck est bavard à plusieurs.
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

/**
 * Message d'erreur lisible par un humain à partir de ce que renvoie Supabase.
 * On ne remonte jamais un code Postgres brut à l'écran.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Erreur inconnue';
  if (typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('violates row-level security')) {
      return 'Cette ligne ne vous appartient pas.';
    }
    if (message.includes('Failed to fetch') || message.includes('Network request failed')) {
      return 'Connexion indisponible.';
    }
    return message;
  }
  return String(error);
}
