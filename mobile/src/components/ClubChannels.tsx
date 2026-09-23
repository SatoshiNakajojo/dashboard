import { Linking, Pressable, Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { CLUB_CHANNELS, channelUrl, type ClubChannel } from '@/lib/clubChannels';
import { a, c, f, radius } from '@/theme/tokens';

/** Un signe par groupe — du texte, pas d'image : rien à charger. */
const GLYPH: Record<ClubChannel['key'], string> = {
  bitcoin: '₿',
  stocks: '$',
  vibe: '</>',
};

/**
 * Les trois groupes Messenger du club.
 *
 * Ils vivent sous le sceau, dans la vue plein écran du logo : c'est l'endroit
 * où l'on va chercher « le club » lui-même, pas l'agenda d'une soirée. L'app y
 * renvoie plutôt que de doubler la conversation avec une messagerie à elle
 * (voir `src/lib/clubChannels.ts`).
 */
export function ClubChannels() {
  return (
    <View>
      {CLUB_CHANNELS.map((channel) => (
        <ChannelLine key={channel.key} channel={channel} />
      ))}
    </View>
  );
}

function ChannelLine({ channel }: { channel: ClubChannel }) {
  const url = channelUrl(channel);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        url
          ? `Ouvrir le groupe Messenger ${channel.name}`
          : `${channel.name} — lien pas encore renseigné`
      }
      accessibilityState={{ disabled: !url }}
      disabled={!url}
      onPress={() => {
        if (url) void Linking.openURL(url);
      }}
      // Le fond pressé seulement : NativeWind ignore `className` sur un
      // `Pressable` dont le style est une fonction — la mise en page vit donc
      // dans la vue intérieure.
      style={({ pressed }) => ({ backgroundColor: pressed ? a.pressed : 'transparent' })}
    >
      <View
        className="flex-row items-center border-b border-hairline"
        style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 2 }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.button,
            borderWidth: 1,
            borderColor: url ? a.rsvpGoldBorder : c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: f.labelMed,
              fontSize: channel.key === 'vibe' ? 9 : 13,
              color: url ? c.gold : c.sepiaMuted,
            }}
          >
            {GLYPH[channel.key]}
          </Text>
        </View>

        <View className="flex-1" style={{ gap: 3 }}>
          <Text style={{ fontFamily: f.sansSemi, fontSize: 13, color: c.bone }}>
            {channel.name}
          </Text>
          <Micro tracking={0.8} size={8} style={{ color: c.sepiaMuted }}>
            {channel.theme.toUpperCase()}
          </Micro>
        </View>

        <Text
          style={{
            fontFamily: f.labelMed,
            fontSize: 9,
            letterSpacing: 1.62,
            color: url ? c.gold : c.sepiaFaint,
          }}
        >
          {url ? 'OUVRIR ↗' : 'LIEN À VENIR'}
        </Text>
      </View>
    </Pressable>
  );
}
