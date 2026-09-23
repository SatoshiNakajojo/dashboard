import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import {
  Gesture,
  GestureDetector,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

import {
  BASELINE_Y,
  DRAW_BOUNDS,
  H,
  MIN_X_STEP,
  PAD,
  W,
  appendDrawPoint,
  clampToCanvas,
  compactPrice,
  priceTicks,
  toAreaPath,
  toCanvas,
  toPrices,
  toSvgPath,
  x as dayToX,
  y as priceToY,
  type DrawBounds,
  type Frame,
  type Point,
  type PricePoint,
} from '@/lib/chart';
import type { TimeTick } from '@/lib/calendarTicks';
import { a, c, f } from '@/theme/tokens';

type PanEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;

export interface OracleCurve {
  id: string;
  color: string;
  /** En `[jour depuis l'origine du repère, prix]`. */
  path: readonly PricePoint[];
  /** Pointillés — la courbe de Marco dans le design de référence. */
  dashed?: boolean;
}

export interface OracleGraphProps {
  /** Le domaine affiché : durée de la fenêtre et bande de prix. */
  frame: Frame;
  /** Cours réel, en `[jour depuis l'origine, prix]`. */
  btc: readonly PricePoint[];
  /** Position de maintenant, en jours depuis l'origine. */
  today: number;
  /** Graduations de l'axe des temps. */
  timeTicks: readonly TimeTick[];
  /** Paris des autres membres. */
  curves: readonly OracleCurve[];
  showOthers: boolean;
  /** Mon tracé, en `[jour depuis l'origine, prix]`. */
  path: readonly PricePoint[];
  /** Couleur du tracé de l'utilisateur courant. */
  color: string;
  /**
   * Où le doigt peut tracer, en jours depuis l'origine. `null` : lecture
   * seule — pari verrouillé, ou personne de connecté.
   */
  drawRange: { from: number; to: number } | null;
  /** Mon pari est scellé : le trait passe en plein. */
  sealed: boolean;
  /** Invite affichée tant qu'il n'y a pas de tracé. `null` : aucune. */
  hint: string | null;
  onPathChange: (path: PricePoint[]) => void;
  /**
   * Toucher la toile alors qu'un tracé existe : on ne l'efface pas, on
   * demande. L'écran ouvre sa fenêtre de confirmation, et vide le tracé si le
   * membre le veut — le geste suivant dessine alors sur une toile vierge.
   */
  onRequestRedraw: () => void;
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
 * Trois invariants tiennent tout le composant :
 *
 *   1. **Un seul facteur d'échelle.** Le repère logique 360 × 285 est peint
 *      tel quel dans un `Group` mis à l'échelle. Rien ne re-dérive une
 *      géométrie en pixels.
 *
 *   2. **Des prix en entrée, des prix en sortie.** Les courbes arrivent en
 *      `[jour, prix]` et le tracé repart en `[jour, prix]`. Les coordonnées de
 *      toile n'existent qu'ici : c'est ce qui permet à deux membres de voir
 *      des bandes de prix différentes sans que leurs courbes se décalent.
 *
 *   3. **Le verrou est une porte, pas un style.** Sans `drawRange`, le geste
 *      est coupé à la source : il n'existe aucun chemin de code qui modifie un
 *      pari scellé. Et avec, le doigt est borné à partir d'aujourd'hui — on ne
 *      trace pas le passé.
 *
 * Les étiquettes d'axes sont rendues en `<Text>` RN par-dessus la toile,
 * plutôt qu'en `<Text>` SVG : la typographie reste strictement celle du reste
 * de l'app, sans seconde pile de rendu de texte.
 */
export function OracleGraph({
  frame,
  btc,
  today,
  timeTicks,
  curves,
  showOthers,
  path,
  color,
  drawRange,
  sealed,
  hint,
  onPathChange,
  onRequestRedraw,
}: OracleGraphProps) {
  const [width, setWidth] = useState(0);
  const scale = width > 0 ? width / W : 0;
  const height = scale * H;

  /**
   * Le tracé en cours vit dans une ref, en coordonnées de toile.
   *
   * Un geste produit jusqu'à 80 points : relire la prop `path` depuis la
   * closure du handler donnerait une valeur périmée d'une frame, et
   * reconstruire le geste à chaque point risquerait d'interrompre le geste en
   * cours. La ref n'est lue que dans les handlers, jamais pendant le rendu.
   */
  const draft = useRef<Point[]>([]);

  /** Où le doigt peut aller, en coordonnées de toile. */
  const bounds = useMemo<DrawBounds | null>(
    () =>
      drawRange
        ? {
            ...DRAW_BOUNDS,
            minX: Math.max(DRAW_BOUNDS.minX, dayToX(drawRange.from, frame)),
            maxX: Math.min(DRAW_BOUNDS.maxX, dayToX(drawRange.to, frame)),
          }
        : null,
    [drawRange, frame],
  );

  /**
   * Ce que les handlers lisent au moment du geste.
   *
   * Le repère glisse d'une minute à l'autre (le trait « aujourd'hui »
   * avance) : recomposer le geste à chaque fois pourrait couper un tracé en
   * cours. Les handlers lisent donc la dernière valeur par une ref, mise à
   * jour après chaque rendu.
   */
  const hasPath = path.length > 1;
  const live = useRef({ bounds, frame, onPathChange, onRequestRedraw, scale, hasPath });
  useEffect(() => {
    live.current = { bounds, frame, onPathChange, onRequestRedraw, scale, hasPath };
  }, [bounds, frame, onPathChange, onRequestRedraw, scale, hasPath]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // --- Geste de tracé ------------------------------------------------------

  const beginStroke = useCallback((event: PanEvent) => {
    const { bounds: b, scale: k, hasPath: drawn, onRequestRedraw: ask } = live.current;
    if (!b || !(k > 0)) return;
    // Un tracé est déjà là : le toucher ne l'efface pas, il demande. Le reste
    // du geste est ignoré — `draft` vide, `extendStroke` ne fait rien.
    if (drawn) {
      draft.current = [];
      ask();
      return;
    }
    draft.current = [clampToCanvas(event.x / k, event.y / k, b)];
  }, []);

  const extendStroke = useCallback((event: PanEvent) => {
    const { bounds: b, frame: current, onPathChange: emit, scale: k } = live.current;
    if (!b || !(k > 0) || draft.current.length === 0) return;
    const next = appendDrawPoint(draft.current, clampToCanvas(event.x / k, event.y / k, b));
    // `null` = le point est trop proche du précédent en X. On l'ignore :
    // c'est la règle de monotonie du design, pas une optimisation.
    if (!next) return;
    draft.current = next;
    emit(toPrices(next, current));
  }, []);

  const drawable = bounds !== null && bounds.maxX > bounds.minX;

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Les handlers touchent l'état React : on reste sur le thread JS
        // plutôt que d'ouvrir un pont worklet pour un tracé au doigt.
        .runOnJS(true)
        // Le verrou coupe le geste à la source — aucun chemin de code ne
        // modifie un pari scellé.
        .enabled(drawable && scale > 0)
        // Un tracé commence au premier contact, sans seuil de déplacement.
        .minDistance(0)
        // `react-hooks/refs` signale ces deux lignes : la composition du geste
        // a lieu au rendu et les handlers lisent des refs. L'analyse est
        // conservatrice — un handler de geste ne s'exécute jamais pendant le
        // rendu. L'alternative (recomposer le geste à chaque point capturé)
        // interromprait le tracé en cours ; on préfère la suppression ciblée.
        // eslint-disable-next-line react-hooks/refs
        .onBegin(beginStroke)
        // eslint-disable-next-line react-hooks/refs
        .onUpdate(extendStroke),
    [beginStroke, extendStroke, drawable, scale],
  );

  // --- Chemins -------------------------------------------------------------

  const btcPoints = useMemo(() => toCanvas(btc, frame), [btc, frame]);
  const btcPath = useMemo(() => toSvgPath(btcPoints), [btcPoints]);
  const btcArea = useMemo(() => toAreaPath(btcPoints), [btcPoints]);
  const myPath = useMemo(
    () => (path.length > 1 ? toSvgPath(toCanvas(path, frame)) : ''),
    [path, frame],
  );

  const yTicks = useMemo(() => priceTicks(frame), [frame]);
  const gridPath = useMemo(
    () =>
      yTicks
        .map((price) => {
          const gy = priceToY(price, frame).toFixed(1);
          return `M ${PAD.l} ${gy} L ${W - PAD.r} ${gy}`;
        })
        .join(' '),
    [yTicks, frame],
  );

  const todayX = dayToX(today, frame);
  const todayPath = `M ${todayX.toFixed(1)} ${PAD.t} L ${todayX.toFixed(1)} ${BASELINE_Y}`;

  const last = btcPoints[btcPoints.length - 1];
  /** Assez de place à droite d'aujourd'hui pour y poser l'invite. */
  const futureRoom = W - PAD.r - todayX >= 150;

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
                drawable
                  ? 'Toile de prédiction — tracez votre courbe au doigt, à partir d’aujourd’hui'
                  : 'Paris du club, lecture seule'
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

                  {/* 2 — le passé, légèrement voilé : on ne trace qu'à partir d'aujourd'hui */}
                  {todayX > PAD.l ? (
                    <Rect
                      x={PAD.l}
                      y={PAD.t}
                      width={Math.min(todayX, W - PAD.r) - PAD.l}
                      height={BASELINE_Y - PAD.t}
                      fill={c.surfaceDeep}
                      opacity={0.35}
                    />
                  ) : null}

                  {/* 4 — courbes des autres membres, sous la courbe réelle */}
                  {showOthers
                    ? curves.map((curve) => (
                        <MemberCurve key={curve.id} curve={curve} frame={frame} />
                      ))
                    : null}

                  {/* 5 — ligne « aujourd'hui » */}
                  <Path
                    d={todayPath}
                    stroke={c.borderSheet}
                    strokeWidth={1}
                    strokeDasharray="2,5"
                    fill="none"
                  />

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
                      strokeDasharray={sealed ? undefined : '5,5'}
                      fill="none"
                    />
                  ) : null}
                </G>
              </Svg>

              <AxisLabels scale={scale} frame={frame} yTicks={yTicks} timeTicks={timeTicks} />

              {hasPath || !hint ? null : (
                // En haut de la zone à venir : au centre, l'invite passait
                // par-dessus le cours et les courbes du club.
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: (PAD.t + 14) * scale,
                    left: (futureRoom ? todayX + 8 : PAD.l) * scale,
                    right: PAD.r * scale,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: f.serifItalic,
                      fontSize: 14,
                      lineHeight: 19,
                      color: c.sepia,
                      textAlign: 'center',
                      paddingHorizontal: 8,
                    }}
                  >
                    {hint}
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

function MemberCurve({ curve, frame }: { curve: OracleCurve; frame: Frame }) {
  const d = curve.path.length > 1 ? toSvgPath(toCanvas(curve.path, frame)) : '';
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

/** Largeur réservée à une étiquette de date, en unités du repère. */
const TICK_BOX = 40;

/**
 * Étiquettes d'axes, positionnées dans le repère logique puis mises à
 * l'échelle — donc alignées au pixel près sur la grille peinte en SVG.
 */
function AxisLabels({
  scale,
  frame,
  yTicks,
  timeTicks,
}: {
  scale: number;
  frame: Frame;
  yTicks: readonly number[];
  timeTicks: readonly TimeTick[];
}) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {yTicks.map((price) => (
        <Text
          key={price}
          style={{
            position: 'absolute',
            left: 2 * scale,
            // `y(p) + 3` place la ligne de base du texte sur la graduation ;
            // en RN on positionne le haut de la boîte, d'où le retrait.
            top: (priceToY(price, frame) + 3 - 8) * scale,
            fontFamily: f.label,
            fontSize: 8 * scale,
            letterSpacing: 0.4 * scale,
            color: c.sepiaFaint,
          }}
        >
          {compactPrice(price)}
        </Text>
      ))}

      {timeTicks.map(({ label, day }) => {
        // Centrée sur sa date, mais jamais coupée par les bords de la toile.
        const center = dayToX(day, frame);
        const left = Math.min(W - TICK_BOX, Math.max(PAD.l - 4, center - TICK_BOX / 2));
        return (
          <Text
            key={`${label}-${day}`}
            style={{
              position: 'absolute',
              left: left * scale,
              width: TICK_BOX * scale,
              textAlign: 'center',
              top: (268 - 8) * scale,
              fontFamily: f.label,
              fontSize: 8 * scale,
              letterSpacing: 1.12 * scale,
              color: c.sepiaFaint,
            }}
          >
            {label}
          </Text>
        );
      })}
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
