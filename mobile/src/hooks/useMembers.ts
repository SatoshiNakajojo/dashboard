import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { profileRevision, subscribeToProfileChange } from '@/features/auth/useAuth';
import { useAppRefresh } from '@/hooks/useAppRefresh';
import { parseLinks } from '@/lib/profileLinks';
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

  /**
   * L'annuaire se relit quand un profil change.
   *
   * Sans ça, un membre qui changeait son nom ou sa photo gardait ses anciennes
   * initiales dans l'en-tête, sur ses cartes et sur sa courbe de l'Oracle
   * jusqu'au prochain démarrage de l'app — il avait donc l'impression que
   * l'enregistrement n'avait rien fait.
   */
  const revision = useSyncExternalStore(
    subscribeToProfileChange,
    profileRevision,
    profileRevision,
  );

  /** « Actualiser » : l'annuaire se relit aussi (`appRefresh.ts`). */
  const refresh = useAppRefresh();

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, initials, color, avatar_url, links')
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
          avatarUrl: row.avatar_url ?? null,
          links: parseLinks(row.links),
        })),
      );
      setLoading(false);
    })();

    return () => controller.abort();
  }, [revision, refresh]);

  // Mémoïsé : une Map neuve à chaque rendu relançait tous les calculs qui en
  // dépendent — les perfs des calls, les classements — et redessinait les cartes.
  const byId = useMemo(() => index(members), [members]);
  return { members, byId, loading };
}
