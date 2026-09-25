import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { onMockAdoption } from '@/features/nights/proposals';
import { getPotluckSource } from '@/features/potluck/source';
import { pushNotice, type AttendanceNotice } from '@/lib/attendanceNotice';
import { normalizeThemes } from '@/lib/nightThemes';
import { describeError, supabase } from '@/lib/supabase';
import { MOCK_ATTENDANCE, MOCK_EVENTS } from '@/mocks/events';
import type { EventRow } from '@/types/database';
import type { ClubEvent } from '@/types/domain';

export interface EventWithAttendance extends ClubEvent {
  attendeeIds: string[];
}

export interface NightDraft {
  /** Instant de début, décalage compris — `2026-10-03T19:30:00+11:00`. */
  startsAt: string;
  title: string;
  location: string;
  /** Crypto Night, Stock Night… au moins un, au plus cinq. */
  themes: string[];
  /** Ce qu'il y a à apporter, laissé libre. Peut être vide. */
  potluck: string[];
}

/** Une soirée modifiée : ses champs, et ce qui change dans sa liste. */
export interface NightEdit extends Omit<NightDraft, 'potluck'> {
  /** Lignes à ajouter en fin de liste. */
  potluckAdded: string[];
  /** Lignes **libres** à retirer, par identifiant. */
  potluckRemoved: string[];
}

export interface EventsState {
  events: EventWithAttendance[];
  loading: boolean;
  error: string | null;
  /** Bascule la présence de l'utilisateur courant, en optimiste. */
  toggleRsvp: (eventId: string) => void;
  /** Crée une soirée et sa liste. Résout `false` en cas d'échec. */
  create: (draft: NightDraft) => Promise<boolean>;
  /** Écriture en cours — le bouton s'en sert. */
  creating: boolean;
  /**
   * Modifie une soirée publiée — réservé à celui qui l'a proposée. Résout
   * `false` si rien n'a été enregistré.
   */
  update: (eventId: string, edit: NightEdit) => Promise<boolean>;
  /** Modification en cours. */
  saving: boolean;
  /** Supprime une soirée — réservé à celui qui l'a proposée. */
  remove: (eventId: string) => Promise<boolean>;
  /** Les « X vient à Y » reçus des autres membres, la plus récente en tête. */
  notices: AttendanceNotice[];
  /** Referme une annonce — au doigt, ou à l'expiration de son minuteur. */
  dismissNotice: (id: string) => void;
}

/**
 * `*` plutôt qu'une liste : avant la migration `20260930090000_edit_nights`,
 * nommer `edited_at` ferait échouer toute la lecture de l'agenda.
 */
const EVENT_COLUMNS = '*';

/** Une ligne `events` — entière ou poussée par le temps réel — en soirée. */
export function fromEventRow(
  row: Partial<EventRow>,
  attendeeIds: string[],
): EventWithAttendance {
  return {
    id: row.id ?? '',
    startsAt: row.starts_at ?? '',
    title: row.title ?? '',
    location: row.location ?? '',
    themes: row.themes ?? [],
    createdBy: row.created_by ?? null,
    editedAt: row.edited_at ?? null,
    attendeeIds,
  };
}

const byStart = (a: ClubEvent, b: ClubEvent) => a.startsAt.localeCompare(b.startsAt);

/**
 * L'agenda et ses présences, lus une fois.
 *
 * Lève sur l'échec de l'agenda ; une liste de présences illisible donne des
 * soirées sans présents plutôt que pas de soirée du tout.
 */
export async function loadNights(
  client: NonNullable<typeof supabase>,
  signal: AbortSignal,
): Promise<EventWithAttendance[]> {
  const [eventsResult, attendeesResult] = await Promise.all([
    client
      .from('events')
      .select(EVENT_COLUMNS)
      .order('starts_at', { ascending: true })
      .abortSignal(signal),
    client.from('event_attendees').select('event_id, user_id').abortSignal(signal),
  ]);

  if (eventsResult.error) throw eventsResult.error;

  const byEvent = new Map<string, string[]>();
  for (const row of attendeesResult.data ?? []) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push(row.user_id);
    byEvent.set(row.event_id, list);
  }

  return ((eventsResult.data ?? []) as Partial<EventRow>[]).map((row) =>
    fromEventRow(row, byEvent.get(row.id ?? '') ?? []),
  );
}

