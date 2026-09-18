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
}

/**
 * Chrome commun aux trois onglets : en-tête, bandeau BTC, zone scrollable.
 *
 * La barre de statut et l'encoche du prototype sont du décor de maquette —
 * on utilise la vraie safe area (README §8.11 et §8.12).
 */
export function ScreenShell({ overline, title, me, children }: ScreenShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top }}>
      <ScreenHeader overline={overline} title={title} me={me} />
      <BtcTicker />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}
