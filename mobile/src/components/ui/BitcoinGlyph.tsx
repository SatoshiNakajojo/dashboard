import { Text } from 'react-native';

import { c, f } from '@/theme/tokens';

export interface BitcoinGlyphProps {
  size?: number;
  color?: string;
}

/**
 * Le ₿ du club — U+20BF.
 *
 * **Écart assumé avec le README §10**, qui demande ce glyphe en Instrument
 * Serif : cette police ne le contient pas. Le rendre en serif laisse chaque
 * plateforme substituer sa propre police, donc un ₿ différent sur iOS, Android
 * et le web — l'inverse de ce que « au pixel près » veut dire.
 *
 * JetBrains Mono le contient, et c'est déjà une police du projet. Un seul
 * composant pour que l'arbitrage se change en un endroit.
 */
export function BitcoinGlyph({ size = 13, color = c.onGold }: BitcoinGlyphProps) {
  return (
    <Text
      accessibilityLabel="Bitcoin"
      style={{
        fontFamily: f.monoMed,
        fontSize: size,
        lineHeight: size * 1.25,
        color,
      }}
    >
      ₿
    </Text>
  );
}
