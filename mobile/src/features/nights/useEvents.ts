import { useCallback, useEffect, useMemo, useState } from 'react';

import { describeError, supabase } from '@/lib/supabase';
import { MOCK_ATTENDANCE, MOCK_EVENTS } from '@/mocks/events';
import type { ClubEvent } from '@/types/domain';

export interface EventWithAttendance extends ClubEvent {
  attendeeIds: string[];
}

export interface EventsState {
  events: EventWithAttendance[];
  loading: boolean;
  error: string | null;
  /** Bascule la présence de l'utilisateur courant, en optimiste. */
  toggleRsvp: (eventId: string) => void;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const [eventsResult, attendeesResult] = await Promise.all([
        client
          .from('events')
          .select('id, starts_at, theme, location, tag')
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
          theme: row.theme,
          location: row.location,
          tag: row.tag,
          attendeeIds: byEvent.get(row.id) ?? [],
        })),
      );
      setLoading(false);
    })();

    return () => controller.abort();
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

  return useMemo(
    () => ({ events, loading, error, toggleRsvp }),
    [events, loading, error, toggleRsvp],
  );
}
