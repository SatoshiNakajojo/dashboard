import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { MEMBER_LIST } from '@/mocks/members';
import type { Member } from '@/types/domain';

export interface MembersState {
  members: Member[];
  byId: Map<string, Member>;
  loading: boolean;
}

function index(members: Member[]): Map<string, Member> {
  return new Map(members.map((m) => [m.id, m]));
}

/**
 * Annuaire du club. Chargé une fois : un club de 7 membres n'a pas besoin de
 * pagination, et la couleur d'un membre doit être disponible partout,
 * immédiatement.
 */
export function useMembers(): MembersState {
  const [members, setMembers] = useState<Member[]>(supabase ? [] : MEMBER_LIST);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, initials, color')
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error || !data) {
        setLoading(false);
        return;
      }

      setMembers(
        data.map((row) => ({
          id: row.id,
          displayName: row.display_name,
          initials: row.initials,
          color: row.color,
        })),
      );
      setLoading(false);
    })();

    return () => controller.abort();
  }, []);

  return { members, byId: index(members), loading };
}
