import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { c, goldRadial, goldRadialLocations } from '@/theme/tokens';

/** Bouton d'action : cercle or, croix dessinée. Visible sur la vue Bag seule. */
export function Fab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Poster un call"
      onPress={onPress}
      style={{ position: 'absolute', right: 20, bottom: 96 }}
    >
      <LinearGradient
        colors={[...goldRadial]}
        locations={[...goldRadialLocations]}
        start={{ x: 0.34, y: 0.28 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          // L'ombre porte le disque, pas le Pressable : appliquée au parent
          // transparent, elle dessine un rectangle sombre sur le web.
          shadowColor: c.gold,
          shadowOpacity: 0.55,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 14 },
          elevation: 12,
        }}
      >
        <View style={{ width: 15, height: 15 }}>
          <View
            style={{ position: 'absolute', left: 0, top: 6.75, width: 15, height: 1.5, backgroundColor: c.onGold }}
          />
          <View
            style={{ position: 'absolute', left: 6.75, top: 0, width: 1.5, height: 15, backgroundColor: c.onGold }}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}
