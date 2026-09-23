import { useEffect, useState } from 'react';

import { fetchBlockHeight, fetchBtcSince, fetchBtcSpot } from '@/lib/coingecko';
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

/**
 * Cours spot pour le bandeau.
 *
 * N'expose jamais d'état d'erreur : une panne CoinGecko donne `stale: true`,
 * et le bandeau affiche `HORS LIGNE` à côté du dernier prix connu (README §6).
 */
export function useBtcSpot(): BtcSpotState {
  const [spot, setSpot] = useState<BtcSpot>(OFFLINE_SPOT);
  const [loading, setLoading] = useState(true);
  const [blockHeight, setBlockHeight] = useState<number | null>(MOCK_BLOCK_HEIGHT);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const next = await fetchBtcSpot(controller.signal);
        if (!controller.signal.aborted) setSpot(next);
      } catch {
        // Aucune valeur jamais mise en cache : on garde le repli hors ligne.
        if (!controller.signal.aborted) setSpot(OFFLINE_SPOT);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }

      const height = await fetchBlockHeight(controller.signal);
      if (!controller.signal.aborted) setBlockHeight(height);
    }

    void load();

    // Le TTL du cache est de 60 s : rafraîchir plus souvent ne sert à rien.
    const timer = setInterval(() => void load(), 60_000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return { spot, loading, blockHeight };
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
