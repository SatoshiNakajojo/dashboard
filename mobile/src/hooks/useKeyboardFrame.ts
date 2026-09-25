import { useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';

import {
  CLOSED,
  keyboardFrameStyles,
  keyboardState,
  type KeyboardState,
} from '@/lib/keyboardFrame';

/**
 * Les feuilles du bas (soirée, call, vote, clôture) et le clavier du téléphone.
 *
 * Une feuille est collée au bas de l'écran. Sur iPhone, le clavier monte
 * par-dessus sans que la page ne rétrécisse : le champ où l'on écrit passait
 * dessous, et l'on tapait à l'aveugle.
 *
 * Le navigateur dit ce qui reste visible : `window.visualViewport`. Clavier
 * ouvert, la feuille quitte le bas pour se caler **en haut de la zone
 * visible**, prend au plus sa hauteur, et défile jusqu'au champ actif. Le
 * clavier est alors sous la zone de texte, jamais dessus.
 */

function isField(node: EventTarget | null): node is HTMLElement {
  const tag = (node as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** Amène le champ actif en vue, dans la feuille qui défile. */
function revealActiveField() {
  const active = document.activeElement;
  if (isField(active)) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function useKeyboardFrame(): { frame: ViewStyle; sheet: ViewStyle; open: boolean } {
  const [state, setState] = useState<KeyboardState>(CLOSED);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      const next = keyboardState(window.innerHeight, viewport.height, viewport.offsetTop);
      setState((current) =>
        current.open === next.open && current.top === next.top && current.height === next.height
          ? current
          : next,
      );
      // Le clavier finit de monter : le champ actif doit être visible.
      if (next.open) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(revealActiveField, 120);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      if (timer) clearTimeout(timer);
      // Le temps que le clavier s'ouvre, ou que la feuille change de place.
      timer = setTimeout(revealActiveField, 320);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);

  return { ...keyboardFrameStyles(state), open: state.open };
}
