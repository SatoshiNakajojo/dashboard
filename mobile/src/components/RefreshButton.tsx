import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { refreshApp } from '@/lib/appRefresh';
import { c } from '@/theme/tokens';

/** Le tour du bouton dure au moins ça : un clic sans effet visible, on le refait. */
const MIN_SPIN_MS = 800;

/**
 * ↻ — actualiser l'app.
 *
 * Une PWA installée n'a pas de bouton « recharger ». Celui-ci relit toutes
 * les données, et si une nouvelle version a été publiée, recharge l'app
 * dessus (`src/lib/appRefresh.ts`).
 */
export function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [turn] = useState(() => new Animated.Value(0));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, turn]);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    const started = Date.now();
    const reloading = await refreshApp();
    // L'app se recharge : le bouton tourne jusqu'au bout.
    if (reloading) return;
    const left = MIN_SPIN_MS - (Date.now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
    if (mounted.current) setBusy(false);
  };

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Actualiser l’app"
      accessibilityState={{ busy }}
      hitSlop={12}
      onPress={() => void press()}
      style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
            stroke={busy ? c.gold : c.sepiaMuted}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M21 3v5h-5"
            stroke={busy ? c.gold : c.sepiaMuted}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
