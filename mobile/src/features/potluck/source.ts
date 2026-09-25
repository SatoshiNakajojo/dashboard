/**
 * Source de données du potluck.
 *
 * Une seule interface, deux implémentations : Supabase et un magasin mémoire.
 * `PotluckList` ne connaît que l'interface — c'est ce qui permet de livrer le
 * composant avec ses mocks sans écrire une ligne jetable.
 *
 * La règle métier tient dans la valeur de retour de `claim` :
 * **`false` n'est pas une erreur**, c'est « quelqu'un a été plus rapide ».
 * Les deux implémentations doivent la respecter à l'identique.
 */

import { supabase } from '@/lib/supabase';
import { MOCK_POTLUCK_ITEMS } from '@/mocks/events';
import type { PotluckItem } from '@/types/domain';

export type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface PotluckChange {
  type: ChangeType;
  item: PotluckItem;
}

export interface PotluckSource {
  list(eventId: string, signal?: AbortSignal): Promise<PotluckItem[]>;
  /** `true` si la ligne a été prise, `false` si un autre membre l'a devancé. */
  claim(itemId: string, userId: string): Promise<boolean>;
  /** `true` si la ligne a été libérée, `false` si elle ne nous appartenait plus. */
  release(itemId: string, userId: string): Promise<boolean>;
  /** Ajoute des lignes libres en fin de liste — tout membre peut le faire. */
  add(eventId: string, names: readonly string[]): Promise<void>;
  /**
   * « J'apporte aussi… » : une ligne en fin de liste, déjà à son nom. Rend la
   * ligne créée — la liste l'affiche sans attendre le temps réel.
   */
  bring(eventId: string, userId: string, name: string): Promise<PotluckItem>;
  /**
   * Retire une ligne qu'on a soi-même ajoutée (et qu'on apporte, ou libre).
   * `false` si elle n'est pas à nous d'enlever — avant la migration, par exemple.
   */
  withdraw(itemId: string, userId: string): Promise<boolean>;
  /**
   * Retire une ligne **libre**. Seul le créateur de la soirée le peut (RLS) ;
   * `false` si la ligne a été prise entre-temps, ou n'est pas à nous d'enlever.
   */
  remove(itemId: string): Promise<boolean>;
  /** S'abonne aux changements de l'événement. Renvoie la fonction de désabonnement. */
  subscribe(eventId: string, onChange: (change: PotluckChange) => void): () => void;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  event_id: string;
  item_name: string;
  assigned_user_id: string | null;
  position: number;
  /** Absent avant la migration `20261008090000_potluck_member_lines`. */
  added_by?: string | null;
}

function fromRow(row: Row): PotluckItem {
  return {
    id: row.id,
    eventId: row.event_id,
    itemName: row.item_name,
    assignedUserId: row.assigned_user_id,
    position: row.position,
    addedBy: row.added_by ?? null,
  };
}

// `*` : la colonne `added_by` n'existe qu'après sa migration, et la nommer
// casserait la liste d'une base pas encore à jour.
const COLUMNS = '*';

/** La position après la dernière ligne de la soirée. */
async function nextPosition(client: NonNullable<typeof supabase>, eventId: string) {
  const { data, error } = await client
    .from('potluck_items')
    .select('position')
    .eq('event_id', eventId)
    .order('position', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.position ?? 0) + 1;
}

