import { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  Gesture,
  GestureDetector,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

import {
  BASELINE_Y,
  H,
  MIN_X_STEP,
  PAD,
  W,
  X_TICKS,
  Y_TICKS,
  appendDrawPoint,
  clampToCanvas,
  toAreaPath,
  toSvgPath,
  x as dayToX,
  y as priceToY,
  type Point,
} from '@/lib/chart';
import { a, c, f } from '@/theme/tokens';
import type { MarketPoint } from '@/types/domain';

type PanEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;

export interface OracleCurve {
  id: string;
  color: string;
  points: readonly Point[];
  /** Pointillés — la courbe de Marco dans le design de référence. */
  dashed?: boolean;
}

export interface OracleGraphProps {
  /** Courbe BTC réelle (CoinGecko), en `{ jour, prix }`. */
  btcSeries: readonly MarketPoint[];
  /** Index du jour courant — position du point « aujourd'hui ». */
  todayIndex: number;
  /** Prédictions des autres membres. */
  curves: readonly OracleCurve[];
  showOthers: boolean;
  /** Ma prédiction, dans le repère logique 360 × 285. */
  points: readonly Point[];
  /** Couleur du tracé de l'utilisateur courant. */
  color: string;
  /**
   * Time-lock. `true` ⇒ le geste est désactivé et le trait passe en plein.
   * L'état vient de `predictions.locked_at`, pas d'un booléen d'UI.
   */
  locked: boolean;
  onPointsChange: (points: Point[]) => void;
}

/**
 * Toile de l'Oracle — SVG.
 *
 * Elle était peinte par Skia, donc par CanvasKit sur le web : 7,7 Mo de
 * WebAssembly téléchargés **à chaque démarrage**, même pour qui n'ouvre jamais
 * cet onglet, et un contexte WebGL plein écran. Dans une PWA autonome iOS, ce
 * budget mémoire est le genre de chose qui fait tuer la page par le système —
 * l'onglet « plantait » sans qu'aucune erreur ne soit levée.
 *
 * `src/lib/chart.ts` produisait déjà des chaînes de chemin SVG, que Skia
 * recompilait ensuite en `SkPath`. Les passer directement à `react-native-svg`
 * retire une conversion, 7,7 Mo de binaire, et le risque avec.
 *
 * Deux invariants tiennent tout le composant :
 *
 *   1. **Un seul facteur d'échelle.** Le repère logique 360 × 285 est peint
 *      tel quel dans un `Group` mis à l'échelle. Rien ne re-dérive une
 *      géométrie en pixels, sinon `path_data` deviendrait dépendant du device
 *      et deux membres ne pourraient plus superposer leurs courbes.
 *
 *   2. **Le verrou est une porte, pas un style.** `locked` coupe le geste à la
 *      source : il n'existe aucun chemin de code qui modifie le tracé quand la
 *      prédiction est scellée.
 *
 * Les étiquettes d'axes sont rendues en `<Text>` RN par-dessus la toile,
 * plutôt qu'en `<Text>` SVG : la typographie reste strictement celle du reste
 * de l'app, sans seconde pile de rendu de texte.
 */
export function OracleGraph({
  btcSeries,
  todayIndex,
  curves,
  showOthers,
  points,
  color,
  locked,
  onPointsChange,
}: OracleGraphProps) {
  const [width, setWidth] = useState(0);
  const scale = width > 0 ? width / W : 0;
  const height = scale * H;

  /**
   * Le tracé en cours vit dans une ref.
   *
   * Un geste produit jusqu'à 80 points : relire la prop `points` depuis la
   * closure du handler donnerait une valeur périmée d'une frame, et
   * reconstruire le geste à chaque point risquerait d'interrompre le geste en
   * cours. La ref n'est lue que dans les handlers, jamais pendant le rendu.
   */
  const draft = useRef<Point[]>([]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // --- Geste de tracé ------------------------------------------------------

  const toLogical = useCallback(
    (px: number, py: number): Point => clampToCanvas(px / scale, py / scale),
    [scale],
  );

  const beginStroke = useCallback(
    (event: PanEvent) => {
      draft.current = [toLogical(event.x, event.y)];
      onPointsChange(draft.current);
    },
    [onPointsChange, toLogical],
  );

  const extendStroke = useCallback(
    (event: PanEvent) => {
      const next = appendDrawPoint(draft.current, toLogical(event.x, event.y));
      // `null` = le point est trop proche du précédent en X. On l'ignore :
      // c'est la règle de monotonie du design, pas une optimisation.
      if (!next) return;
      draft.current = next;
      onPointsChange(next);
    },
    [onPointsChange, toLogical],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Les handlers touchent l'état React : on reste sur le thread JS
        // plutôt que d'ouvrir un pont worklet pour un tracé au doigt.
        .runOnJS(true)
        // Le verrou coupe le geste à la source — aucun chemin de code ne
        // modifie une prédiction scellée.
        .enabled(!locked && scale > 0)
        // Un tracé commence au premier contact, sans seuil de déplacement.
        .minDistance(0)
        // `react-hooks/refs` signale ces deux lignes : la composition du geste
        // a lieu au rendu et les handlers lisent `draft`. L'analyse est
        // conservatrice — un handler de geste ne s'exécute jamais pendant le
        // rendu. L'alternative (recomposer le geste à chaque point capturé)
        // interromprait le tracé en cours ; on préfère la suppression ciblée.
        // eslint-disable-next-line react-hooks/refs
        .onBegin(beginStroke)
        // eslint-disable-next-line react-hooks/refs
        .onUpdate(extendStroke),
    [beginStroke, extendStroke, locked, scale],
  );

  // --- Chemins -------------------------------------------------------------
  //
  // Ce sont les chaînes SVG de `chart.ts`, passées telles quelles : plus de
  // compilation en `SkPath`, donc plus rien à initialiser avant de peindre.

  const btcPoints = useMemo<Point[]>(
    () => btcSeries.map(({ day, price }) => [dayToX(day), priceToY(price)] as Point),
    [btcSeries],
  );

  const btcPath = useMemo(() => toSvgPath(btcPoints), [btcPoints]);
  const btcArea = useMemo(() => toAreaPath(btcPoints), [btcPoints]);
  const myPath = useMemo(() => (points.length > 1 ? toSvgPath(points) : ''), [points]);

  const gridPath = useMemo(
    () =>
      Y_TICKS.map((price) => {
        const gy = priceToY(price).toFixed(1);
        return `M ${PAD.l} ${gy} L ${W - PAD.r} ${gy}`;
      }).join(' '),
    [],
  );

  const todayPath = useMemo(() => {
    const tx = dayToX(todayIndex).toFixed(1);
    return `M ${tx} ${PAD.t} L ${tx} ${BASELINE_Y}`;
  }, [todayIndex]);

  const last = btcPoints[btcPoints.length - 1];
  const hasDrawing = points.length > 1;

  return (
    <View>
      <View
        onLayout={onLayout}
        className="border-t border-b border-border"
        style={{ height: height || undefined, minHeight: height ? undefined : 200 }}
      >
        {scale > 0 ? (
          <GestureDetector gesture={gesture}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel={
                locked
                  ? 'Prédiction verrouillée, lecture seule'
                  : 'Toile de prédiction — tracez votre courbe au doigt'
              }
              style={{ width, height }}
            >
              {/* `pointerEvents="none"` : la toile est décorative, le doigt
                  doit atteindre la vue du geste qui l'enveloppe. */}
              <Svg width={width} height={height} pointerEvents="none">
                <Defs>
                  <LinearGradient
                    id="btcFill"
                    // En coordonnées du repère logique, pas en fraction de la
                    // boîte : l'aire doit s'éteindre sur la ligne de base, pas
                    // sur le bas du chemin, qui change avec les données.
                    gradientUnits="userSpaceOnUse"
                    x1={0}
                    y1={PAD.t}
                    x2={0}
                    y2={BASELINE_Y}
                  >
                    <Stop
                      offset="0"
                      stopColor={a.btcFillColor}
                      stopOpacity={a.btcFillTopOpacity}
                    />
                    <Stop
                      offset="1"
                      stopColor={a.btcFillColor}
                      stopOpacity={a.btcFillBottomOpacity}
                    />
                  </LinearGradient>
                </Defs>

                <G scale={scale}>
                  {/* 1 — grille horizontale */}
                  {gridPath ? (
                    <Path d={gridPath} stroke={c.grid} strokeWidth={1} fill="none" />
                  ) : null}

                  {/* 4 — courbes des autres membres, sous la courbe réelle */}
                  {showOthers
                    ? curves.map((curve) => <MemberCurve key={curve.id} curve={curve} />)
                    : null}

                  {/* 5 — ligne « aujourd'hui » */}
                  {todayPath ? (
                    <Path
                      d={todayPath}
                      stroke={c.borderSheet}
                      strokeWidth={1}
                      strokeDasharray="2,5"
                      fill="none"
                    />
                  ) : null}

                  {/* 6 — aire dégradée sous la courbe BTC */}
                  {btcArea ? <Path d={btcArea} fill="url(#btcFill)" /> : null}

                  {/* 7 — halo puis 8 — trait net : la courbe réelle en deux passes */}
                  {btcPath ? (
                    <>
                      <Path
                        d={btcPath}
                        stroke={a.btcHalo}
                        strokeWidth={3.6}
                        strokeLinecap="round"
                        fill="none"
                      />
                      <Path
                        d={btcPath}
                        stroke={c.goldLight}
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </>
                  ) : null}

                  {/* 9 — point « aujourd'hui » */}
                  {last ? (
                    <>
                      <Circle cx={last[0]} cy={last[1]} r={5} fill={a.nowHalo} />
                      <Circle cx={last[0]} cy={last[1]} r={2.2} fill={c.goldTint} />
                    </>
                  ) : null}

                  {/* 10 — ma courbe : pointillés tant qu'elle est modifiable */}
                  {myPath ? (
                    <Path
                      d={myPath}
                      stroke={color}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={locked ? undefined : '5,5'}
                      fill="none"
                    />
                  ) : null}
                </G>
              </Svg>

              <AxisLabels scale={scale} />

              {hasDrawing ? null : (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.sepia }}>
                    {locked ? 'Aucune prédiction déposée' : 'Tracez votre prédiction au doigt'}
                  </Text>
                </View>
              )}
            </View>
          </GestureDetector>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function MemberCurve({ curve }: { curve: OracleCurve }) {
  const d = curve.points.length > 1 ? toSvgPath(curve.points) : '';
  if (!d) return null;

  return (
    <Path
      d={d}
      stroke={curve.color}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeDasharray={curve.dashed ? '4,4' : undefined}
      opacity={0.5}
      fill="none"
    />
  );
}

/**
 * Étiquettes d'axes, positionnées dans le repère logique puis mises à
 * l'échelle — donc alignées au pixel près sur la grille peinte en SVG.
 */
function AxisLabels({ scale }: { scale: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {Y_TICKS.map((price) => (
        <Text
          key={price}
          style={{
            position: 'absolute',
            left: 2 * scale,
            // `y(p) + 3` place la ligne de base du texte sur la graduation ;
            // en RN on positionne le haut de la boîte, d'où le retrait.
            top: (priceToY(price) + 3 - 8) * scale,
            fontFamily: f.mono,
            fontSize: 8 * scale,
            letterSpacing: 0.4 * scale,
            color: c.sepiaFaint,
          }}
        >
          {price / 1000}k
        </Text>
      ))}

      {X_TICKS.map(({ label, day }) => (
        <Text
          key={label}
          style={{
            position: 'absolute',
            left: (dayToX(day) - 2) * scale,
            top: (268 - 8) * scale,
            fontFamily: f.mono,
            fontSize: 8 * scale,
            letterSpacing: 1.12 * scale,
            color: c.sepiaFaint,
          }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

/** Ré-exporté pour les tests et les écrans : la règle de capture du tracé. */
export { MIN_X_STEP };

/**
 * Export par défaut pour `React.lazy` — voir `OracleCanvas.tsx`. Le chargement
 * différé ne sert plus à attendre un moteur, seulement à garder le graphe hors
 * du bundle d'entrée : on ne paie ses kilo-octets qu'en ouvrant l'onglet.
 */
export default OracleGraph;
