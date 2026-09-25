import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppRefresh } from '@/hooks/useAppRefresh';
import { describeError } from '@/lib/supabase';
import type { Member, PotluckItem, PotluckRow } from '@/types/domain';
import { getPotluckSource, type PotluckChange } from './source';

/**
 * Assignation optimiste d'une ligne de potluck, réconciliée en temps réel.
 *
 * Trois états coexistent, et c'est volontaire :
 *   • `items`   — la vérité serveur, poussée par Realtime ;
 *   • `pending` — les écritures en vol, appliquées par-dessus ;
 *   • le rendu  — `pending` gagne tant qu'il existe.
 *
 * Le rollback n'est pas un cas d'erreur exotique : deux membres qui tapent
 * « Glaçons » en même temps, c'est la soirée normale. Le perdant voit sa
 * pastille revenir et lit une ligne d'explication, sans interruption.
 */

export interface PotluckState {
  rows: PotluckRow[];
  loading: boolean;
  /** Panne de chargement — la liste est vide et le reste. */
  error: string | null;
  /** Message transitoire : conflit d'assignation, écriture refusée. */
  notice: string | null;
  dismissNotice: () => void;
  /** `3 / 6` — besoins couverts sur le total. */
  assignedCount: number;
  totalCount: number;
  toggle: (itemId: string) => void;
  /**
   * « J'apporte aussi… » : ajoute une ligne à son nom. `true` si elle est
   * enregistrée ; sinon `notice` dit pourquoi.
   */
  bring: (name: string) => Promise<boolean>;
  /** Ajout en cours. */
  bringing: boolean;
  reload: () => void;
}

const NOTICE_TIMEOUT_MS = 4_000;

