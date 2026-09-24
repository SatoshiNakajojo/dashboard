import { useEffect, useState, useSyncExternalStore } from 'react';

import { fetchBlockHeight, fetchBtcSince, fetchBtcSpot } from '@/lib/coingecko';
import { isOffline } from '@/lib/spotFreshness';
import { MOCK_BTC_CHANGE_24H, MOCK_BTC_SPOT, MOCK_BLOCK_HEIGHT } from '@/mocks/calls';
import { mockBtcSince } from '@/mocks/oracle';
import type { BtcSpot, MarketPoint } from '@/types/domain';

/** Repli hors ligne du bandeau : le dernier prix connu, marqué périmé. */
const OFFLINE_SPOT: BtcSpot = {
  usd: MOCK_BTC_SPOT,
  change24h: MOCK_BTC_CHANGE_24H,
  fetchedAt: 0,
  stale: true,
};

export interface BtcSpotState {
  spot: BtcSpot;
  loading: boolean;
  blockHeight: number | null;
}

/** Le TTL du cache est de 60 s : rafraîchir plus souvent ne sert à rien. */
const REFRESH_MS = 60_000;

/**
 * Le cours BTC, **une seule fois** pour toute l'app.
 *
 * Chaque bandeau — un par onglet — avait son propre `useBtcSpot`, et les calls
 * et l'Oracle aussi : six abonnements, six requêtes par minute. CoinGecko en
 * refusait une partie, et l'onglet refusé affichait `HORS LIGNE` pendant que
 * son voisin montrait la variation du jour. Désormais un seul relevé, une
 * seule minuterie, et tous les écrans lisent la même valeur.
 */
let current: BtcSpotState = { spot: OFFLINE_SPOT, loading: true, blockHeight: MOCK_BLOCK_HEIGHT };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let refreshing: Promise<void> | null = null;

function publish(next: BtcSpotState) {
  current = next;
  for (const listener of listeners) listener();
}

function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    let spot = current.spot;
    try {
      const fetched = await fetchBtcSpot();
      spot = fetched;
    } catch {
      // Aucune valeur jamais mise en cache : on garde ce qu'on a.
    }
    // `HORS LIGNE` seulement après plusieurs minutes sans réponse : un refus
    // ponctuel de CoinGecko n'est pas une panne (`spotFreshness.ts`).
    spot = { ...spot, stale: isOffline(spot.fetchedAt, Date.now()) };

    const height = await fetchBlockHeight().catch(() => null);
    publish({
      spot,
      loading: false,
      blockHeight: height ?? current.blockHeight,
    });
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => current;

/**
 * Cours spot pour le bandeau.
 *
 * N'expose jamais d'état d'erreur : une panne durable donne `stale: true`, et
 * le bandeau affiche `HORS LIGNE` à côté du dernier prix connu (README §6).
 */
export function useBtcSpot(): BtcSpotState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export interface BtcHistoryState {
  /**
   * L'origine réellement employée : celle demandée, arrondie à l'heure. Les
   * jours de `points` se comptent depuis **elle** — les recaler sur l'origine
   * demandée décalerait la courbe de près d'une heure.
   */
  origin: number | null;
  /** `day` = jours écoulés depuis `origin`. */
  points: MarketPoint[];
  loading: boolean;
  stale: boolean;
  /**
   * La série est celle de démonstration, pas le vrai cours.
   *
   * Sans backend, c'est le mode démo et elle a toute sa place. Avec un
   * backend, elle ne doit jamais passer pour le cours réel : on jugerait des
   * paris sur une courbe inventée.
   */
  simulated: boolean;
}

const IDLE: BtcHistoryState = {
  origin: null,
  points: [],
  loading: false,
  stale: false,
  simulated: false,
};

/**
 * Le cours du bitcoin depuis une origine donnée — celle du repère affiché.
 *
 * L'origine est arrondie à l'heure avant de servir de dépendance : elle vient
 * d'un calcul sur des instants, et une milliseconde de différence entre deux
 * rendus relancerait sinon la requête à chaque fois.
 *
 * `null` : rien à charger. Un hook ne s'appelle pas sous condition, d'où cette
 * valeur plutôt qu'un appel omis.
 *
 * Sans réponse de CoinGecko, on sert la série de démonstration, marquée
 * `simulated` — c'est à l'appelant de décider s'il peut s'en servir.
 */
export function useBtcSince(originMs: number | null): BtcHistoryState {
  const hour = originMs === null ? null : Math.floor(originMs / 3_600_000) * 3_600_000;

  const [state, setState] = useState<BtcHistoryState>(() => ({
    origin: hour,
    points: hour === null ? [] : mockBtcSince(hour),
    loading: hour !== null,
    stale: true,
    simulated: hour !== null,
  }));

  useEffect(() => {
    if (hour === null) return;
    const controller = new AbortController();

    (async () => {
      try {
        const { points, stale } = await fetchBtcSince(hour, controller.signal);
        if (controller.signal.aborted) return;
        if (points.length === 0) throw new Error('Série vide');
        setState({ origin: hour, points, loading: false, stale, simulated: false });
      } catch {
        if (controller.signal.aborted) return;
        setState({
          origin: hour,
          points: mockBtcSince(hour),
          loading: false,
          stale: true,
          simulated: true,
        });
      }
    })();

    return () => controller.abort();
  }, [hour]);

  if (hour === null) return IDLE;

  // Tant que la réponse pour la nouvelle origine n'est pas arrivée, l'ancienne
  // série est fausse — elle compte ses jours depuis une autre origine. On sert
  // la série de démonstration recalée plutôt qu'une courbe décalée.
  if (state.origin !== hour) {
    return {
      origin: hour,
      points: mockBtcSince(hour),
      loading: true,
      stale: true,
      simulated: true,
    };
  }
  return state;
}
