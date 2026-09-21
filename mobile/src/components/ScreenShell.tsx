import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BtcTicker } from '@/components/BtcTicker';
import { ScreenHeader } from '@/components/ScreenHeader';
import type { Member } from '@/types/domain';

export interface ScreenShellProps {
  overline: string;
  title: string;
  me: Member | null;
  children: ReactNode;
  /**
   * Ce qui se pose par-dessus le contenu sans le pousser — les annonces de
   * présence, aujourd'hui. Ancré sous l'en-tête plutôt qu'en haut de l'écran :
   * une bannière qui recouvre le logo et le titre fait perdre de vue où on est.
   */
  overlay?: ReactNode;
}

/**
 * Chrome commun aux trois onglets : en-tête, bandeau BTC, zone scrollable.
 *
 * La barre de statut et l'encoche du prototype sont du décor de maquette —
 * on utilise la vraie safe area (README §8.11 et §8.12).
 */
export function ScreenShell({ overline, title, me, children, overlay }: ScreenShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top }}>
      <ScreenHeader overline={overline} title={title} me={me} />
      <BtcTicker />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {overlay}
      </View>
    </View>
  );
}
