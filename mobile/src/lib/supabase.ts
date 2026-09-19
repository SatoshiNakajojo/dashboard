/**
 * Client Supabase.
 *
 * L'app fonctionne **sans backend** : tant que les variables d'environnement
 * sont absentes, `supabase` vaut `null` et les hooks basculent sur les mocks
 * (`src/mocks`). C'est ce qui permet de livrer l'étape 3 avant l'étape 2 sans
 * dupliquer un seul composant.
 */

import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
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
        /**
         * Une PWA **est** un navigateur.
         *
         * Le club se connecte par code à six chiffres, et c'est le bon choix
         * pour une app installée : sur iOS, un lien magique s'ouvre dans
         * Safari, pas dans l'app de l'écran d'accueil — la session atterrirait
         * dans un stockage que l'app ne voit pas.
         *
         * Reste qu'un membre cliquera le lien depuis un onglet ordinaire. Là,
         * consommer les jetons de l'URL le connecte au lieu de le laisser
         * devant un écran qui l'ignore.
         */
        detectSessionInUrl: Platform.OS === 'web',
      },
      realtime: {
        // Plafond de messages par seconde — le potluck est bavard à plusieurs.
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

export { describeError } from './errorMessages';