function createSupabaseSource(client: NonNullable<typeof supabase>): PotluckSource {
  return {
    async list(eventId, signal) {
      let query = client
        .from('potluck_items')
        .select(COLUMNS)
        .eq('event_id', eventId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(fromRow);
    },

    async claim(itemId, userId) {
      // `.is('assigned_user_id', null)` double la politique RLS côté requête :
      // la ligne n'est prise que si elle était encore libre à cet instant.
      // Zéro ligne renvoyée = un autre membre a gagné la course.
      const { data, error } = await client
        .from('potluck_items')
        .update({ assigned_user_id: userId })
        .eq('id', itemId)
        .is('assigned_user_id', null)
        .select('id');

      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async release(itemId, userId) {
      const { data, error } = await client
        .from('potluck_items')
        .update({ assigned_user_id: null })
        .eq('id', itemId)
        .eq('assigned_user_id', userId)
        .select('id');

      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async add(eventId, names) {
      if (names.length === 0) return;
      // À la suite de ce qui existe : la liste ne se réordonne pas sous les
      // yeux de ceux qui ont déjà pris une ligne.
      const first = await nextPosition(client, eventId);

      const { error } = await client.from('potluck_items').insert(
        names.map((name, index) => ({
          event_id: eventId,
          item_name: name,
          position: first + index,
        })),
      );
      if (error) throw error;
    },

    async bring(eventId, userId, name) {
      const position = await nextPosition(client, eventId);
      const { data, error } = await client
        .from('potluck_items')
        .insert({ event_id: eventId, item_name: name, assigned_user_id: userId, position })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return fromRow(data as Row);
    },

    async withdraw(itemId, userId) {
      const { data, error } = await client
        .from('potluck_items')
        .delete()
        .eq('id', itemId)
        .eq('added_by', userId)
        .select('id');
      // Avant la migration, la colonne n'existe pas : la ligne se libère.
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },

    async remove(itemId) {
      // `.is(…, null)` : une ligne qu'un membre vient de prendre reste.
      const { data, error } = await client
        .from('potluck_items')
        .delete()
        .eq('id', itemId)
        .is('assigned_user_id', null)
        .select('id');

      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    subscribe(eventId, onChange) {
      const channel = client
        .channel(`potluck:${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'potluck_items',
            filter: `event_id=eq.${eventId}`,
          },
          (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as
              | Row
              | undefined;
            // Un DELETE sans REPLICA IDENTITY FULL n'expose que la clé ;
            // sans `event_id` on ne saurait pas à quelle liste il appartient.
            if (!row?.id) return;
            onChange({ type: payload.eventType as ChangeType, item: fromRow(row) });
          },
        )
        .subscribe();

      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock — magasin mémoire, mêmes garanties de concurrence
// ---------------------------------------------------------------------------

type Listener = (change: PotluckChange) => void;

/** Latence simulée : sans elle, l'écriture optimiste ne serait jamais visible. */
const MOCK_LATENCY_MS = 220;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createMockSource(): PotluckSource {
  const store = new Map<string, PotluckItem>(MOCK_POTLUCK_ITEMS.map((i) => [i.id, { ...i }]));
  const listeners = new Map<string, Set<Listener>>();
  let added = 0;

  function emit(eventId: string, change: PotluckChange) {
    listeners.get(eventId)?.forEach((listener) => listener(change));
  }

  return {
    async list(eventId) {
      await delay(MOCK_LATENCY_MS);
      return [...store.values()]
        .filter((item) => item.eventId === eventId)
        .sort((a, b) => a.position - b.position)
        .map((item) => ({ ...item }));
    },

    async claim(itemId, userId) {
      await delay(MOCK_LATENCY_MS);
      const item = store.get(itemId);
      if (!item) return false;
      // Même sémantique que la politique RLS : une ligne déjà prise refuse.
      if (item.assignedUserId !== null) return false;

      const next = { ...item, assignedUserId: userId };
      store.set(itemId, next);
      emit(item.eventId, { type: 'UPDATE', item: next });
      return true;
    },

    async release(itemId, userId) {
      await delay(MOCK_LATENCY_MS);
      const item = store.get(itemId);
      if (!item || item.assignedUserId !== userId) return false;

      const next = { ...item, assignedUserId: null };
      store.set(itemId, next);
      emit(item.eventId, { type: 'UPDATE', item: next });
      return true;
    },

    async add(eventId, names) {
      await delay(MOCK_LATENCY_MS);
      const after = Math.max(
        0,
        ...[...store.values()].filter((i) => i.eventId === eventId).map((i) => i.position),
      );
      names.forEach((itemName, index) => {
        added += 1;
        const item: PotluckItem = {
          id: `33333333-3333-4333-9333-${String(added).padStart(12, '0')}`,
          eventId,
          itemName,
          assignedUserId: null,
          position: after + index + 1,
        };
        store.set(item.id, item);
        emit(eventId, { type: 'INSERT', item: { ...item } });
      });
    },

    async bring(eventId, userId, name) {
      await delay(MOCK_LATENCY_MS);
      const after = Math.max(
        0,
        ...[...store.values()].filter((i) => i.eventId === eventId).map((i) => i.position),
      );
      added += 1;
      const item: PotluckItem = {
        id: `33333333-3333-4333-9333-${String(added).padStart(12, '0')}`,
        eventId,
        itemName: name,
        assignedUserId: userId,
        position: after + 1,
        addedBy: userId,
      };
      store.set(item.id, item);
      emit(eventId, { type: 'INSERT', item: { ...item } });
      return { ...item };
    },

    async withdraw(itemId, userId) {
      await delay(MOCK_LATENCY_MS);
      const item = store.get(itemId);
      if (!item || item.addedBy !== userId) return false;
      if (item.assignedUserId !== null && item.assignedUserId !== userId) return false;
      store.delete(itemId);
      emit(item.eventId, { type: 'DELETE', item });
      return true;
    },

    async remove(itemId) {
      await delay(MOCK_LATENCY_MS);
      const item = store.get(itemId);
      if (!item || item.assignedUserId !== null) return false;
      store.delete(itemId);
      emit(item.eventId, { type: 'DELETE', item });
      return true;
    },

    subscribe(eventId, onChange) {
      const set = listeners.get(eventId) ?? new Set<Listener>();
      set.add(onChange);
      listeners.set(eventId, set);
      return () => {
        set.delete(onChange);
        if (set.size === 0) listeners.delete(eventId);
      };
    },
  };
}

/** Instance unique : le magasin mock doit survivre aux démontages d'écran. */
const mockSource = createMockSource();

export function getPotluckSource(): PotluckSource {
  return supabase ? createSupabaseSource(supabase) : mockSource;
}
