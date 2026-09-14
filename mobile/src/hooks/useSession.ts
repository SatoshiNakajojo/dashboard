import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { MOCK_CURRENT_USER_ID } from '@/mocks/members';

export interface SessionState {
  userId: string | null;
  loading: boolean;
}

/**
 * Identité de l'utilisateur courant.
 *
 * Sans backend configuré, on rend l'identité mock (« Toi ») : l'app reste
 * pleinement navigable en développement, et aucun composant n'a besoin de
 * savoir lequel des deux mondes il habite.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    supabase ? { userId: null, loading: true } : { userId: MOCK_CURRENT_USER_ID, loading: false },
  );

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ userId: data.session?.user.id ?? null, loading: false });
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState({ userId: session?.user.id ?? null, loading: false });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
