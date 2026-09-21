import { Suspense, lazy } from 'react';
import { Text, View } from 'react-native';

import { ChartBoundary } from '@/components/ChartBoundary';
import { c, f } from '@/theme/tokens';
import type { OracleGraphProps } from './OracleGraph';

/**
 * Enveloppe de chargement de la toile de l'Oracle.
 *
 * Elle attendait autrefois que CanvasKit soit prêt : le graphe était peint par
 * Skia, et l'évaluer trop tôt liait `Skia` à une API non initialisée. Le graphe
 * est maintenant en SVG et n'attend plus rien.
 *
 * Le chargement différé reste, pour une autre raison : il garde le graphe hors
 * du bundle d'entrée. Qui n'ouvre jamais l'Oracle n'en télécharge pas une
 * ligne.
 */
const OracleGraph = lazy(() => import('./OracleGraph'));

/** Hauteur du repère logique, pour que le repli ne fasse pas sauter la mise en page. */
const RATIO = 285 / 360;

export function OracleCanvas(props: OracleGraphProps) {
  return (
    // La barrière enveloppe le `Suspense` : un échec de chargement du morceau
    // différé est un plantage comme un autre, et doit tomber sur le même repli.
    <ChartBoundary ratio={RATIO}>
      <Suspense fallback={<Placeholder message="Préparation du graphique…" />}>
        <OracleGraph {...props} />
      </Suspense>
    </ChartBoundary>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <View
      className="border-t border-b border-border"
      style={{ aspectRatio: 1 / RATIO, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.sepia }}>{message}</Text>
    </View>
  );
}
