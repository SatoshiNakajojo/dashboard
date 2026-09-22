import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { c, goldRadial, goldRadialLocations } from '@/theme/tokens';

/** Bouton d'action : cercle or, croix dessinée. */
export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // 96 auparavant : la maquette dessinait une barre d'onglets bien plus
      // haute que celle qu'on a corrigée. Le bouton flottait alors au milieu
      // de la liste et masquait un ticker sur deux.
      style={{ position: 'absolute', right: 20, bottom: 24 }}
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
          // Sans halo : l'ombre dorée bavait sur le contenu et donnait au
          // bouton un air de notification. Le disque se voit très bien seul,
          // sur un fond aussi sombre.
        }}
      >
        <View style={{ width: 15, height: 15 }}>
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 6.75,
              width: 15,
              height: 1.5,
              backgroundColor: c.onGold,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 6.75,
              top: 0,
              width: 1.5,
              height: 15,
              backgroundColor: c.onGold,
            }}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}
