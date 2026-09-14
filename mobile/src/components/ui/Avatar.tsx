import { Text, View } from 'react-native';

import { c, f } from '@/theme/tokens';

export interface AvatarProps {
  initials: string;
  color: string;
  size?: number;
  /** Bordure de l'empilement dans les cartes d'événement. */
  ringColor?: string;
  /** Opacité réduite pendant une écriture optimiste non confirmée. */
  dimmed?: boolean;
}

/**
 * Initiales sur fond de couleur — jamais une photo, jamais une icône.
 * La taille de police suit le diamètre, comme dans le design (22 → 8, 28 → 10).
 */
export function Avatar({ initials, color, size = 24, ringColor, dimmed }: AvatarProps) {
  const fontSize = size <= 20 ? 8 : size <= 24 ? 9 : size <= 28 ? 10 : 11;

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
        ...(ringColor ? { borderWidth: 1, borderColor: ringColor } : null),
      }}
    >
      <Text style={{ fontFamily: f.monoMed, fontSize, color: c.onAvatar }}>{initials}</Text>
    </View>
  );
}
