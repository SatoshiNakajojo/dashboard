import { useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';

import {
  CLOSED,
  keyboardFrameStyles,
  keyboardState,
  referenceHeight,
  revealScrollTop,
  type KeyboardProbe,
  type KeyboardState,
} from '@/lib/keyboardFrame';

/**
 * Les feuilles du bas (soirée, call, vote, clôture, « J'apporte aussi ») et le
 * clavier du téléphone.
 *
 * Une feuille est collée au bas de l'écran. Sur iPhone, le clavier monte
 * par-dessus sans que la page ne rétrécisse : le champ où l'on écrit passait
 * dessous, et l'on tapait à l'aveugle.
 *
 * Le navigateur dit ce qui reste visible : `window.visualViewport`. Clavier
 * ouvert, la feuille quitte le bas pour se caler **en haut de la zone
 * visible**, prend au plus sa hauteur, et fait défiler **son propre contenu**
 * jusqu'au champ actif. Le clavier est alors sous la zone de texte.
 *
 * Deux leçons d'iPhone :
 *
 *   • le clavier se reconnaît à la zone visible qui rétrécit par rapport à la
 *     plus grande déjà mesurée, pas à `innerHeight`, qui la suit parfois ;
 *   • on ne fait défiler que la zone de la feuille. `scrollIntoView` faisait
 *     aussi glisser l'écran entier, ce qui déplaçait la feuille, qui se
 *     recalait, et le champ repartait sous le clavier.
 */

/** La plus grande zone visible mesurée, par largeur (donc par orientation). */
const tallest = new Map<number, number>();

/** Aucune zone visible ne dépasse l'écran : une mesure plus grande est une erreur. */
function screenCap(): number {
  const screen = window.screen as Screen | undefined;
  return screen ? Math.max(screen.width, screen.height) : Number.POSITIVE_INFINITY;
}

function remember(viewport: VisualViewport) {
  const width = Math.round(viewport.width);
  const height = Math.round(Math.min(viewport.height, screenCap()));
  if (height > (tallest.get(width) ?? 0)) tallest.set(width, height);
}

// Dès le chargement, avant qu'aucun clavier ne s'ouvre : la hauteur pleine.
if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
  remember(window.visualViewport);
  window.visualViewport.addEventListener('resize', () => {
    if (window.visualViewport) remember(window.visualViewport);
  });
}

function isField(node: EventTarget | null): node is HTMLElement {
  const tag = (node as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** La zone qui défile autour du champ — celle de la feuille, pas la page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = window.getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return null;
}

/** Amène le champ actif en vue, dans la zone de la feuille qui défile. */
function revealActiveField() {
  const active = document.activeElement;
  if (!isField(active)) return;
  const container = scrollParent(active);
  if (!container) return;
  const box = container.getBoundingClientRect();
  const field = active.getBoundingClientRect();
  const top = revealScrollTop(
    { top: box.top, bottom: box.bottom, scrollTop: container.scrollTop },
    { top: field.top, bottom: field.bottom },
  );
  // Sans animation : un défilement « smooth » dans une zone de React Native
  // Web ne partait pas, et le champ restait sous le clavier.
  if (top !== null) container.scrollTop = top;
}

/** Les dernières mesures, lues par le panneau « À propos » (`describeKeyboard`). */
function probe(state: KeyboardState, reference: number, viewport: VisualViewport) {
  const active = document.activeElement;
  const rect = isField(active) ? active.getBoundingClientRect() : null;
  const measures: KeyboardProbe = {
    inner: Math.round(window.innerHeight),
    reference: Math.round(reference),
    visible: Math.round(viewport.height),
    top: Math.round(viewport.offsetTop),
    open: state.open,
    field: rect ? [Math.round(rect.top), Math.round(rect.bottom)] : null,
  };
  (window as unknown as { __clubKeyboard?: KeyboardProbe }).__clubKeyboard = measures;
}

export function useKeyboardFrame(): { frame: ViewStyle; sheet: ViewStyle; open: boolean } {
  const [state, setState] = useState<KeyboardState>(CLOSED);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        revealActiveField();
      }, ms);
      timers.add(timer);
    };

    const update = () => {
      remember(viewport);
      const reference = referenceHeight(
        window.innerHeight,
        tallest.get(Math.round(viewport.width)),
      );
      const next = keyboardState(reference, viewport.height, viewport.offsetTop);
      setState((current) =>
        current.open === next.open && current.top === next.top && current.height === next.height
          ? current
          : next,
      );
      probe(next, reference, viewport);
      // Le clavier finit de monter, la feuille change de place : deux essais,
      // le second une fois la feuille posée.
      if (next.open) {
        later(120);
        later(420);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      // Le temps que le clavier s'ouvre, ou que la feuille change de place.
      later(320);
      later(650);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', onFocus);
    return () => {
      timers.forEach(clearTimeout);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);

  return { ...keyboardFrameStyles(state), open: state.open };
}

/** Les dernières mesures du clavier, s'il y en a eu. */
export function keyboardProbe(): KeyboardProbe | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __clubKeyboard?: KeyboardProbe }).__clubKeyboard ?? null;
}
