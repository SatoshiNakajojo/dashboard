import { useCallback, useEffect, useMemo, useState } from 'react';

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
}

/** Agenda des Crypto Nights + présences. */
export function useEvents(currentUserId: string | null): EventsState {
  // Sans backend, les mocks sont l'état initial : les poser depuis un effet
  // provoquerait un rendu vide inutile avant le premier contenu.
  const [events, setEvents] = useState<EventWithAttendance[]>(() =>
    supabase
      ? []
      : MOCK_EVENTS.map((event) => ({
          ...event,
          attendeeIds: MOCK_ATTENDANCE[event.id] ?? [],
        })),
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const [eventsResult, attendeesResult] = await Promise.all([
        client
          .from('events')
          .select('id, starts_at, title, location, themes')
          .order('starts_at', { ascending: true })
          .abortSignal(controller.signal),
        client
          .from('event_attendees')
          .select('event_id, user_id')
          .abortSignal(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      if (eventsResult.error) {
        setError(describeError(eventsResult.error));
        setLoading(false);
        return;
      }

      const byEvent = new Map<string, string[]>();
      for (const row of attendeesResult.data ?? []) {
        const list = byEvent.get(row.event_id) ?? [];
        list.push(row.user_id);
        byEvent.set(row.event_id, list);
      }

      setEvents(
        (eventsResult.data ?? []).map((row) => ({
          id: row.id,
          startsAt: row.starts_at,
          title: row.title,
          location: row.location,
          themes: row.themes ?? [],
          attendeeIds: byEvent.get(row.id) ?? [],
        })),
      );
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
          const incoming: EventWithAttendance = {
            id: row.id!,
            startsAt: row.starts_at ?? '',
            title: row.title ?? '',
            location: row.location ?? '',
            themes: row.themes ?? [],
            // Les présences arrivent par leur propre table, déjà en temps réel.
            attendeeIds: current.find((event) => event.id === row.id)?.attendeeIds ?? [],
          };
          const without = current.filter((event) => event.id !== row.id);
          return [...without, incoming].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        });
      })
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
          .select('id, starts_at, title, location, themes')
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

        // `events` n'est pas publiée en temps réel : le créateur doit voir sa
        // soirée sans recharger, les autres la verront à leur prochaine visite.
        setEvents((current) =>
          [
            ...current,
            {
              id: data.id,
              startsAt: data.starts_at,
              title: data.title,
              location: data.location,
              themes: data.themes ?? [],
              attendeeIds: [],
            },
          ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        );
        return true;
      } finally {
        setCreating(false);
      }
    },
    [creating, currentUserId],
  );

  return useMemo(
    () => ({ events, loading, error, toggleRsvp, create, creating }),
    [events, loading, error, toggleRsvp, create, creating],
  );
}
