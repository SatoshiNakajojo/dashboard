import { useSyncExternalStore } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Toggle } from '@/components/NotificationSettings';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { isClickSoundOn, setClickSoundOn, subscribeClickSound } from '@/lib/clickSound';
import { c, f } from '@/theme/tokens';

/**
 * Couper ou rallumer le clic au toucher (`lib/clickSound.ts`).
 *
 * Réglage propre à l'appareil, comme sur JCGI : on peut vouloir le silence au
 * bureau et le clic sur son téléphone.
 */
export function SoundSettings() {
  const on = useSyncExternalStore(subscribeClickSound, isClickSoundOn, isClickSoundOn);
  if (Platform.OS !== 'web') return null;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle label="SON" hint={on ? 'ACTIF ICI' : 'COUPÉ ICI'} />
      <Pressable
        accessibilityRole="switch"
        aria-checked={on}
        accessibilityLabel="Clic au toucher"
        onPress={() => setClickSoundOn(!on)}
      >
        <View
          className="flex-row items-center border-b border-hairline"
          style={{ gap: 14, paddingVertical: 12 }}
        >
          <View className="flex-1" style={{ gap: 3 }}>
            <Text style={{ fontFamily: f.sansMed, fontSize: 13, color: c.bone }}>
              Clic au toucher
            </Text>
            <Text style={{ fontFamily: f.sans, fontSize: 11, color: c.sepiaMuted }}>
              Un clic discret sur chaque bouton, comme sur l’app JCGI. Sur iPhone, le bouton
              silencieux le coupe aussi.
            </Text>
          </View>
          <Toggle on={on} />
        </View>
      </Pressable>
    </View>
  );
}
