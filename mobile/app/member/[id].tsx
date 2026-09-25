import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SharedLinks } from '@/components/SharedLinks';
import { TitlePoster } from '@/components/TitlePoster';
import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { memberCallPoints, pointLines, type MemberCallPoints } from '@/features/bag/callPoints';
import { useCalls } from '@/features/bag/useCalls';
import { clubStandings, titleHolders, titleOf } from '@/features/club/clubStandings';
import { TITLE_ART } from '@/features/club/titleArt';
import { useClubNights } from '@/features/nights/useClubNights';
import { useClubBets } from '@/features/oracle/useClubBets';
import { clubYear } from '@/features/oracle/standings';
import {
  callsRecord,
  nightsRecord,
  oracleRecord,
  type CallsRecord,
  type NightsRecord,
  type OracleRecord,
} from '@/features/profile/record';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import {
  formatClubDate,
  formatInteger,
  formatPercent,
  formatPoints,
  toRoman,
} from '@/lib/format';
import { horizonOf } from '@/lib/horizons';
import { assetClassStyle, c, f, perfColor, radius } from '@/theme/tokens';

/**
 * Le profil d'un membre, en lecture.
 *
 * On y arrive en touchant son avatar, n'importe où dans l'app. On y lit ce
 * qu'il a choisi de montrer au club — sa photo, ses liens — et son parcours :
 * ses calls, son rang à l'Oracle, ses soirées. Rien ne s'y modifie ; pour son
 * propre profil, un bouton mène à la page d'édition.
 */
