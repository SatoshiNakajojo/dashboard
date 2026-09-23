import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { a, c, f, radius } from '@/theme/tokens';

export interface TimeLockCardProps {
  /** Scellé : le cadenas se ferme, vire à l'oxblood, et l'animation s'arrête. */
  locked: boolean;
  /** `VERROUILLAGE DANS`, `RÉSOLUTION DANS`… */
  title: string;
  /** Le compte à rebours, ou la règle de l'horizon quand aucun pari n'est ouvert. */
  value: string;
}

/**
 * Carte du time-lock.
 *
 * Elle ne décide plus de son texte. Avec un seul pari par saison, deux états
 * suffisaient — ouvert, scellé. Avec plusieurs horizons il en faut trois (pas
 * de pari, révisable, verrouillé), et c'est l'écran qui sait lequel.
 *
 * L'animation `gleam` ne tourne que tant que le pari est modifiable : une fois
 * scellé, plus rien ne bouge. C'est la seule animation continue de l'app.
 */
export function TimeLockCard({ locked, title, value }: TimeLockCardProps) {
  // `useState` avec initialiseur paresseux plutôt que `useRef(...).current` :
  // lire `.current` pendant le rendu est interdit par les règles React.
  const [gleam] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    if (locked) {
      gleam.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gleam, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(gleam, {
          toValue: 0.45,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [gleam, locked]);

  const accent = locked ? c.oxblood : c.gold;
  const border = locked ? a.lockClosed : a.lockOpen;

  return (
    <LinearGradient
      colors={[c.surfaceLock, c.surfaceDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: border,
        padding: 15,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Animated.View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 1,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: gleam,
        }}
      >
        <Padlock color={accent} open={!locked} />
      </Animated.View>

      <View className="flex-1">
        <Micro tracking={1.8} numberOfLines={1}>
          {title}
        </Micro>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: f.labelMed,
            fontSize: 15,
            letterSpacing: -0.15,
            color: c.ivory,
            marginTop: 6,
            // Le compte à rebours change chaque seconde : sans chiffres
            // tabulaires, la ligne tremblerait.
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      </View>
    </LinearGradient>
  );
}

/** Cadenas dessiné en deux vues : corps + anse. Aucun asset binaire. */
function Padlock({ color, open }: { color: string; open: boolean }) {
  return (
    <View style={{ width: 13, height: 10, borderRadius: 2, backgroundColor: color }}>
      <View
        style={{
          position: 'absolute',
          left: 2.5,
          top: -6,
          width: 8,
          height: 7,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderWidth: 1.5,
          borderBottomWidth: 0,
          borderColor: color,
          transform: open ? [{ rotate: '-24deg' }, { translateX: -2 }] : [{ rotate: '0deg' }],
        }}
      />
    </View>
  );
}
