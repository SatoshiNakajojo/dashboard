import { Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubChannels } from '@/components/ClubChannels';
import { Micro } from '@/components/ui/Micro';
import { brand } from '@/theme/brand';
import { c, f } from '@/theme/tokens';

export interface LogoViewerProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Le sceau du club, en grand.
 *
 * Le logo tient 46 pt dans l'en-tête — assez pour signer l'écran, trop peu pour
 * qu'on y distingue le cocotier, les lunettes ou la silhouette de la
 * Grande Terre. Un appui l'ouvre en grand, et un appui ailleurs le referme.
 *
 * Sous le sceau, les trois groupes Messenger du club : c'est ici qu'on vient
 * chercher « le club » lui-même. Chaque ligne s'ouvre d'un appui, sans refermer
 * la vue.
 */
export function LogoViewer({ visible, onClose }: LogoViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Le sceau cède de la place aux groupes sur un petit écran : jamais plus de
  // 86 % de la largeur, ni plus de 42 % de la hauteur.
  const seal = Math.min(width * 0.86, height * 0.42, 420);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fermer le logo"
        onPress={onClose}
        className="flex-1 bg-ink items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom, gap: 24 }}
      >
        {/* Le carré est porté par la vue, pas par l'image : en flex colonne,
            `aspectRatio` sur une image la laisse s'étirer sur la place libre,
            et la composition se décentre. */}
        <View style={{ width: seal, height: seal }}>
          <Image
            source={require('../../assets/brand/logo.png')}
            // `contain` et non `cover` : un logo rogné n'est plus le logo.
            resizeMode="contain"
            accessibilityLabel={brand.name}
            style={{ width: '100%', height: '100%' }}
          />
        </View>

        <View className="items-center" style={{ gap: 9 }}>
          <Text style={{ fontFamily: f.display, fontSize: 21, color: c.ivory }}>
            {brand.name}
          </Text>
          <Micro tracking={2.4} style={{ color: c.sepiaMuted }}>
            NOUMÉA · 2020
          </Micro>
        </View>

        <View
          style={{ width: '86%', maxWidth: 420, borderTopWidth: 1, borderTopColor: c.hairline }}
        >
          <ClubChannels />
        </View>

        <Micro tracking={1.6} style={{ color: c.sepiaFaint }}>
          TOUCHER POUR FERMER
        </Micro>
      </Pressable>
    </Modal>
  );
}
