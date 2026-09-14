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
import {
  HALL_OF_FAME_LABEL,
  LEADERBOARD,
  rektFace,
  romanRank,
  splitLeaderboards,
} from '@/lib/performance';
import { formatPercent } from '@/lib/format';
import { a, c, f, radius } from '@/theme/tokens';
import type { CallView } from '@/types/domain';

type BagView = 'bag' | 'rekt';

/** Onglet Le Bag — fil des calls et classements de la saison. */
export default function BagScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const { spot } = useBtcSpot();
  const { calls, loading, error, vote, publish, publishing } = useCalls(userId, byId);

  const [view, setView] = useState<BagView>('bag');
  const [composerOpen, setComposerOpen] = useState(false);

  const me = userId ? (byId.get(userId) ?? null) : null;
  const isBag = view === 'bag';

  const handlePublish = async (draft: CallDraft) => {
    const sent = await publish(draft);
    // La sheet ne se referme que si le call est parti : sur échec, la saisie
    // reste à l'écran avec le message d'erreur.
    if (sent) setComposerOpen(false);
    return sent;
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
          <Leaderboards calls={calls} loading={loading} />
        )}
      </ScreenShell>

      {/* Le FAB n'apparaît que sur la vue Bag, et disparaît sheet ouverte. */}
      {isBag && !composerOpen ? <Fab onPress={() => setComposerOpen(true)} /> : null}

      <ComposerSheet
        visible={composerOpen}
        spotPrice={spot.usd}
        publishing={publishing}
        onClose={() => setComposerOpen(false)}
        onPublish={handlePublish}
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

function Leaderboards({ calls, loading }: { calls: CallView[]; loading: boolean }) {
  // Les deux tableaux sortent du même jeu de calls : ce sont les seuils qui les
  // séparent, pas deux sources de données (`src/lib/performance.ts`).
  const { fame, rekt } = splitLeaderboards(calls);

  return (
    <View style={{ gap: 26 }}>
      <View>
        <SectionTitle
          label="HALL OF FAME"
          labelColor={c.goldMuted}
          gradientFrom={a.fameRule}
          hint={HALL_OF_FAME_LABEL}
        />
        {fame.length === 0 ? (
          <BoardEmpty
            loading={loading}
            message={
              LEADERBOARD.reference === 'vsBtc'
                ? `Personne n’a encore battu ₿ de ${LEADERBOARD.fameThreshold} %`
                : `Aucun call à +${LEADERBOARD.fameThreshold} % cette saison`
            }
          />
        ) : (
          fame.map((call, index) => (
            <LeaderboardRow
              key={call.id}
              marker={romanRank(index)}
              member={call.author}
              symbol={call.symbol}
              note={boardNote(call)}
              // Le grand chiffre est toujours la perf en dollars, comme dans le
              // design ; la perf vs ₿ vit dans la sous-ligne.
              percent={call.performancePercent ?? 0}
              variant="fame"
            />
          ))
        )}
      </View>

      <View>
        <SectionTitle
          label="REKT BOARD"
          labelColor={c.oxbloodMuted}
          gradientFrom={a.rektRule}
          hint="R.I.P."
        />
        {rekt.length === 0 ? (
          <BoardEmpty loading={loading} message="Personne n’est rekt ce mois-ci" />
        ) : (
          rekt.map((call, index) => (
            <LeaderboardRow
              key={call.id}
              marker={rektFace(index)}
              member={call.author}
              symbol={call.symbol}
              note={boardNote(call)}
              percent={call.performancePercent ?? 0}
              variant="rekt"
            />
          ))
        )}

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

/** Sous-ligne d'un classement : la perf vs ₿, ou la thèse à défaut. */
function boardNote(call: CallView): string {
  if (call.vsBtcPercent !== null) return `${formatPercent(call.vsBtcPercent, 0)} vs ₿`;
  if (call.assetClass === 'BTC') return 'le référentiel';
  return 'cours indisponible';
}

function BoardEmpty({ loading, message }: { loading: boolean; message: string }) {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 15,
        color: c.sepia,
        paddingVertical: 22,
      }}
    >
      {loading ? '…' : message}
    </Text>
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
