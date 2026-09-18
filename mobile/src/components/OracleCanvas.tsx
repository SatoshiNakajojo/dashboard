import { Suspense, lazy } from 'react';
import { Text, View } from 'react-native';

import { useSkiaReady } from '@/lib/skiaWeb';
import { c, f } from '@/theme/tokens';
import type { OracleGraphProps } from './OracleGraph';

/**
 * Enveloppe de chargement de la toile de l'Oracle.
 *
 * `OracleGraph` importe `@shopify/react-native-skia` au niveau du module. Sur
 * le web, évaluer ce module **avant** que CanvasKit ne soit chargé lie `Skia` à
 * une API non initialisée : le premier tracé lève, et l'écran reste blanc.
 *
 * Le chargement différé règle l'ordre une fois pour toutes — le module n'est
 * évalué qu'une fois `useSkiaReady()` passé à vrai. Sur iOS et Android, Skia est
 * natif et prêt immédiatement : l'enveloppe est alors transparente.
 */
const OracleGraph = lazy(() => import('./OracleGraph'));

/** Hauteur du repère logique, pour que le repli ne fasse pas sauter la mise en page. */
const RATIO = 285 / 360;

export function OracleCanvas(props: OracleGraphProps) {
  const ready = useSkiaReady();

  if (!ready) return <Placeholder message="Préparation du graphique…" />;

  return (
    <Suspense fallback={<Placeholder message="Préparation du graphique…" />}>
      <OracleGraph {...props} />
    </Suspense>
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
