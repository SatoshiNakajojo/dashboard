import { Pressable, Text, View } from 'react-native';

import { MemberAvatar } from '@/components/MemberAvatar';
import { TitleMedal } from '@/components/TitleMedal';
import { Micro } from '@/components/ui/Micro';
import { titleOf, type ClubStanding, type ClubTitle } from '@/features/club/clubStandings';
import { formatPoints, toRoman } from '@/lib/format';
import { c, f } from '@/theme/tokens';

export interface ClubStandingsProps {
  rows: ClubStanding[];
  loading: boolean;
  /** Mon identifiant : ma ligne se repère d'un coup d'œil. */
  meId: string | null;
  /** Toucher un titre ouvre son affiche. */
  onOpenTitle?: (title: ClubTitle) => void;
}

/**
 * Le classement du club, ligne à ligne : rang, membre, titre et devise, et le
 * détail de ses points — calls d'un côté, Oracle de l'autre.
 */
export function ClubStandings({ rows, loading, meId, onOpenTitle }: ClubStandingsProps) {
  if (rows.length === 0) {
    return (
      <Text
        style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.sepia, paddingVertical: 14 }}
      >
        {loading ? 'Chargement…' : 'Aucun membre pour l’instant.'}
      </Text>
    );
  }

  return (
    <View>
      {rows.map((row) => {
        const title = titleOf(row, rows);
        const mine = row.member.id === meId;
        return (
          <View
            key={row.member.id}
            className="flex-row border-b border-hairline"
            style={{ gap: 14, paddingVertical: 14, paddingHorizontal: 2 }}
          >
            <View style={{ width: 30, paddingTop: 2 }}>
              <Text
                style={{
                  fontFamily: f.serif,
                  fontSize: 18,
                  color: row.rank === 1 && title ? c.gold : c.goldMuted,
                }}
              >
                {toRoman(row.rank)}
              </Text>
            </View>

            <View style={{ paddingTop: 2 }}>
              <MemberAvatar
                member={row.member}
                size={30}
                ringColor={mine ? c.gold : undefined}
              />
            </View>

            <View className="flex-1" style={{ gap: 3 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: f.sansSemi, fontSize: 13, color: mine ? c.ivory : c.bone }}
              >
                {mine ? `${row.member.displayName} · vous` : row.member.displayName}
              </Text>
              {title ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Voir l’affiche : ${title.title}`}
                  disabled={!onOpenTitle}
                  onPress={() => onOpenTitle?.(title)}
                  style={{ gap: 3 }}
                >
                  <View className="flex-row items-center" style={{ gap: 7 }}>
                    <TitleMedal title={title} size={22} />
                    <Micro size={8} tracking={1.4} style={{ flexShrink: 1, color: c.gold }}>
                      {title.title}
                    </Micro>
                  </View>
                  <Text
                    style={{
                      fontFamily: f.serifItalic,
                      fontSize: 13.5,
                      lineHeight: 18,
                      color: c.sepia,
                    }}
                  >
                    {`«\u00a0${title.motto}\u00a0»`}
                  </Text>
                </Pressable>
              ) : null}
              <Text
                style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted, marginTop: 1 }}
              >
                {/* Espaces insécables : un chiffre ne se sépare pas de son libellé. */}
                {`Calls\u00a0${formatPoints(row.calls)}${
                  row.callsLatent !== 0
                    ? ` (dont\u00a0${formatPoints(row.callsLatent)} en\u00a0jeu)`
                    : ''
                } · Oracle\u00a0${formatPoints(row.oracle)}`}
              </Text>
            </View>

            <View className="items-end" style={{ paddingTop: 1 }}>
              <Text
                style={{
                  fontFamily: f.serif,
                  fontSize: 20,
                  color: row.total < 0 ? c.oxblood : c.ivory,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatPoints(row.total)}
              </Text>
              <Micro size={7.5} tracking={1.4} style={{ color: c.sepiaMuted }}>
                PTS
              </Micro>
            </View>
          </View>
        );
      })}
    </View>
  );
}
