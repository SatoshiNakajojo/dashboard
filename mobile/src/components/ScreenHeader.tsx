import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { c, f } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface ScreenHeaderProps {
  overline: string;
  title: string;
  me: Member | null;
}

/** En-tête commun aux trois onglets : surtitre, titre serif, avatar. */
export function ScreenHeader({ overline, title, me }: ScreenHeaderProps) {
  return (
    <View
      className="flex-row items-end justify-between"
      style={{ paddingTop: 6, paddingHorizontal: 22, paddingBottom: 14 }}
    >
      <View className="flex-1">
        <Micro>{overline}</Micro>
        <Text
          style={{
            fontFamily: f.serif,
            fontSize: 29,
            lineHeight: 30,
            letterSpacing: 0.145,
            color: c.ivory,
            marginTop: 7,
          }}
        >
          {title}
        </Text>
      </View>

      <LinearGradient
        colors={['#241D14', '#14100B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 1,
          borderColor: '#33291B',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: f.monoMed, fontSize: 11, color: c.gold }}>
          {me?.initials ?? '··'}
        </Text>
      </LinearGradient>
    </View>
  );
}
