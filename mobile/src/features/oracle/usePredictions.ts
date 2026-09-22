import { useCallback, useEffect, useMemo, useState } from 'react';

import { accuracyPercent } from '@/lib/accuracy';
import { priceAt, samePath, x as dayToX, y as priceToY, type Point } from '@/lib/chart';
import { seasonAt } from '@/lib/season';
import { describeError, supabase } from '@/lib/supabase';
import {
  MOCK_HASH,
  MOCK_LOCK_DELAY_MS,
  MOCK_PREDICTIONS,
  MOCK_RESOLUTION_LABEL,
} from '@/mocks/oracle';
import type { MarketPoint, Member, Prediction, PredictionView } from '@/types/domain';

export interface PredictionsState {
  /** Prédictions des autres membres. */
  others: PredictionView[];
  /** Mon tracé courant, dans le repère logique. */
  myPoints: Point[];
  setMyPoints: (points: Point[]) => void;
  /** Écrit le tracé courant. Rien ne part avant qu'on le demande. */
  saveMine: () => void;
  /** Écriture en vol — le bouton s'en sert. */
  saving: boolean;
  /** Le tracé à l'écran diffère de celui qui est enregistré. */
  dirty: boolean;
  /** Efface **et** enregistre : l'appelant a déjà demandé confirmation. */
  clearMine: () => void;
  /** Ma justesse sur la portion écoulée. `null` tant qu'il n'y a rien à comparer. */
  myAccuracy: number | null;
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

/**
 * La saison en cours, pas celle du jeu de démonstration.
 *
 * `predictions` porte une contrainte `unique (user_id, season)` : tant que
 * cette valeur était figée, un membre ayant scellé son tracé ne pouvait plus
 * jamais en déposer un autre. La saison tourne désormais d'elle-même tous les
 * 90 jours, et chacun repart avec une toile vierge.
 */
const SEASON = seasonAt().code;

/** Commutateur « SIMULER T-0 ». Jamais actif dans une build livrée aux membres. */
const DEMO_LOCK_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_ORACLE_DEMO_LOCK === '1';
/**
 * Le tracé ne part plus tout seul.
 *
 * Il était enregistré 900 ms après le dernier point. Un membre qui relevait le
 * doigt pour réfléchir avait donc déjà déposé sa prédiction, sans l'avoir
 * décidé — et rien à l'écran ne le disait. Un pari se dépose sciemment : c'est
 * maintenant un bouton.
 */

export function usePredictions(
  currentUserId: string | null,
  membersById: Map<string, Member>,
  btcSeries: readonly MarketPoint[],
): PredictionsState {
  const [predictions, setPredictions] = useState<Prediction[]>(
    supabase ? [] : MOCK_PREDICTIONS,
  );
  const [myPoints, setMyPointsState] = useState<Point[]>([]);
  const [lockAt, setLockAt] = useState<number>(() => Date.now() + MOCK_LOCK_DELAY_MS);
  const [hash, setHash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  /** Ce qui est réellement enregistré, pour savoir ce qui ne l'est pas. */
  const [savedPoints, setSavedPoints] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);

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
        setSavedPoints(mine.pathData);
        setHash(mine.hash);
        if (mine.lockedAt) setLockAt(Date.parse(mine.lockedAt));
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, [currentUserId]);

  // --- Persistance du tracé -----------------------------------------------

  const persist = useCallback(
    async (points: Point[]) => {
      const client = supabase;
      if (!currentUserId) return;

      // Sans backend, « enregistré » veut quand même dire quelque chose : le
      // bouton doit s'éteindre, sinon on ne sait plus ce qui est déposé.
      if (!client) {
        setSavedPoints(points);
        return;
      }

      setSaving(true);
      const { error: cause } = await client.from('predictions').upsert(
        {
          user_id: currentUserId,
          season: SEASON,
          path_data: points as [number, number][],
        },
        { onConflict: 'user_id,season' },
      );
      setSaving(false);

      if (cause) {
        setError(describeError(cause));
        return;
      }
      setError(null);
      setSavedPoints(points);
    },
    [currentUserId],
  );

  const setMyPoints = useCallback(
    (points: Point[]) => {
      // Le verrou est vérifié ici **et** dans le geste : deux portes valent
      // mieux qu'une quand l'écriture est irréversible.
      if (locked) return;
      setMyPointsState(points);
    },
    [locked],
  );

  const saveMine = useCallback(() => {
    if (locked || saving) return;
    void persist(myPoints);
  }, [locked, saving, persist, myPoints]);

  /**
   * L'effacement, lui, part tout de suite.
   *
   * L'appelant a déjà demandé confirmation ; lui imposer ensuite un second
   * geste pour enregistrer le vide serait une porte de trop, et laisserait un
   * tracé déposé qu'on croit effacé.
   */
  const clearMine = useCallback(() => {
    if (locked) return;
    setMyPointsState([]);
    void persist([]);
  }, [locked, persist]);

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
          // La justesse se lit **dès** qu'une portion du cours recoupe le
          // tracé : attendre le verrouillage privait le club du seul chiffre
          // qui rend la superposition intéressante avant la résolution. Les
          // tracés sont déjà visibles à l'écran — rien de nouveau n'est
          // divulgué en les chiffrant.
          accuracyPercent: accuracyPercent(prediction.pathData, actualPath),
        };
      });
  }, [predictions, currentUserId, membersById, actualPath]);

  /** La mienne, calculée sur ce qui est à l'écran, pas sur ce qui est déposé. */
  const myAccuracy = useMemo(
    () => accuracyPercent(myPoints, actualPath),
    [myPoints, actualPath],
  );

  /**
   * Ce que j'ai à l'écran diffère de ce qui est enregistré.
   *
   * Comparé point à point : un tracé au doigt produit des dizaines de points,
   * et comparer les références échouerait au premier rechargement.
   */
  const dirty = useMemo(() => !samePath(myPoints, savedPoints), [myPoints, savedPoints]);

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
    saveMine,
    saving,
    dirty,
    clearMine,
    myAccuracy,
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
