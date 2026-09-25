import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MemberAvatar } from '@/components/MemberAvatar';
import { TitleMedal } from '@/components/TitleMedal';
import { Micro } from '@/components/ui/Micro';
import { titleOf, type ClubStanding, type ClubTitle } from '@/features/club/clubStandings';
import { formatPoints, toRoman } from '@/lib/format';
import { a, c, f } from '@/theme/tokens';

export interface ClubPodiumProps {
  /** Le classement complet, trié : le podium en prend les cinq premiers. */
  rows: ClubStanding[];
  /** Toucher une marche ouvre l'affiche de son titre. */
  onOpenTitle?: (title: ClubTitle) => void;
}

/** Cinq marches, une par titre du club (`CLUB_TITLES`). */
const PODIUM_SIZE = 5;

/**
 * Tout suit le rang, pas la place : deux ex æquo sont à la même hauteur.
 * Chaque marche descend d'un cran — de quoi lire les cinq niveaux d'un coup
 * d'œil, jusque sur un écran de 320 px.
 */
const STEP_HEIGHT: Record<number, number> = { 1: 178, 2: 160, 3: 146, 4: 132, 5: 120 };
const AVATAR_SIZE: Record<number, number> = { 1: 52, 2: 42, 3: 42, 4: 36, 5: 36 };
const MEDAL_SIZE: Record<number, number> = { 1: 46, 2: 38, 3: 38, 4: 32, 5: 32 };
const NUMERAL_SIZE: Record<number, number> = { 1: 22, 2: 17, 3: 17, 4: 15, 5: 15 };

/**
 * En dessous, une colonne fait moins de 55 px : le nom du titre passe un cran
 * plus petit, pour que « Fournisseur » ou « Pumpologie » tiennent sans se
 * couper au milieu du mot.
 */
const NARROW_SCREEN = 350;

/**
 * Le podium du club, à cinq marches : de gauche à droite le quatrième, le
 * deuxième, le premier au centre et plus haut, le troisième, le cinquième.
 * Chaque marche porte le médaillon de son titre ; la toucher ouvre l'affiche.
 *
 * Tant que tout le monde est à égalité — en début d'année, sept membres à zéro —
 * il n'y a pas de podium : on ne monte pas sur une marche à l'ordre alphabétique.
 */
export function ClubPodium({ rows, onOpenTitle }: ClubPodiumProps) {
  const top = rows.slice(0, PODIUM_SIZE);
  const leader = top[0];
  const decided = leader !== undefined && titleOf(leader, rows) !== null;

  if (!decided) {
    return (
      <View
        className="items-center border border-border"
        style={{ paddingVertical: 28, paddingHorizontal: 18, borderRadius: 4, gap: 8 }}
      >
        <Micro size={8.5} tracking={1.7} style={{ color: c.goldMuted }}>
          PODIUM
        </Micro>
        <Text
          style={{
            fontFamily: f.serifItalic,
            fontSize: 16,
            lineHeight: 22,
            color: c.sepia,
            textAlign: 'center',
          }}
        >
          Personne ne s’est encore détaché. Le premier call qui bouge, le premier pari résolu,
          et le podium se dessine.
        </Text>
      </View>
    );
  }

  // 4, 2, 1, 3, 5 : l'ordre d'un podium, le premier au centre.
  const slots = [top[3], top[1], top[0], top[2], top[4]];

  return (
    // Le filet du bas : le sol sur lequel reposent les cinq marches.
    <View
      className="flex-row items-end"
      style={{ gap: 5, borderBottomWidth: 1, borderBottomColor: c.borderLift }}
    >
      {slots.map((row, index) =>
        row ? (
          <Step
            key={row.member.id}
            row={row}
            rows={rows}
            center={index === 2}
            onOpenTitle={onOpenTitle}
          />
        ) : (
          <View key={`vide-${index}`} style={{ flex: index === 2 ? 1.2 : 1 }} />
        ),
      )}
    </View>
  );
}

function Step({
  row,
  rows,
  center,
  onOpenTitle,
}: {
  row: ClubStanding;
  rows: ClubStanding[];
  /** La colonne du milieu, un peu plus large : celle du premier. */
  center: boolean;
  onOpenTitle?: (title: ClubTitle) => void;
}) {
  const title = titleOf(row, rows);
  const first = row.rank === 1;
  const narrow = useWindowDimensions().width < NARROW_SCREEN;
  const titleSize = (first ? 11.5 : 10.5) - (narrow ? 1 : 0);
  const rank = Math.min(row.rank, PODIUM_SIZE);
  const height = STEP_HEIGHT[rank]!;
  const avatar = AVATAR_SIZE[rank]!;
  const medal = MEDAL_SIZE[rank]!;

  return (
    <View style={{ flex: center ? 1.2 : 1, minWidth: 0, alignItems: 'center' }}>
      <MemberAvatar member={row.member} size={avatar} ringColor={first ? c.gold : undefined} />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: f.sansSemi,
          fontSize: 11,
          color: c.bone,
          marginTop: 7,
          maxWidth: '100%',
        }}
      >
        {row.member.displayName}
      </Text>
      {/* Sans « pts » : cinq colonnes n'en ont pas la place, et la liste
          juste en dessous le dit. */}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: f.serif,
          fontSize: first ? 21 : 16,
          lineHeight: first ? 25 : 20,
          color: row.total < 0 ? c.oxblood : first ? c.gold : c.ivory,
          fontVariant: ['tabular-nums'],
          marginTop: 1,
          marginBottom: 7,
          maxWidth: '100%',
        }}
      >
        {formatPoints(row.total)}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title ? `Voir l’affiche : ${title.title}` : undefined}
        disabled={!title || !onOpenTitle}
        onPress={() => title && onOpenTitle?.(title)}
        style={{ width: '100%' }}
      >
        <LinearGradient
          colors={first ? [a.podiumTop, a.podiumBottom] : [c.surface, c.surfaceDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            width: '100%',
            height,
            alignItems: 'center',
            paddingTop: 8,
            paddingHorizontal: 3,
            gap: 5,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: first ? a.podiumBorder : c.borderLift,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3,
          }}
        >
          <Text
            style={{
              fontFamily: f.display,
              fontSize: NUMERAL_SIZE[rank],
              color: first ? c.gold : c.goldMuted,
            }}
          >
            {toRoman(row.rank)}
          </Text>
          {title ? <TitleMedal title={title} size={medal} /> : null}
          {title ? (
            <Text
              numberOfLines={4}
              style={{
                fontFamily: f.serifItalic,
                fontSize: titleSize,
                lineHeight: titleSize + 2,
                color: first ? c.goldTint : c.parchment,
                textAlign: 'center',
              }}
            >
              {title.title}
            </Text>
          ) : null}
        </LinearGradient>
      </Pressable>
    </View>
  );
}