/** Les soirées du mode démo, avec leurs présences. */
export function mockNights(): EventWithAttendance[] {
  return MOCK_EVENTS.map((event) => ({
    ...event,
    attendeeIds: MOCK_ATTENDANCE[event.id] ?? [],
  }));
}

/** Agenda des Crypto Nights + présences. */
export function useEvents(currentUserId: string | null): EventsState {
  // Sans backend, les mocks sont l'état initial : les poser depuis un effet
  // provoquerait un rendu vide inutile avant le premier contenu.
  const [events, setEvents] = useState<EventWithAttendance[]>(() =>
    supabase ? [] : mockNights(),
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<AttendanceNotice[]>([]);

  /**
   * L'abonnement temps réel se monte une fois et ne se redémarre pas quand
   * l'identité arrive — rouvrir un canal WebSocket à chaque rendu perdrait des
   * messages. Une référence suffit à savoir, au moment où l'annonce tombe, si
   * elle parle de nous.
   */
  const meRef = useRef(currentUserId);
  useEffect(() => {
    meRef.current = currentUserId;
  }, [currentUserId]);

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

  /**
   * Les soirées en direct.
   *
   * Sans cet abonnement, une soirée proposée par un membre n'apparaissait chez
   * les six autres qu'à leur prochaine ouverture de l'app — ce qui, pour une
   * invitation, revient à ne pas l'envoyer.
   *
   * On ne rapatrie pas la ligne poussée telle quelle : elle ne porte pas les
   * présences, et un `insert` concurrent au nôtre doit rester idempotent. On
   * relit l'agenda, c'est court et sans surprise.
   */
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel('events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<EventRow> | undefined;
        if (!row?.id) return;

        setEvents((current) => {
          if (payload.eventType === 'DELETE') {
            return current.filter((event) => event.id !== row.id);
          }
          // Les présences arrivent par leur propre table, déjà en temps réel.
          const incoming = fromEventRow(
            row,
            current.find((event) => event.id === row.id)?.attendeeIds ?? [],
          );
          const without = current.filter((event) => event.id !== row.id);
          return [...without, incoming].sort(byStart);
        });
      })
      /**
       * Les présences, elles aussi.
       *
       * Sans ça, « Je viens » n'était visible que de celui qui l'avait tapé :
       * les six autres découvraient sa venue à leur prochaine ouverture de
       * l'app. C'est pourtant le seul moment où une soirée se décide.
       *
       * Les écritures en vol sont optimistes, donc l'écho de sa propre action
       * retombe sur un état déjà à jour — l'ensemble s'en moque, il est
       * idempotent.
       */
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_attendees' },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            { event_id?: string; user_id?: string } | undefined;
          if (!row?.event_id || !row.user_id) return;
          const { event_id: eventId, user_id: userId } = row;
          const arriving = payload.eventType !== 'DELETE';

          // On ne s'annonce pas à soi-même : le bouton vient déjà de passer au
          // vert sous le doigt, une bannière par-dessus serait du bruit.
          if (userId !== meRef.current) {
            setNotices((current) =>
              pushNotice(current, { id: `${eventId}:${userId}`, eventId, userId, arriving }),
            );
          }

          setEvents((current) =>
            current.map((event) => {
              if (event.id !== eventId) return event;
              const present = event.attendeeIds.includes(userId);
              if (arriving === present) return event;
              return {
                ...event,
                attendeeIds: arriving
                  ? [...event.attendeeIds, userId]
                  : event.attendeeIds.filter((id) => id !== userId),
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const toggleRsvp = useCallback(
    (eventId: string) => {
      if (!currentUserId) return;

      const event = events.find((candidate) => candidate.id === eventId);
      if (!event) return;
      const going = event.attendeeIds.includes(currentUserId);

      // Optimiste d'abord : le bouton doit répondre au doigt, pas au réseau.
      setEvents((current) =>
        current.map((candidate) =>
          candidate.id !== eventId
            ? candidate
            : {
                ...candidate,
                attendeeIds: going
                  ? candidate.attendeeIds.filter((id) => id !== currentUserId)
                  : [...candidate.attendeeIds, currentUserId],
              },
        ),
      );

      const client = supabase;
      if (!client) return;

      const revert = () => {
        setEvents((current) =>
          current.map((candidate) =>
            candidate.id !== eventId
              ? candidate
              : {
                  ...candidate,
                  attendeeIds: going
                    ? [...candidate.attendeeIds, currentUserId]
                    : candidate.attendeeIds.filter((id) => id !== currentUserId),
                },
          ),
        );
      };

      const write = going
        ? client
            .from('event_attendees')
            .delete()
            .eq('event_id', eventId)
            .eq('user_id', currentUserId)
        : client.from('event_attendees').insert({ event_id: eventId, user_id: currentUserId });

      void write.then(({ error: cause }) => {
        if (cause) {
          revert();
          setError(describeError(cause));
        }
      });
    },
    [currentUserId, events],
  );

  /**
   * Crée une soirée, puis ses lignes de potluck.
   *
   * Pas optimiste, contrairement au RSVP : on n'affiche une soirée que lorsque
   * la base l'a acceptée. Une Crypto Night qui apparaîtrait puis
   * disparaîtrait serait pire que trois secondes d'attente — les six autres
   * membres la voient.
   *
   * Le potluck est écrit après coup, et son échec ne défait pas la soirée : une
   * soirée sans liste reste une soirée, et les lignes se rajoutent. Tout
   * annuler pour une ligne refusée coûterait plus que ça ne protège.
   */
  const create = useCallback(
    async (draft: NightDraft): Promise<boolean> => {
      const client = supabase;
      if (!client || !currentUserId || creating) return false;

      setCreating(true);
      setError(null);
      try {
        const { data, error: cause } = await client
          .from('events')
          .insert({
            starts_at: draft.startsAt,
            title: draft.title.trim(),
            location: draft.location.trim(),
            themes: normalizeThemes(draft.themes),
            created_by: currentUserId,
          })
          .select(EVENT_COLUMNS)
          .single();

        if (cause || !data) {
          setError(describeError(cause));
          return false;
        }

        const lines = draft.potluck.map((name) => name.trim()).filter(Boolean);
        if (lines.length > 0) {
          const { error: potluckCause } = await client.from('potluck_items').insert(
            lines.map((name, index) => ({
              event_id: data.id,
              item_name: name,
              position: index + 1,
            })),
          );
          if (potluckCause) setError(describeError(potluckCause));
        }

        // Le canal temps réel va pousser la même ligne, mais on ne l'attend
        // pas : celui qui vient de créer sa soirée doit la voir tout de suite.
        // L'insertion est idempotente — l'écho retombera sur un état à jour.
        const created = fromEventRow(data as Partial<EventRow>, []);
        setEvents((current) =>
          [...current.filter((event) => event.id !== created.id), created].sort(byStart),
        );
        return true;
      } finally {
        setCreating(false);
      }
    },
    [creating, currentUserId],
  );

  /**
   * Modifie une soirée déjà publiée.
   *
   * Comme la création, pas d'optimisme : la carte ne change qu'une fois la base
   * d'accord. La RLS (`events_update_own`) réserve l'écriture au créateur ; un
   * autre membre obtiendrait zéro ligne, et on le lui dit. `edited_at` est posé
   * par la base, pas par nous.
   *
   * La liste suit, comme à la création : ajouter des lignes, retirer des lignes
   * encore libres. Son échec n'annule pas la modification de la soirée.
   */
  const update = useCallback(
    async (eventId: string, edit: NightEdit): Promise<boolean> => {
      const before = events.find((event) => event.id === eventId);
      if (!currentUserId || !before || saving) return false;

      const fields = {
        starts_at: edit.startsAt,
        title: edit.title.trim(),
        location: edit.location.trim(),
        themes: normalizeThemes(edit.themes),
      };

      setSaving(true);
      setError(null);
      try {
        let after: EventWithAttendance;
        const client = supabase;
        if (client) {
          const { data, error: cause } = await client
            .from('events')
            .update(fields)
            .eq('id', eventId)
            .select(EVENT_COLUMNS);
          if (cause) {
            setError(describeError(cause));
            return false;
          }
          const row = (data as Partial<EventRow>[] | null)?.[0];
          if (!row) {
            setError('Seul le membre qui a proposé cette soirée peut la modifier.');
            return false;
          }
          after = fromEventRow(row, before.attendeeIds);
        } else {
          // Démo : la même règle que la base, en mémoire.
          if (before.createdBy !== currentUserId) {
            setError('Seul le membre qui a proposé cette soirée peut la modifier.');
            return false;
          }
          const moved =
            Date.parse(fields.starts_at) !== Date.parse(before.startsAt) ||
            fields.title !== before.title ||
            fields.location !== before.location ||
            fields.themes.join('\n') !== before.themes.join('\n');
          after = {
            ...before,
            startsAt: fields.starts_at,
            title: fields.title,
            location: fields.location,
            themes: fields.themes,
            editedAt: moved ? new Date().toISOString() : before.editedAt,
          };
        }

        setEvents((current) =>
          current.map((event) => (event.id === eventId ? after : event)).sort(byStart),
        );

        const potluck = getPotluckSource();
        const lines = edit.potluckAdded.map((name) => name.trim()).filter(Boolean);
        try {
          let kept = 0;
          for (const itemId of edit.potluckRemoved) {
            if (!(await potluck.remove(itemId))) kept += 1;
          }
          if (lines.length > 0) await potluck.add(eventId, lines);
          if (kept > 0) {
            setError(
              kept === 1
                ? 'Une ligne a été prise entre-temps : elle reste sur la liste.'
                : `${kept} lignes ont été prises entre-temps : elles restent sur la liste.`,
            );
          }
        } catch (cause) {
          setError(describeError(cause));
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [currentUserId, events, saving],
  );

  /**
   * Supprime une de mes soirées. Présences, liste et contre-propositions
   * partent avec elle (`on delete cascade`) ; le temps réel l'ôte chez les
   * autres. La RLS (`events_delete_own`) la réserve à son créateur.
   */
  const remove = useCallback(
    async (eventId: string): Promise<boolean> => {
      const event = events.find((candidate) => candidate.id === eventId);
      if (!currentUserId || !event || saving) return false;
      if (event.createdBy !== currentUserId) {
        setError('Seul le membre qui a proposé cette soirée peut la supprimer.');
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const client = supabase;
        if (client) {
          const { data, error: cause } = await client
            .from('events')
            .delete()
            .eq('id', eventId)
            .select('id');
          if (cause) {
            setError(describeError(cause));
            return false;
          }
          if (!data || data.length === 0) {
            setError('Seul le membre qui a proposé cette soirée peut la supprimer.');
            return false;
          }
        }
        setEvents((current) => current.filter((candidate) => candidate.id !== eventId));
        return true;
      } finally {
        setSaving(false);
      }
    },
    [currentUserId, events, saving],
  );

  // Démo : une contre-proposition adoptée déplace la soirée, comme la base
  // le fait en production (et que le temps réel rapporte).
  useEffect(() => {
    if (supabase) return;
    return onMockAdoption((eventId, location) =>
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, location, editedAt: new Date().toISOString() }
            : event,
        ),
      ),
    );
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  return useMemo(
    () => ({
      events,
      loading,
      error,
      toggleRsvp,
      create,
      creating,
      update,
      saving,
      remove,
      notices,
      dismissNotice,
    }),
    [
      events,
      loading,
      error,
      toggleRsvp,
      create,
      creating,
      update,
      saving,
      remove,
      notices,
      dismissNotice,
    ],
  );
}
