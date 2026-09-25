import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import {
  CLUB_TITLES,
  titleHolders,
  type ClubStanding,
  type ClubTitle,
} from '@/features/club/clubStandings';
import { TITLE_ART } from '@/features/club/titleArt';
import { toRoman } from '@/lib/format';
import { c, f, gutter, radius } from '@/theme/tokens';

export interface TitleGalleryProps {
  rows: ClubStanding[];
  onOpen: (title: ClubTitle) => void;
}

const CARD = 196;

/**
 * Les cinq titres du club, en affiches qui défilent : ce qu'on gagne — ou ce
 * qu'on risque — à chaque place, et qui les porte aujourd'hui.
 */
export function TitleGallery({ rows, onOpen }: TitleGalleryProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Les affiches vont jusqu'aux bords de l'écran : la dernière, coupée,
      // dit qu'il y en a d'autres.
      style={{ marginHorizontal: -gutter }}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: 12 }}
    >
      {CLUB_TITLES.map((title) => {
        const holders = titleHolders(title, rows);
        return (
          <Pressable
            key={title.key}
            accessibilityRole="button"
            accessibilityLabel={`Voir l’affiche : ${title.title}`}
            onPress={() => onOpen(title)}
            style={{ width: CARD, gap: 8 }}
          >
            <Image
              source={TITLE_ART[title.key].card}
              resizeMode="cover"
              style={{
                width: CARD,
                height: CARD,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: holders.length > 0 ? c.goldMuted : c.border,
                opacity: holders.length > 0 ? 1 : 0.55,
              }}
            />
            <View style={{ gap: 3, paddingHorizontal: 2 }}>
              <Micro size={8} tracking={1.6} style={{ color: c.goldMuted }}>
                {`${toRoman(title.rank)} · ${title.title}`}
              </Micro>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: f.serifItalic,
                  fontSize: 14,
                  color: holders.length > 0 ? c.parchment : c.sepiaMuted,
                }}
              >
                {holders.length > 0
                  ? holders.map((row) => row.member.displayName).join(', ')
                  : 'Vacant'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
