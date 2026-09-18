import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { meanAbsoluteGap, priceAt, x as dayToX, y as priceToY, type Point } from '@/lib/chart';
import { describeError, supabase } from '@/lib/supabase';
import {
  MOCK_HASH,
  MOCK_LOCK_DELAY_MS,
  MOCK_PREDICTIONS,
  MOCK_SEASON,
  MOCK_RESOLUTION_LABEL,
} from '@/mocks/oracle';
import type { MarketPoint, Member, Prediction, PredictionView } from '@/types/domain';

export interface PredictionsState {
  /** Prédictions des autres membres. */
  others: PredictionView[];
  /** Mon tracé courant, dans le repère logique. */
  myPoints: Point[];
  setMyPoints: (points: Point[]) => void;
  clearMine: () => void;
  /** Vrai dès que `locked_at` est dépassé. */
  locked: boolean;
  /** Millisecondes avant verrouillage, décrémentées à la seconde. */
  remainingMs: number;
  resolutionLabel: string;
  hash: string | null;
  loading: boolean;
  error: string | null;
  /** Commutateur de démo — `undefined` hors développement. */
  simulateLock: (() => void) | undefined;
}

const SEASON = MOCK_SEASON;

/** Commutateur « SIMULER T-0 ». Jamais actif dans une build livrée aux membres. */
const DEMO_LOCK_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ORACLE_DEMO_LOCK === '1';
/** Délai avant persistance du tracé — un geste produit des dizaines de points. */
const SAVE_DEBOUNCE_MS = 900;

export function usePredictions(
  currentUserId: string | null,
  membersById: Map<string, Member>,
  btcSeries: readonly MarketPoint[],
): PredictionsState {
  const [predictions, setPredictions] = useState<Prediction[]>(supabase ? [] : MOCK_PREDICTIONS);
  const [myPoints, setMyPointsState] = useState<Point[]>([]);
  const [lockAt, setLockAt] = useState<number>(() => Date.now() + MOCK_LOCK_DELAY_MS);
  const [hash, setHash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Horloge du compte à rebours ----------------------------------------

  const locked = now >= lockAt;

  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [locked]);

  // --- Chargement ----------------------------------------------------------

  useEffect(() => {
    // `loading` part déjà à `false` sans backend : rien à faire ici.
    const client = supabase;
    if (!client) return;

    const controller = new AbortController();

    (async () => {
      const { data, error: cause } = await client
        .from('predictions')
        .select('id, user_id, season, path_data, locked_at, hash')
        .eq('season', SEASON)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (cause) {
        setError(describeError(cause));
        setLoading(false);
        return;
      }

      const rows: Prediction[] = (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        season: row.season,
        pathData: (row.path_data ?? []) as Point[],
        lockedAt: row.locked_at,
        hash: row.hash,
      }));

      setPredictions(rows);

      const mine = rows.find((row) => row.userId === currentUserId);
      if (mine) {
        setMyPointsState(mine.pathData);
        setHash(mine.hash);
        if (mine.lockedAt) setLockAt(Date.parse(mine.lockedAt));
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, [currentUserId]);

  // --- Persistance du tracé -----------------------------------------------

  const persist = useCallback(
    (points: Point[]) => {
      const client = supabase;
      if (!client || !currentUserId) return;

      void client
        .from('predictions')
        .upsert(
          {
            user_id: currentUserId,
            season: SEASON,
            path_data: points as [number, number][],
          },
          { onConflict: 'user_id,season' },
        )
        .then(({ error: cause }) => {
          if (cause) setError(describeError(cause));
        });
    },
    [currentUserId],
  );

  const setMyPoints = useCallback(
    (points: Point[]) => {
      // Le verrou est vérifié ici **et** dans le geste : deux portes valent
      // mieux qu'une quand l'écriture est irréversible.
      if (locked) return;
      setMyPointsState(points);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(points), SAVE_DEBOUNCE_MS);
    },
    [locked, persist],
  );

  const clearMine = useCallback(() => {
    if (locked) return;
    setMyPointsState([]);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist([]), SAVE_DEBOUNCE_MS);
  }, [locked, persist]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // --- Projection d'affichage ----------------------------------------------

  const actualPath = useMemo<Point[]>(
    () => btcSeries.map(({ day, price }) => [dayToX(day), priceToY(price)] as Point),
    [btcSeries],
  );

  const others = useMemo<PredictionView[]>(() => {
    return predictions
      .filter((prediction) => prediction.userId !== currentUserId)
      .map((prediction) => {
        const author = membersById.get(prediction.userId);
        const lastPoint = prediction.pathData[prediction.pathData.length - 1];

        return {
          ...prediction,
          author: author ?? {
            id: prediction.userId,
            displayName: 'Membre',
            initials: '··',
            color: '#8C7F68',
          },
          targetPrice: lastPoint ? priceAt(lastPoint[1]) : 0,
          // L'écart n'a de sens qu'une fois les prédictions figées.
          gapPercent: locked ? meanAbsoluteGap(prediction.pathData, actualPath) : null,
        };
      });
  }, [predictions, currentUserId, membersById, locked, actualPath]);

  /** Bascule verrouillé ↔ ouvert, pour montrer les deux états sans attendre. */
  const simulateLock = useCallback(() => {
    const instant = Date.now();
    setLockAt((current) => (instant >= current ? instant + MOCK_LOCK_DELAY_MS : instant));
    setNow(instant);
    setHash((current) => (current ? null : MOCK_HASH));
  }, []);

  return {
    others,
    myPoints,
    setMyPoints,
    clearMine,
    locked,
    remainingMs: Math.max(0, lockAt - now),
    resolutionLabel: MOCK_RESOLUTION_LABEL,
    hash,
    loading,
    error,
    // Le commutateur de démo n'existe qu'en développement, ou dans une build
    // de recette qui le demande explicitement (README §5.4) : un membre ne doit
    // jamais pouvoir sceller sa prédiction par mégarde.
    simulateLock: DEMO_LOCK_ENABLED ? simulateLock : undefined,
  };
}
