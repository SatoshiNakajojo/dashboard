import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import { BootScreen } from '@/components/BootScreen';
import { hideBootShell } from '@/lib/bootShell';
import { useProfileBootstrap } from '@/features/auth/useAuth';
import { useSession } from '@/hooks/useSession';
import { isSupabaseConfigured } from '@/lib/supabase';
import { brand } from '@/theme/brand';
import { c } from '@/theme/tokens';
import '../global.css';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Les trois familles ont des rôles non interchangeables (`tokens.ts`) :
  // l'app n'affiche rien tant qu'elles ne sont pas toutes chargées. Ce sont
  // des sous-ensembles latins, embarqués dans le projet (`assets/fonts/`).
  const [fontsLoaded, fontError] = useFonts({
    Cinzel_600SemiBold: require('../assets/fonts/Cinzel-600.ttf'),
    CormorantGaramond_500Medium: require('../assets/fonts/CormorantGaramond-500.ttf'),
    CormorantGaramond_500Medium_Italic: require('../assets/fonts/CormorantGaramond-500Italic.ttf'),
    Inter_400Regular: require('../assets/fonts/Inter-400.ttf'),
    Inter_500Medium: require('../assets/fonts/Inter-500.ttf'),
    Inter_600SemiBold: require('../assets/fonts/Inter-600.ttf'),
  });

  useEffect(() => {
    // Une police manquante ne doit pas bloquer l'app sur son splash : on laisse
    // le système substituer plutôt que d'afficher un écran figé.
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync();
    // La coquille HTML a tenu l'écran depuis le premier octet ; c'est ici, et
    // seulement ici, qu'on sait que l'app peut prendre sa place.
    hideBootShell();
  }, [fontsLoaded, fontError]);

  // Rendre `null` laissait un rectangle noir. Sur le web la coquille couvre
  // encore l'écran à ce stade, mais sur mobile natif il n'y a rien d'autre, et
  // les deux doivent montrer la même chose.
  if (!fontsLoaded && !fontError) return <BootScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.ink }}>
      <SafeAreaProvider>
        <View className="flex-1 bg-ink">
          <StatusBar style="light" />
          {/* `expo-router/head` pilote le <title> de la build web ; sur mobile
              natif il ne rend rien. */}
          <Head>
            <title>{brand.name}</title>
          </Head>
          <AuthGate />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ink } }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)/sign-in" />
            {/* Hors des onglets : le profil se superpose et se referme, il
              n'est pas un quatrième onglet permanent. */}
            <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Garde de route.
 *
 * Sans backend configuré, elle ne fait rien : l'app démarre sur les mocks et
 * personne ne se connecte. Avec Supabase, deux conditions mènent à la porte —
 * pas de session, ou une session sans ligne `profiles`, car `is_member()`
 * refuse tout dans ce second cas.
 *
 * Elle ne rend rien : une redirection n'a pas d'apparence.
 */
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { userId, loading } = useSession();
  const profile = useProfileBootstrap(userId);

  const onSignIn = segments[0] === '(auth)';

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // On ne redirige pas tant qu'on ignore l'état : sinon l'écran de connexion
    // clignoterait à chaque démarrage d'un membre déjà identifié.
    if (loading || profile.checking) return;

    const needsDoor = !userId || profile.needsProfile;

    if (needsDoor && !onSignIn) {
      router.replace('/(auth)/sign-in');
    } else if (!needsDoor && onSignIn) {
      router.replace('/');
    }
  }, [loading, onSignIn, profile.checking, profile.needsProfile, router, userId]);

  return null;
}
