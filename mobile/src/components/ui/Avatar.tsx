import { Image, Text, View } from 'react-native';

import { c, f } from '@/theme/tokens';

export interface AvatarProps {
  initials: string;
  color: string;
  /** Photo de profil. Absente, on retombe sur les initiales. */
  photo?: string | null;
  size?: number;
  /** Bordure de l'empilement dans les cartes d'événement. */
  ringColor?: string;
  /** Opacité réduite pendant une écriture optimiste non confirmée. */
  dimmed?: boolean;
}

/**
 * Initiales sur fond de couleur, ou la photo du membre s'il en a une.
 *
 * Le design ne prévoyait que des initiales — c'est ce qui donne à l'app sa
 * cohérence quand personne n'a mis de photo. La couleur reste donc le fond,
 * visible le temps que l'image charge, et le repli quand elle manque : un
 * avatar vide n'existe pas dans ce design.
 *
 * La taille de police suit le diamètre, comme dans le design (22 → 8, 28 → 10).
 */
export function Avatar({ initials, color, photo, size = 24, ringColor, dimmed }: AvatarProps) {
  // Au-delà de 40 pt — la page d'un membre, la sienne —, les initiales suivent
  // la taille du cercle au lieu de s'y perdre.
  const fontSize = size <= 20 ? 8 : size <= 24 ? 9 : size <= 28 ? 10 : size <= 40 ? 11 : Math.round(size * 0.3);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dimmed ? 0.55 : 1,
        overflow: 'hidden',
        ...(ringColor ? { borderWidth: 1, borderColor: ringColor } : null),
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          accessibilityLabel={initials}
        />
      ) : (
        <Text style={{ fontFamily: f.labelMed, fontSize, color: c.onAvatar }}>{initials}</Text>
      )}
    </View>
  );
}
