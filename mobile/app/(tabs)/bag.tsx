import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CallCard } from '@/components/CallCard';
import { ComposerSheet, type CallDraft } from '@/components/ComposerSheet';
import { Fab } from '@/components/Fab';
import { LeaderboardRow } from '@/components/LeaderboardRow';
import { ScreenShell } from '@/components/ScreenShell';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useCalls } from '@/features/bag/useCalls';
import { useBtcSpot } from '@/hooks/useBtcMarket';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { MOCK_FAME, MOCK_REKT } from '@/mocks/calls';
import {
  HALL_OF_FAME_THRESHOLD_VS_BTC,
  rektFace,
  romanRank,
} from '@/lib/performance';
import { a, c, f, radius } from '@/theme/tokens';
import type { Member } from '@/types/domain';

type BagView = 'bag' | 'rekt';

/** Onglet Le Bag — fil des calls et classements de la saison. */
export default function BagScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const { spot } = useBtcSpot();
  const { calls, loading, error, vote } = useCalls(userId, byId);

  const [view, setView] = useState<BagView>('bag');
  const [composerOpen, setComposerOpen] = useState(false);

  const me = userId ? (byId.get(userId) ?? null) : null;
  const isBag = view === 'bag';

  const publish = (draft: CallDraft) => {
    // L'écriture réelle passe par `tickers` ; le composer se referme dans tous
    // les cas, la carte apparaîtra au prochain chargement du fil.
    void draft;
    setComposerOpen(false);
  };

  return (
    <>
      <ScreenShell
        overline={isBag ? 'Calls en cours · perf vs ₿' : 'Classement vs bitcoin · saison III'}
        title={isBag ? 'Le Bag' : 'Rekt Board'}
        me={me}
      >
        <View
          className="flex-row border-b border-border"
          style={{ gap: 26, marginBottom: 20 }}
        >
          <ViewTab label="Le Bag" active={isBag} onPress={() => setView('bag')} />
          <ViewTab label="Rekt Board" active={!isBag} onPress={() => setView('rekt')} />
        </View>

        {isBag ? (
          <View style={{ gap: 16 }}>
            {loading ? <CallSkeleton /> : null}
            {!loading && error ? (
              <Text style={{ fontFamily: f.sans, fontSize: 12, color: c.oxbloodMuted }}>
                {error}
              </Text>
            ) : null}
            {!loading && !error && calls.length === 0 ? (
              <Empty message="Aucun call ce mois-ci" />
            ) : (
              calls.map((call) => <CallCard key={call.id} call={call} onVote={vote} />)
            )}
          </View>
        ) : (
          <Leaderboards membersById={byId} />
        )}
      </ScreenShell>

      {/* Le FAB n'apparaît que sur la vue Bag, et disparaît sheet ouverte. */}
      {isBag && !composerOpen ? <Fab onPress={() => setComposerOpen(true)} /> : null}

      <ComposerSheet
        visible={composerOpen}
        spotPrice={spot.usd}
        onClose={() => setComposerOpen(false)}
        onPublish={publish}
      />
    </>
  );
}

function ViewTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingBottom: 11,
        marginBottom: -1,
        borderBottomWidth: 1,
        borderBottomColor: active ? c.gold : 'transparent',
      }}
    >
      <Text style={{ fontFamily: f.serif, fontSize: 15, color: active ? c.ivory : c.sepiaMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Leaderboards({ membersById }: { membersById: Map<string, Member> }) {
  const fallback: Member = { id: '', displayName: 'Membre', initials: '··', color: c.sepia };

  return (
    <View style={{ gap: 26 }}>
      <View>
        <SectionTitle
          label="HALL OF FAME"
          labelColor={c.goldMuted}
          gradientFrom={a.fameRule}
          hint={`≥ +${HALL_OF_FAME_THRESHOLD_VS_BTC} % VS ₿`}
        />
        {MOCK_FAME.map((entry, index) => (
          <LeaderboardRow
            key={`${entry.memberId}-${entry.symbol}`}
            marker={romanRank(index)}
            member={membersById.get(entry.memberId) ?? fallback}
            symbol={entry.symbol}
            note={entry.note}
            percent={entry.percent}
            variant="fame"
          />
        ))}
      </View>

      <View>
        <SectionTitle
          label="REKT BOARD"
          labelColor={c.oxbloodMuted}
          gradientFrom={a.rektRule}
          hint="R.I.P."
        />
        {MOCK_REKT.map((entry, index) => (
          <LeaderboardRow
            key={`${entry.memberId}-${entry.symbol}`}
            marker={rektFace(index)}
            member={membersById.get(entry.memberId) ?? fallback}
            symbol={entry.symbol}
            note={entry.note}
            percent={entry.percent}
            variant="rekt"
          />
        ))}

        <View
          style={{
            marginTop: 16,
            padding: 14,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: c.borderLift,
            borderRadius: radius.card,
          }}
        >
          <Text
            style={{ fontFamily: f.serifItalic, fontSize: 13, lineHeight: 21, color: c.sepia }}
          >
            Gage du mois — le dernier du board apporte les vins de la prochaine Crypto Night.
          </Text>
        </View>
      </View>
    </View>
  );
}

function CallSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          className="bg-surface border border-border"
          style={{ height: 210, borderRadius: 4 }}
        />
      ))}
    </View>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 15,
        color: c.sepia,
        textAlign: 'center',
        paddingVertical: 40,
      }}
    >
      {message}
    </Text>
  );
}
