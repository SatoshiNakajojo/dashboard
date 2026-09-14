import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
} from '@expo-google-fonts/manrope';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';

import { loadSkia } from '@/lib/skiaWeb';
import { c } from '@/theme/tokens';
import '../global.css';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Les trois familles ont des rôles non interchangeables (README §4.4) :
  // l'app n'affiche rien tant qu'elles ne sont pas toutes chargées.
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    // Lancé sans être attendu : l'app démarre même si CanvasKit met du temps
    // ou ne vient jamais. C'est l'onglet Oracle qui dégrade, pas l'application.
    void loadSkia();
  }, []);

  useEffect(() => {
    // Une police manquante ne doit pas bloquer l'app sur son splash : on laisse
    // le système substituer plutôt que d'afficher un écran figé.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.ink }}>
      <SafeAreaProvider>
        <View className="flex-1 bg-ink">
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ink } }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
