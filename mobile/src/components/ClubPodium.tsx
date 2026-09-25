import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MemberAvatar } from '@/components/MemberAvatar';
import { Micro } from '@/components/ui/Micro';
import { titleOf, type ClubStanding } from '@/features/club/clubStandings';
import { formatPoints, toRoman } from '@/lib/format';
import { a, c, f } from '@/theme/tokens';

export interface ClubPodiumProps {
  /** Le classement complet, trié : le podium en prend les trois premiers. */
  rows: ClubStanding[];
}

/** La hauteur de la marche suit le rang, pas la place : deux ex æquo sont à la même hauteur. */
const STEP_HEIGHT: Record<number, number> = { 1: 128, 2: 104, 3: 88 };
const AVATAR_SIZE: Record<number, number> = { 1: 60, 2: 46, 3: 46 };

/**
 * Le podium du club : le deuxième à gauche, le premier au centre et plus haut,
 * le troisième à droite.
 *
 * Tant que tout le monde est à égalité — en début d'année, sept membres à zéro —
 * il n'y a pas de podium : on ne monte pas sur une marche à l'ordre alphabétique.
 */
export function ClubPodium({ rows }: ClubPodiumProps) {
  const top = rows.slice(0, 3);
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

  // Le deuxième, le premier, le troisième : l'ordre d'un podium.
  const slots = [top[1], top[0], top[2]];

  return (
    // Le filet du bas : le sol sur lequel reposent les trois marches.
    <View
      className="flex-row items-end"
      style={{ gap: 8, borderBottomWidth: 1, borderBottomColor: c.borderLift }}
    >
      {slots.map((row, index) =>
        row ? (
          <Step key={row.member.id} row={row} rows={rows} />
        ) : (
          <View key={`vide-${index}`} style={{ flex: 1 }} />
        ),
      )}
    </View>
  );
}

function Step({ row, rows }: { row: ClubStanding; rows: ClubStanding[] }) {
  const title = titleOf(row, rows);
  const first = row.rank === 1;
  const height = STEP_HEIGHT[row.rank] ?? STEP_HEIGHT[3];
  const avatar = AVATAR_SIZE[row.rank] ?? AVATAR_SIZE[3];

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <MemberAvatar member={row.member} size={avatar} ringColor={first ? c.gold : undefined} />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: f.sansSemi,
          fontSize: 12,
          color: c.bone,
          marginTop: 8,
          maxWidth: '100%',
        }}
      >
        {row.member.displayName}
      </Text>
      <Text
        style={{
          fontFamily: f.serif,
          fontSize: first ? 24 : 20,
          lineHeight: first ? 28 : 24,
          color: row.total < 0 ? c.oxblood : first ? c.gold : c.ivory,
          fontVariant: ['tabular-nums'],
          marginTop: 2,
          marginBottom: 8,
        }}
      >
        {`${formatPoints(row.total)} pts`}
      </Text>

      <LinearGradient
        colors={first ? [a.podiumTop, a.podiumBottom] : [c.surface, c.surfaceDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          width: '100%',
          height,
          alignItems: 'center',
          paddingTop: 10,
          paddingHorizontal: 6,
          gap: 6,
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
            fontSize: first ? 24 : 19,
            color: first ? c.gold : c.goldMuted,
          }}
        >
          {toRoman(row.rank)}
        </Text>
        {title ? (
          <Text
            numberOfLines={3}
            style={{
              fontFamily: f.serifItalic,
              fontSize: 12.5,
              lineHeight: 15,
              color: first ? c.goldTint : c.parchment,
              textAlign: 'center',
            }}
          >
            {title.title}
          </Text>
        ) : null}
      </LinearGradient>
    </View>
  );
}
