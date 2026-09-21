import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { brand } from '@/theme/brand';
import { c, f } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface ScreenHeaderProps {
  overline: string;
  title: string;
  me: Member | null;
}

/**
 * En-tête commun aux trois onglets : marque, surtitre, titre serif, avatar.
 *
 * Le logo n'était que sur la porte d'entrée — une fois connecté, plus rien ne
 * disait chez qui on était. Il tient ici la place d'un sceau : petit, à gauche
 * du titre, présent sur les trois écrans sans jamais réclamer l'attention.
 */
export function ScreenHeader({ overline, title, me }: ScreenHeaderProps) {
  return (
    <View
      className="flex-row items-end justify-between"
      style={{ paddingTop: 6, paddingHorizontal: 22, paddingBottom: 14, gap: 13 }}
    >
      <Image
        source={require('../../assets/brand/logo.png')}
        style={{ width: 38, height: 38, marginBottom: 2 }}
        resizeMode="contain"
        accessibilityLabel={brand.name}
      />

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
