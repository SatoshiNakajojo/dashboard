/**
 * Le clavier du téléphone, vu de la page — la partie pure de
 * `hooks/useKeyboardFrame.ts`, testable sans React Native.
 */

import type { ViewStyle } from 'react-native';

export interface KeyboardState {
  open: boolean;
  /** Haut de la zone visible, dans la page (iOS peut la faire glisser). */
  top: number;
  /** Hauteur visible au-dessus du clavier. */
  height: number;
}

export const CLOSED: KeyboardState = { open: false, top: 0, height: 0 };

/**
 * En deçà, ce n'est pas un clavier : une barre d'outils qui se replie, un
 * zoom. Le plus petit clavier de téléphone dépasse largement 150 px.
 */
const KEYBOARD_MIN_PX = 150;

/** Pur : la page, la zone visible → l'état du clavier. */
export function keyboardState(
  layoutHeight: number,
  visibleHeight: number,
  visibleTop: number,
): KeyboardState {
  const covered = layoutHeight - visibleHeight;
  if (!(covered > KEYBOARD_MIN_PX) || !(visibleHeight > 0)) return CLOSED;
  return {
    open: true,
    top: Math.max(0, Math.round(visibleTop)),
    height: Math.round(visibleHeight),
  };
}

/** Marge entre la feuille et les bords de la zone visible. */
const GAP = 6;

/** Les styles à poser sur le cadre de la feuille, et sur la feuille elle-même. */
export function keyboardFrameStyles(state: KeyboardState): {
  frame: ViewStyle;
  sheet: ViewStyle;
} {
  if (!state.open) {
    return { frame: { justifyContent: 'flex-end' }, sheet: { maxHeight: '92%' } };
  }
  return {
    frame: { justifyContent: 'flex-start', paddingTop: state.top + GAP },
    sheet: { maxHeight: state.height - 2 * GAP },
  };
}

// ---------------------------------------------------------------------------
// Référence, défilement, mesures
// ---------------------------------------------------------------------------

/**
 * La hauteur de la page sans clavier.
 *
 * `innerHeight` ne suffit pas : selon la version d'iOS et le mode (onglet ou
 * app installée), il suit parfois la zone visible quand le clavier s'ouvre, et
 * l'écart qui trahit le clavier disparaît. La plus grande zone visible déjà
 * mesurée dans cette orientation, elle, ne ment pas : un clavier ne fait que
 * réduire.
 */
export function referenceHeight(innerHeight: number, tallestSeen: number | undefined): number {
  return Math.max(innerHeight, tallestSeen ?? 0);
}

/** Marge gardée entre le champ et le bord de la zone qui défile. */
const REVEAL_MARGIN = 16;

/**
 * Le défilement à donner à la zone qui contient le champ pour qu'il y soit
 * entier, ou `null` s'il l'est déjà. Les deux rectangles sont mesurés dans le
 * même repère : ce calcul ne dépend pas de la façon dont iOS fait glisser
 * l'écran.
 */
export function revealScrollTop(
  container: { top: number; bottom: number; scrollTop: number },
  field: { top: number; bottom: number },
  margin: number = REVEAL_MARGIN,
): number | null {
  const room = container.bottom - container.top - 2 * margin;
  if (field.bottom > container.bottom - margin) {
    // Trop bas. Un champ plus haut que la zone montre au moins son début.
    const tall = field.bottom - field.top > room;
    const delta = tall
      ? field.top - (container.top + margin)
      : field.bottom - (container.bottom - margin);
    return Math.max(0, Math.round(container.scrollTop + delta));
  }
  if (field.top < container.top + margin) {
    return Math.max(0, Math.round(container.scrollTop - (container.top + margin - field.top)));
  }
  return null;
}

/** Les dernières mesures du clavier, pour le panneau « À propos ». */
export interface KeyboardProbe {
  inner: number;
  reference: number;
  visible: number;
  top: number;
  open: boolean;
  /** Le champ actif, dans la page : haut et bas. */
  field: [number, number] | null;
}

/** `CLAVIER · INNER 852 · RÉF 852 · VISIBLE 516 · HAUT 0 · OUVERT · CHAMP 300–340`. */
export function describeKeyboard(probe: KeyboardProbe): string {
  return [
    'CLAVIER',
    `INNER ${probe.inner}`,
    `RÉF ${probe.reference}`,
    `VISIBLE ${probe.visible}`,
    `HAUT ${probe.top}`,
    probe.open ? 'OUVERT' : 'FERMÉ',
    ...(probe.field ? [`CHAMP ${probe.field[0]}–${probe.field[1]}`] : []),
  ].join(' · ');
}
