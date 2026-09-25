import { Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubChannels } from '@/components/ClubChannels';
import { Micro } from '@/components/ui/Micro';
import { describeJournal, readJournal } from '@/lib/authJournal';
import { isSupabaseConfigured } from '@/lib/supabase';
import { describeViewport, viewportInfo } from '@/lib/viewportInfo';
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
  // Le sceau cède de la place aux groupes et au crédit sur un petit écran :
  // jamais plus de 86 % de la largeur, ni plus de 36 % de la hauteur.
  const seal = Math.min(width * 0.86, height * 0.36, 400);
  const gap = height < 720 ? 16 : 22;

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
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, gap }}
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

        <About />
      </Pressable>
    </Modal>
  );
}

/**
 * Le crédit, en bas de la vue : qui l'a codée, qui l'a dessinée.
 *
 * Chaque rôle est un micro-label posé au-dessus du nom, comme un générique :
 * un italique à 14 pt collé à des capitales à 9 pt sur la même ligne mêlait
 * deux registres qui ne s'accordaient pas.
 */
function About() {
  return (
    <View className="items-center" style={{ width: '86%', maxWidth: 420, gap: 12 }}>
      <Micro tracking={2.2} size={8} style={{ color: c.sepiaFaint }}>
        {`À PROPOS · ${brand.version.toUpperCase()}`}
      </Micro>
      <Credit role="vibe-coded by" lines={['SATOSHI NAKAJOJO']} />
      {/* Coupé à la main : laissé au retour automatique, le nom finissait sur
          un « CALEDONIA » orphelin. */}
      <Credit
        role="design by"
        lines={['J.C. GLOBAL INVESTMENTS', 'SOFTWARE DEPARTMENT, NEW CALEDONIA']}
      />
      <ViewportLine />
      <SessionLine />
    </View>
  );
}

function Credit({ role, lines }: { role: string; lines: string[] }) {
  return (
    <View className="items-center" style={{ gap: 5 }}>
      <Micro tracking={2} size={8} style={{ color: c.sepiaMuted }}>
        {role}
      </Micro>
      <View className="items-center">
        {lines.map((text) => (
          <Text
            key={text}
            style={{
              fontFamily: f.labelMed,
              fontSize: 9,
              lineHeight: 15,
              letterSpacing: 1.4,
              color: c.goldMuted,
              textAlign: 'center',
            }}
          >
            {text}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Les mesures d'écran de l'app installée, en tout petit : une capture de ce
 * panneau suffit à diagnostiquer la bande basse d'un iPhone
 * (`src/lib/viewportInfo.ts`). Rien hors de l'app installée.
 */
function ViewportLine() {
  const info = viewportInfo();
  if (!info?.standalone) return null;
  return (
    <Micro tracking={1.2} size={7} style={{ color: c.sepiaFaint, textAlign: 'center' }}>
      {describeViewport(info)}
    </Micro>
  );
}

/**
 * Le journal de session de l'appareil, sur une ligne (`src/lib/authJournal.ts`) :
 * renouvellements, reprises après un démarrage sans réseau, dernier refus du
 * serveur. De quoi comprendre, sur une capture, pourquoi un membre a dû se
 * reconnecter.
 */
function SessionLine() {
  if (!isSupabaseConfigured) return null;
  return (
    <Micro tracking={1.2} size={7} style={{ color: c.sepiaFaint, textAlign: 'center' }}>
      {describeJournal(readJournal())}
    </Micro>
  );
}
