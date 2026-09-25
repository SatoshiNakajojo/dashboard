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