export function usePotluckItems(
  eventId: string,
  currentUserId: string | null,
  membersById: Map<string, Member>,
): PotluckState {
  const [items, setItems] = useState<PotluckItem[]>([]);
  const [pending, setPending] = useState<Map<string, string | null>>(new Map());
  /**
   * Événement pour lequel `items` est à jour. `loading` en est dérivé plutôt
   * que d'être un état à part : un `setState` synchrone dans un effet
   * déclenche une cascade de rendus, et l'information est déjà là.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [bringing, setBringing] = useState(false);
  /** « Actualiser » : la liste se relit (`appRefresh.ts`). */
  const refresh = useAppRefresh();
  /** La soirée dont la liste a été lue au moins une fois. */
  const loadedEvent = useRef<string | null>(null);

  const source = useMemo(() => getPotluckSource(), []);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Écritures en vol, hors état React : `toggle` doit les lire de façon synchrone. */
  const inFlight = useRef<Set<string>>(new Set());

  const announce = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // --- Chargement initial --------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    source
      .list(eventId, controller.signal)
      .then((rows) => {
        if (!active || controller.signal.aborted) return;
        setItems(rows);
        setError(null);
        setLoadedFor(eventId);
        loadedEvent.current = eventId;
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        // Une relecture qui échoue garde la liste affichée.
        if (loadedEvent.current !== eventId) setError(describeError(cause));
        setLoadedFor(eventId);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [eventId, source, reloadToken, refresh]);

  const loading = loadedFor !== eventId;

  // --- Temps réel ----------------------------------------------------------

  useEffect(() => {
    const apply = (change: PotluckChange) => {
      setItems((current) => {
        if (change.type === 'DELETE') {
          return current.filter((item) => item.id !== change.item.id);
        }
        const index = current.findIndex((item) => item.id === change.item.id);
        if (index === -1) {
          return change.type === 'INSERT'
            ? [...current, change.item].sort((a, b) => a.position - b.position)
            : current;
        }
        const next = [...current];
        next[index] = change.item;
        return next;
      });
    };

    return source.subscribe(eventId, apply);
  }, [eventId, source]);

  // --- Écriture optimiste --------------------------------------------------

  const toggle = useCallback(
    (itemId: string) => {
      if (!currentUserId) return;
      // Un double-tap ne doit pas lancer deux écritures concurrentes sur la
      // même ligne : la seconde annulerait la première.
      if (inFlight.current.has(itemId)) return;

      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) return;

      const effectiveAssignee = pending.has(itemId)
        ? (pending.get(itemId) ?? null)
        : item.assignedUserId;

      // Ligne prise par un autre : aucun effet (README §6). Pas de message —
      // le design la présente déjà comme non disponible.
      if (effectiveAssignee !== null && effectiveAssignee !== currentUserId) return;

      const claiming = effectiveAssignee === null;
      const optimistic = claiming ? currentUserId : null;
      // Sa propre ligne « en plus » : ne plus l'apporter, c'est la retirer —
      // personne ne l'avait demandée, elle n'a pas à rester « à prendre ».
      const withdrawing = !claiming && item.addedBy === currentUserId;

      inFlight.current.add(itemId);
      setPending((current) => new Map(current).set(itemId, optimistic));

      const settle = (confirmed: string | null | undefined) => {
        inFlight.current.delete(itemId);
        // On écrit la valeur confirmée dans `items` **avant** de retirer
        // l'overlay : sans cela, l'UI clignote le temps que Realtime revienne.
        if (confirmed !== undefined) {
          setItems((current) =>
            current.map((candidate) =>
              candidate.id === itemId ? { ...candidate, assignedUserId: confirmed } : candidate,
            ),
          );
        }
        setPending((current) => {
          const next = new Map(current);
          next.delete(itemId);
          return next;
        });
      };

      if (withdrawing) {
        source
          .withdraw(itemId, currentUserId)
          .then(async (removed) => {
            if (removed) {
              setItems((current) => current.filter((candidate) => candidate.id !== itemId));
              settle(undefined);
              return;
            }
            // Pas retirée (base pas encore à jour) : on se libère, simplement.
            const applied = await source.release(itemId, currentUserId);
            settle(applied ? null : undefined);
          })
          .catch((cause: unknown) => {
            settle(undefined);
            announce(describeError(cause));
          });
        return;
      }

      const write = claiming
        ? source.claim(itemId, currentUserId)
        : source.release(itemId, currentUserId);

      write
        .then((applied) => {
          if (applied) {
            settle(optimistic);
            return;
          }
          // Zéro ligne affectée : la course est perdue. Ce n'est pas une
          // erreur, on ne connaît juste pas encore le gagnant — Realtime
          // l'apportera, on se contente de retirer l'écriture optimiste.
          settle(undefined);
          announce(
            claiming
              ? 'Un autre membre a pris ce besoin avant vous.'
              : 'Ce besoin ne vous est plus assigné.',
          );
        })
        .catch((cause: unknown) => {
          settle(undefined);
          announce(describeError(cause));
        });
    },
    [announce, currentUserId, items, pending, source],
  );

  // --- J'apporte aussi… -----------------------------------------------------

  const bring = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!currentUserId || trimmed.length === 0) return false;
      setBringing(true);
      try {
        const item = await source.bring(eventId, currentUserId, trimmed);
        // Le temps réel apportera la même ligne : on la place sans doublon.
        setItems((current) =>
          current.some((candidate) => candidate.id === item.id)
            ? current
            : [...current, item].sort((a, b) => a.position - b.position),
        );
        return true;
      } catch (cause) {
        announce(describeError(cause));
        return false;
      } finally {
        setBringing(false);
      }
    },
    [announce, currentUserId, eventId, source],
  );

  // --- Projection d'affichage ----------------------------------------------

  const rows = useMemo<PotluckRow[]>(
    () =>
      items.map((item) => {
        const isPending = pending.has(item.id);
        const assigneeId = isPending ? (pending.get(item.id) ?? null) : item.assignedUserId;
        const assignee = assigneeId ? (membersById.get(assigneeId) ?? null) : null;
        const isMine = assigneeId !== null && assigneeId === currentUserId;

        return {
          ...item,
          assignedUserId: assigneeId,
          assignee,
          isMine,
          isFree: assigneeId === null,
          isLocked: assigneeId !== null && !isMine,
          isPending,
        };
      }),
    [items, pending, membersById, currentUserId],
  );

  return {
    rows,
    loading,
    error,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    assignedCount: rows.filter((row) => !row.isFree).length,
    totalCount: rows.length,
    toggle,
    bring,
    bringing,
    reload: useCallback(() => {
      setLoadedFor(null);
      setError(null);
      setReloadToken((token) => token + 1);
    }, []),
  };
}
