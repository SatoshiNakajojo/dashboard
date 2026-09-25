import { Image } from 'react-native';

import type { ClubTitle } from '@/features/club/clubStandings';
import { TITLE_ART } from '@/features/club/titleArt';
import { a } from '@/theme/tokens';

export interface TitleMedalProps {
  title: ClubTitle;
  size: number;
  /** Le filet autour du médaillon ; l'or du podium par défaut. */
  ringColor?: string;
}

/** Le personnage d'un titre dans son halo, en médaillon rond. */
export function TitleMedal({ title, size, ringColor = a.podiumBorder }: TitleMedalProps) {
  return (
    <Image
      source={TITLE_ART[title.key].medal}
      accessibilityLabel={title.title}
      resizeMode="cover"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: ringColor,
      }}
    />
  );
}
