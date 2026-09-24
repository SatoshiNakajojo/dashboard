import { useEffect, useState } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import { loadNights, mockNights, type EventWithAttendance } from './useEvents';

/**
 * L'agenda du club, lu une fois — pour la page d'un membre.
 *
 * Même raison que `useClubBets` : l'onglet Soirées tient déjà le canal temps
 * réel `events`, et un second abonné le partagerait.
 *
 * Sans backend, on repart des présences de démo du démarrage : celles cochées
 * depuis dans l'onglet Soirées ne sont connues que de lui.
 */
export function useClubNights(): {
  events: EventWithAttendance[];
  loading: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<EventWithAttendance[]>(() =>
    supabase ? [] : mockNights(),
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const controller = new AbortController();

    (async () => {
      try {
        const loaded = await loadNights(client, controller.signal);
        if (controller.signal.aborted) return;
        setEvents(loaded);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(describeError(cause));
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, []);

  return { events, loading, error };
}
