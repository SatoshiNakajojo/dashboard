import { useEffect, useState } from 'react';

import { fetchBlockHeight, fetchBtcHistory, fetchBtcSpot } from '@/lib/coingecko';
import { MOCK_BTC_CHANGE_24H, MOCK_BTC_SPOT, MOCK_BLOCK_HEIGHT } from '@/mocks/calls';
import { seasonAt } from '@/lib/season';
import { MOCK_TODAY_INDEX, mockBtcSeries } from '@/mocks/oracle';
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
  points: MarketPoint[];
  /**
   * Index du jour courant dans la fenêtre de 90 jours.
   *
   * Il vient du **calendrier**, plus du dernier point reçu. Un jour où
   * CoinGecko ne répond pas ne doit pas faire reculer le curseur de la saison,
   * ni ramener la toile à un avenir qu'on aurait déjà consommé.
   */
  today: number;
  loading: boolean;
  stale: boolean;
}

/** Historique 90 jours pour la courbe réelle de l'Oracle. */
export function useBtcHistory(): BtcHistoryState {
  // Repli cohérent avec lui-même : la série de démonstration s'arrête à son
  // propre jour 34. Il est remplacé par le calendrier dès que CoinGecko répond,
  // et conservé tel quel s'il ne répond pas — une grille vide serait illisible.
  const [state, setState] = useState<BtcHistoryState>({
    points: mockBtcSeries(),
    today: MOCK_TODAY_INDEX,
    loading: true,
    stale: true,
  });

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const { points, stale } = await fetchBtcHistory(controller.signal);
        if (controller.signal.aborted || points.length === 0) return;
        setState({ points, today: seasonAt().day, loading: false, stale });
      } catch {
        // On conserve la série de repli : la grille seule serait illisible.
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, loading: false, stale: true }));
        }
      }
    })();

    return () => controller.abort();
  }, []);

  return state;
}
