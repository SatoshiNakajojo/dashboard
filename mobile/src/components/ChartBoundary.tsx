import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { c, f } from '@/theme/tokens';

export interface ChartBoundaryProps {
  children: ReactNode;
  /** Hauteur du repli, pour que la mise en page ne saute pas. */
  ratio: number;
}

interface ChartBoundaryState {
  failed: boolean;
}

/**
 * Le graphe ne peut plus emporter l'écran avec lui.
 *
 * L'onglet Oracle « plantait » chez un membre : écran mort, aucune erreur
 * lisible. La cause était le moteur de rendu, remplacé depuis — mais la leçon
 * est ailleurs. Un graphe est le seul endroit de l'app où l'on peint des
 * données arbitraires, sur une pile de rendu qui n'est pas celle du reste, et
 * une exception y remontait jusqu'à la racine React, qui démonte tout.
 *
 * Une barrière ne répare rien. Elle garantit seulement que le pire cas est une
 * ligne de texte au lieu d'une app morte, et que les deux autres onglets
 * restent utilisables.
 *
 * C'est une classe : React ne donne pas d'équivalent en composant de fonction.
 */
export class ChartBoundary extends Component<ChartBoundaryProps, ChartBoundaryState> {
  override state: ChartBoundaryState = { failed: false };

  static getDerivedStateFromError(): ChartBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Pas de télémétrie dans un club de sept : la console suffit à qui ouvre
    // l'inspecteur, et rien ne part chez un tiers.
    console.error('Graphique indisponible :', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View
        className="border-t border-b border-border"
        style={{
          aspectRatio: 1 / this.props.ratio,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 30,
        }}
      >
        <Text
          style={{
            fontFamily: f.serifItalic,
            fontSize: 15,
            lineHeight: 22,
            color: c.sepia,
            textAlign: 'center',
          }}
        >
          Le graphique n’a pas pu s’afficher. Le reste de l’app fonctionne.
        </Text>
      </View>
    );
  }
}
