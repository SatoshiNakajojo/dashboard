import { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ClubPodium } from '@/components/ClubPodium';
import { ClubStandings } from '@/components/ClubStandings';
import { PeriodTab } from '@/components/OracleStandings';
import { ScoreTable } from '@/components/ScoreTable';
import { ScreenShell } from '@/components/ScreenShell';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { pointLines } from '@/features/bag/callPoints';
import { useCalls } from '@/features/bag/useCalls';
import { clubStandings } from '@/features/club/clubStandings';
import { clubYear } from '@/features/oracle/standings';
import { useClubBets } from '@/features/oracle/useClubBets';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { a, c, f } from '@/theme/tokens';

/**
 * Onglet Classement — qui détient la vérité, qui finance les autres.
 *
 * Les points des calls (auteur et votants) et ceux de l'Oracle, additionnés :
 * le podium, le classement complet avec les titres du club, et le barème —
 * pour que chacun sache comment on gagne et comment on perd.
 *
 * Les données sont lues à chaque visite de l'onglet plutôt qu'en temps réel :
 * les onglets Calls et Oracle tiennent déjà leurs canaux, et un classement n'a
 * pas à bouger sous les yeux.
 */
export default function ClassementScreen() {
  const { userId } = useSession();
  const { members, byId, loading: membersLoading } = useMembers();

  // Chaque retour sur l'onglet relit calls, votes et paris. La première
  // visite n'a rien à relire : le montage vient de tout charger.
  const [revision, setRevision] = useState(0);
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (visited.current) setRevision((value) => value + 1);
      visited.current = true;
    }, []),
  );

  const calls = useCalls(userId, byId, revision);
  const club = useClubBets(byId, revision);

  const currentYear = clubYear(club.now);
  /** L'année du classement ; `null` : depuis toujours. */
  const [year, setYear] = useState<number | null>(currentYear);

  const lines = useMemo(() => pointLines(calls.calls, club.now), [calls.calls, club.now]);
  const rows = useMemo(
    () => clubStandings(members, lines, club.history, year),
    [members, lines, club.history, year],
  );

  const loading = membersLoading || calls.loading || club.loading;
  const error = calls.error ?? club.error;
  const me = userId ? (byId.get(userId) ?? null) : null;

  return (
    <ScreenShell
      overline={`Calls et Oracle · ${year === null ? 'depuis toujours' : year}`}
      title="Classement"
      me={me}
    >
      <View style={{ gap: 30 }}>
        <View className="flex-row" style={{ gap: 18 }}>
          <PeriodTab
            label={String(currentYear)}
            active={year === currentYear}
            onPress={() => setYear(currentYear)}
          />
          <PeriodTab
            label="DEPUIS TOUJOURS"
            active={year === null}
            onPress={() => setYear(null)}
          />
        </View>

        {loading ? (
          <Text style={{ fontFamily: f.serifItalic, fontSize: 16, color: c.sepia }}>
            Chargement du classement…
          </Text>
        ) : (
          <ClubPodium rows={rows} />
        )}

        <View>
          <SectionTitle
            label="LE CLASSEMENT"
            labelColor={c.goldMuted}
            gradientFrom={a.fameRule}
            hint={rows.length > 0 ? `${rows.length} MEMBRES` : undefined}
          />
          <ClubStandings rows={loading ? [] : rows} loading={loading} meId={userId} />
          {error ? (
            <Text
              style={{ fontFamily: f.sans, fontSize: 11, color: c.oxbloodMuted, marginTop: 10 }}
            >
              {error}
            </Text>
          ) : null}
        </View>

        <View>
          <SectionTitle label="LE BARÈME" labelColor={c.goldMuted} gradientFrom={a.fameRule} />
          <ScoreTable />
        </View>
      </View>
    </ScreenShell>
  );
}
