import { Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Micro } from '@/components/ui/Micro';
import type { ClubTitle } from '@/features/club/clubStandings';
import { TITLE_ART } from '@/features/club/titleArt';
import { toRoman } from '@/lib/format';
import { c, f } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface TitlePosterProps {
  /** Le titre à montrer ; `null` : fermé. */
  title: ClubTitle | null;
  /** Qui le porte en ce moment — personne, un membre, ou des ex æquo. */
  holders: readonly Member[];
  onClose: () => void;
}

/**
 * L'affiche d'un titre, en grand.
 *
 * Même geste que le sceau du club : un appui l'ouvre, un appui la referme.
 * Sous l'affiche, qui la porte en ce moment.
 */
export function TitlePoster({ title, holders, onClose }: TitlePosterProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const side = Math.min(width * 0.92, height * 0.68, 560);

  return (
    <Modal
      visible={title !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fermer l’affiche"
        onPress={onClose}
        className="flex-1 bg-ink items-center justify-center"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, gap: 18 }}
      >
        {title ? (
          <>
            {/* Le carré est porté par la vue : voir `LogoViewer`. */}
            <View style={{ width: side, height: side }}>
              <Image
                source={TITLE_ART[title.key].poster}
                resizeMode="contain"
                accessibilityLabel={`${title.title} — « ${title.motto} »`}
                style={{ width: '100%', height: '100%' }}
              />
            </View>

            <View className="items-center" style={{ gap: 7, paddingHorizontal: 24 }}>
              <Micro tracking={2.2} style={{ color: c.goldMuted }}>
                {`${toRoman(title.rank)} · ${title.rank === 1 ? '1ER' : `${title.rank}E`} DU CLASSEMENT`}
              </Micro>
              <Text
                style={{
                  fontFamily: f.serifItalic,
                  fontSize: 17,
                  lineHeight: 23,
                  color: holders.length > 0 ? c.parchment : c.sepia,
                  textAlign: 'center',
                }}
              >
                {holders.length > 0
                  ? `Porté par ${joinNames(holders.map((member) => member.displayName))}`
                  : 'Personne ne le porte pour l’instant.'}
              </Text>
            </View>

            <Micro size={8} tracking={2} style={{ color: c.sepiaFaint }}>
              TOUCHER POUR FERMER
            </Micro>
          </>
        ) : null}
      </Pressable>
    </Modal>
  );
}

/** `Léa`, `Léa et Alex`, `Léa, Alex et John`. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}
