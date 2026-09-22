import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { LogoViewer } from '@/components/LogoViewer';
import { Avatar } from '@/components/ui/Avatar';
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
 * disait chez qui on était. Il tient ici la place d'un sceau, à gauche du
 * titre, présent sur les trois écrans.
 *
 * Il fait 46 pt et non 38 : à 38, le cocotier et les lunettes du personnage
 * étaient illisibles, ce qui réduisait un logo dessiné à une tache orange. Un
 * appui l'ouvre en grand — c'est là qu'on regarde les détails.
 */
export function ScreenHeader({ overline, title, me }: ScreenHeaderProps) {
  const router = useRouter();
  const [zoomed, setZoomed] = useState(false);

  return (
    <View
      className="flex-row items-end justify-between"
      style={{ paddingTop: 6, paddingHorizontal: 22, paddingBottom: 14, gap: 13 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${brand.name} — voir le logo en grand`}
        onPress={() => setZoomed(true)}
        hitSlop={8}
      >
        <Image
          source={require('../../assets/brand/logo.png')}
          style={{ width: 46, height: 46, marginBottom: 2 }}
          resizeMode="contain"
          accessibilityLabel={brand.name}
        />
      </Pressable>

      <LogoViewer visible={zoomed} onClose={() => setZoomed(false)} />

      <View className="flex-1">
        <Micro>{overline}</Micro>
        <Text
          style={{
            fontFamily: f.display,
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

      {/* L'avatar est la porte du profil : c'est l'endroit où on s'attend à
        se trouver soi-même, et il n'y en avait pas d'autre. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mon profil"
        onPress={() => router.push('/profile')}
        hitSlop={8}
      >
        {me?.avatarUrl ? (
          <Avatar initials={me.initials} color={me.color} photo={me.avatarUrl} size={34} />
        ) : (
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
        )}
      </Pressable>
    </View>
  );
}