export default function MemberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, byId, loading } = useMembers();
  const { userId } = useSession();

  const member = id ? byId.get(id) : undefined;
  const isMe = Boolean(member && member.id === userId);

  // Les mêmes sources que les onglets : une perf ou un score lus ici sont ceux
  // qu'affichent les cartes et le classement.
  const calls = useCalls(userId, byId);
  const club = useClubBets(byId);
  const nights = useClubNights();

  const record = useMemo(
    () =>
      member
        ? {
            calls: callsRecord(calls.calls, member.id),
            oracle: oracleRecord(club.history, club.bets, member.id, club.now),
            nights: nightsRecord(nights.events, member.id, club.now),
          }
        : null,
    [member, calls.calls, club.history, club.bets, club.now, nights.events],
  );

  // Sa place au classement du club, sur l'année en cours — le même calcul que
  // l'onglet Classement.
  const year = clubYear(club.now);
  const lines = useMemo(() => pointLines(calls.calls, club.now), [calls.calls, club.now]);
  const standing = useMemo(() => {
    if (!member) return null;
    const rows = clubStandings(members, lines, club.history, year);
    const row = rows.find((candidate) => candidate.member.id === member.id);
    if (!row) return null;
    const title = titleOf(row, rows);
    return {
      row,
      of: rows.length,
      title,
      /** Ceux qui portent le même titre — lui, et ses ex æquo. */
      holders: title ? titleHolders(title, rows).map((holder) => holder.member) : [],
      calls: memberCallPoints(lines, member.id, year),
    };
  }, [member, members, lines, club.history, year]);
  const [posterOpen, setPosterOpen] = useState(false);

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
        >
          <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
            RETOUR
          </Micro>
        </Pressable>
        <Text style={{ fontFamily: f.display, fontSize: 21, color: c.ivory }}>Profil</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingBottom: 40 + insets.bottom,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!member ? (
          <Text
            style={{ fontFamily: f.serifItalic, fontSize: 16, color: c.sepia, paddingTop: 24 }}
          >
            {loading ? 'Chargement…' : 'Ce membre est introuvable.'}
          </Text>
        ) : (
          <>
            <View className="items-center" style={{ gap: 14, paddingTop: 12 }}>
              <Avatar
                initials={member.initials}
                color={member.color}
                photo={member.avatarUrl}
                size={112}
              />
              <Text style={{ fontFamily: f.serif, fontSize: 30, color: c.ivory }}>
                {member.displayName}
              </Text>
              {/* Sa couleur : celle de ses courbes dans l'Oracle et de ses
                  marques partout ailleurs — c'est comme ça qu'on le reconnaît. */}
              <View style={{ width: 28, height: 2, backgroundColor: member.color }} />
              {standing && !(calls.loading || club.loading) ? (
                <View className="items-center" style={{ gap: 6 }}>
                  <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
                    {`${toRoman(standing.row.rank)} / ${standing.of} AU CLASSEMENT ${year} · ${formatPoints(standing.row.total)} PTS`}
                  </Micro>
                  {standing.title ? (
                    <>
                      {/* Son affiche : le titre qu'il porte, en trophée. Un
                          appui l'ouvre en grand. */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Voir l’affiche : ${standing.title.title}`}
                        onPress={() => setPosterOpen(true)}
                        style={{ marginVertical: 8 }}
                      >
                        <Image
                          source={TITLE_ART[standing.title.key].poster}
                          resizeMode="cover"
                          style={{
                            width: Math.min(width - 44, 280),
                            height: Math.min(width - 44, 280),
                            borderRadius: radius.card,
                            borderWidth: 1,
                            borderColor: c.goldMuted,
                          }}
                        />
                      </Pressable>
                      <Text
                        style={{
                          fontFamily: f.display,
                          fontSize: 15,
                          letterSpacing: 0.6,
                          color: c.gold,
                          textAlign: 'center',
                        }}
                      >
                        {standing.title.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: f.serifItalic,
                          fontSize: 14,
                          lineHeight: 20,
                          color: c.sepia,
                          textAlign: 'center',
                        }}
                      >
                        {`«\u00a0${standing.title.motto}\u00a0»`}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View>
              <SectionTitle
                label="LIENS PARTAGÉS"
                hint={member.links.length > 0 ? `${member.links.length}` : undefined}
              />
              {member.links.length > 0 ? (
                <SharedLinks links={member.links} />
              ) : (
                <Text
                  style={{
                    fontFamily: f.serifItalic,
                    fontSize: 15,
                    color: c.sepia,
                    paddingVertical: 14,
                  }}
                >
                  {isMe
                    ? 'Vous ne partagez encore aucun lien.'
                    : `${member.displayName} ne partage encore aucun lien.`}
                </Text>
              )}
            </View>

            {record ? (
              <>
                <CallsSection
                  record={record.calls}
                  points={standing?.calls ?? null}
                  year={year}
                  name={member.displayName}
                  isMe={isMe}
                  loading={calls.loading}
                />
                <OracleSection
                  record={record.oracle}
                  year={clubYear(club.now)}
                  isMe={isMe}
                  loading={club.loading}
                />
                <NightsSection record={record.nights} isMe={isMe} loading={nights.loading} />
              </>
            ) : null}

            {isMe ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/profile')}
                style={{
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderRadius: radius.button,
                  borderWidth: 1,
                  borderColor: c.borderLift,
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: c.gold,
                  }}
                >
                  MODIFIER MON PROFIL
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <TitlePoster
        title={posterOpen ? (standing?.title ?? null) : null}
        holders={standing?.holders ?? []}
        onClose={() => setPosterOpen(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

/** Calls affichés avant « voir tout » : un membre actif en publie des dizaines. */
const CALLS_PREVIEW = 5;

/** `+150`, `−200`, `0`. */
function CallsSection({
  record,
  points,
  year,
  name,
  isMe,
  loading,
}: {
  record: CallsRecord;
  points: MemberCallPoints | null;
  year: number;
  name: string;
  isMe: boolean;
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? record.calls : record.calls.slice(0, CALLS_PREVIEW);

  return (
    <View>
      <SectionTitle
        label="CALLS"
        hint={
          record.calls.length > 0
            ? `${record.open} EN COURS · ${record.closed} CLOS`
            : undefined
        }
      />
      {record.calls.length === 0 ? (
        <Empty>
          {loading
            ? 'Chargement…'
            : isMe
              ? 'Vous n’avez encore publié aucun call.'
              : `${name} n’a encore publié aucun call.`}
        </Empty>
      ) : (
        <>
          <StatBand
            stats={[
              { label: 'PERF MOY.', percent: record.averagePerf },
              { label: 'VS ₿ MOY.', percent: record.averageVsBtc, gold: true },
              {
                label: 'MEILLEUR',
                value: record.best ? record.best.symbol : '—',
                percent: record.best?.performancePercent ?? null,
              },
            ]}
          />
          {points ? (
            <Text
              style={{
                fontFamily: f.sans,
                fontSize: 11,
                lineHeight: 18,
                color: c.sepia,
                marginTop: 10,
              }}
            >
              {`Points des calls en ${year} : ${formatPoints(points.total)}${
                points.latent !== 0 ? `, dont ${formatPoints(points.latent)} encore en jeu` : ''
              } — comme auteur ${formatPoints(points.asAuthor)}, comme votant ${formatPoints(points.asVoter)}.`}
            </Text>
          ) : null}
          {shown.map((call) => {
            const cls = assetClassStyle[call.assetClass];
            return (
              <View
                key={call.id}
                className="flex-row items-center border-b border-hairline"
                style={{ gap: 12, paddingVertical: 11, paddingHorizontal: 2 }}
              >
                <View className="flex-1" style={{ gap: 3 }}>
                  <Text style={{ fontFamily: f.serif, fontSize: 16, color: c.ivory }}>
                    {call.symbol}
                  </Text>
                  <Micro size={8} tracking={1.2} style={{ color: cls.fg }}>
                    {call.closed ? `${call.assetClass} · CLÔTURÉ` : call.assetClass}
                  </Micro>
                </View>
                <View className="items-end" style={{ gap: 3 }}>
                  <Text
                    style={{
                      fontFamily: f.labelMed,
                      fontSize: 12,
                      color:
                        call.performancePercent === null
                          ? c.sepiaFaint
                          : perfColor(call.performancePercent),
                    }}
                  >
                    {call.performancePercent === null
                      ? '—'
                      : formatPercent(call.performancePercent)}
                  </Text>
                  <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted }}>
                    {call.vsBtcPercent === null
                      ? call.assetClass === 'BTC'
                        ? 'référentiel'
                        : '— vs ₿'
                      : `${formatPercent(call.vsBtcPercent, 0)} vs ₿`}
                  </Text>
                </View>
              </View>
            );
          })}
          {record.calls.length > CALLS_PREVIEW ? (
            <MoreToggle
              open={showAll}
              hidden={record.calls.length - CALLS_PREVIEW}
              onPress={() => setShowAll((all) => !all)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function OracleSection({
  record,
  year,
  isMe,
  loading,
}: {
  record: OracleRecord;
  year: number;
  isMe: boolean;
  loading: boolean;
}) {
  const row = record.year;
  return (
    <View>
      <SectionTitle
        label="ORACLE"
        hint={
          row ? `RANG ${toRoman(row.rank)} / ${record.rankedThisYear} · ${year}` : undefined
        }
      />
      {row ? (
        <StatBand
          stats={[
            { label: `POINTS ${year}`, value: formatInteger(row.points) },
            { label: 'PARIS JUGÉS', value: String(row.bets) },
            { label: 'JUSTESSE MOY.', value: `${Math.round(row.average)} %` },
          ]}
        />
      ) : (
        <Empty>
          {loading ? 'Chargement…' : `Aucun pari résolu en ${year}${isMe ? ' pour vous' : ''}.`}
        </Empty>
      )}
      <Text
        style={{
          fontFamily: f.sans,
          fontSize: 11,
          lineHeight: 18,
          color: c.sepia,
          marginTop: 10,
        }}
      >
        {[
          record.allTime
            ? `Depuis toujours : ${formatInteger(record.allTime.points)} points, meilleure justesse ${Math.round(record.allTime.best)} %.`
            : null,
          record.running.length > 0
            ? `Paris en cours : ${record.running.map((key) => horizonOf(key).long.toLowerCase()).join(', ')}.`
            : 'Aucun pari en cours.',
        ]
          .filter(Boolean)
          .join(' ')}
      </Text>
    </View>
  );
}

function NightsSection({
  record,
  isMe,
  loading,
}: {
  record: NightsRecord;
  isMe: boolean;
  loading: boolean;
}) {
  const presence =
    record.past === 0
      ? 'Aucune soirée passée pour l’instant.'
      : `${isMe ? 'Vous avez participé' : 'A participé'} à ${record.attended} soirée${record.attended > 1 ? 's' : ''} sur ${record.past}.`;
  const next = record.next
    ? `Prochaine : ${record.next.title} · ${formatClubDate(Date.parse(record.next.startsAt))}.`
    : 'Aucune inscription à une soirée à venir.';

  return (
    <View>
      <SectionTitle
        label="SOIRÉES"
        hint={record.past > 0 ? `${record.attended} / ${record.past}` : undefined}
      />
      {loading ? (
        <Empty>Chargement…</Empty>
      ) : (
        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 12,
            lineHeight: 19,
            color: c.parchment,
            paddingVertical: 12,
          }}
        >
          {`${presence} ${next}`}
        </Text>
      )}
    </View>
  );
}

interface StatSpec {
  label: string;
  /** Texte affiché ; à défaut, le pourcentage. */
  value?: string;
  percent?: number | null;
  /** L'étiquette en or : la colonne vs ₿, comme sur les cartes. */
  gold?: boolean;
}

/** La bande de trois chiffres des cartes de call, pour un résumé. */
function StatBand({ stats }: { stats: StatSpec[] }) {
  return (
    <View
      className="flex-row"
      style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline, marginTop: 8 }}
    >
      {stats.map((stat, index) => {
        const percent = stat.percent ?? null;
        return (
          <View
            key={stat.label}
            style={{
              flex: 1,
              paddingVertical: 11,
              ...(index > 0
                ? { borderLeftWidth: 1, borderLeftColor: c.hairline, paddingLeft: 12 }
                : null),
            }}
          >
            <Micro
              size={8}
              tracking={1.4}
              style={{ color: stat.gold ? c.goldMuted : c.sepiaMuted }}
            >
              {stat.label}
            </Micro>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: f.labelMed,
                fontSize: 12,
                marginTop: 5,
                color:
                  stat.value !== undefined && percent === null
                    ? c.bone
                    : percent === null
                      ? c.sepiaFaint
                      : perfColor(percent),
              }}
            >
              {stat.value !== undefined
                ? percent === null
                  ? stat.value
                  : `${stat.value} ${formatPercent(percent, 0)}`
                : percent === null
                  ? '—'
                  : formatPercent(percent)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MoreToggle({
  open,
  hidden,
  onPress,
}: {
  open: boolean;
  hidden: number;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: 12 }}>
      <Text style={{ fontFamily: f.labelMed, fontSize: 9, letterSpacing: 1.62, color: c.gold }}>
        {open ? 'RÉDUIRE' : `VOIR LES ${hidden} AUTRES`}
      </Text>
    </Pressable>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <Text
      style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.sepia, paddingVertical: 14 }}
    >
      {children}
    </Text>
  );
}
