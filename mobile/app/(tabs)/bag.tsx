import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CallCard } from '@/components/CallCard';
import { CloseCallSheet } from '@/components/CloseCallSheet';
import { ClubStandings } from '@/components/ClubStandings';
import { VoteSheet } from '@/components/VoteSheet';
import { pointLines } from '@/features/bag/callPoints';
import { clubStandings } from '@/features/club/clubStandings';
import { clubYear } from '@/features/oracle/standings';
import { useClubBets } from '@/features/oracle/useClubBets';
import { ComposerSheet, type CallDraft } from '@/components/ComposerSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Fab } from '@/components/Fab';
import { LeaderboardRow } from '@/components/LeaderboardRow';
import { ScreenShell } from '@/components/ScreenShell';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useCalls } from '@/features/bag/useCalls';
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
import { seasonAt } from '@/lib/season';
import { a, c, f, radius } from '@/theme/tokens';
import type { CallView, Member, Vote } from '@/types/domain';

type BagView = 'bag' | 'closed' | 'rekt';

/** Onglet Calls — fil des calls et classements de la saison. */
export default function BagScreen() {
  const { userId } = useSession();
  const { members, byId } = useMembers();
  const {
    calls,
    loading,
    error,
    vote,
    voting,
    publish,
    edit,
    remove,
    close,
    reopen,
    publishing,
  } = useCalls(userId, byId);

  const [view, setView] = useState<BagView>('bag');
  const [composerOpen, setComposerOpen] = useState(false);
  /** Le call en cours de correction — la feuille s'ouvre alors en « modifier ». */
  const [editing, setEditing] = useState<CallView | null>(null);
  /** Le call dont on demande la suppression. */
  const [deleting, setDeleting] = useState<CallView | null>(null);
  /** Le call qu'on clôture, ou dont on corrige la sortie. */
  const [closing, setClosing] = useState<CallView | null>(null);
  /** Le call dont on demande la réouverture. */
  const [reopening, setReopening] = useState<CallView | null>(null);

  // Stables : `CallCard` est mémoïsée, et une fonction neuve à chaque rendu
  // redessinerait toutes les cartes.
  const startEdit = useCallback((call: CallView) => setEditing(call), []);
  const askDelete = useCallback((call: CallView) => setDeleting(call), []);
  const startClose = useCallback((call: CallView) => setClosing(call), []);
  /** Le vote en cours de rédaction : le call, et le camp touché sur la carte. */
  const [voteTarget, setVoteTarget] = useState<{ call: CallView; side: Vote } | null>(null);
  const startVote = useCallback(
    (call: CallView, side: Vote) => setVoteTarget({ call, side }),
    [],
  );
  const myVoteOn = voteTarget?.call.voters.find((v) => v.userId === userId) ?? null;

  const closeSheet = () => {
    setComposerOpen(false);
    setEditing(null);
  };

  const me = userId ? (byId.get(userId) ?? null) : null;
  const isBag = view === 'bag';
  const isRekt = view === 'rekt';
  // Le fil se partage entre ce qui court encore et ce qui est réalisé ; les
  // classements, eux, prennent tout.
  const shown = calls.filter((call) => call.closed === (view === 'closed'));

  const handlePublish = async (draft: CallDraft) => {
    const sent = editing
      ? await edit(editing.id, {
          entryPrice: draft.entryPrice,
          entryDate: draft.entryDate,
          thesis: draft.thesis,
        })
      : await publish(draft);
    // La sheet ne se referme que si le call est parti : sur échec, la saisie
    // reste à l'écran avec le message d'erreur.
    if (sent) closeSheet();
    return sent;
  };

  return (
    <>
      <ScreenShell
        overline={
          isBag
            ? 'Calls en cours · perf vs ₿'
            : isRekt
              ? `Calls et Oracle · saison ${seasonAt().roman}`
              : 'Positions closes · perf réalisée'
        }
        title={isBag ? 'Les Calls' : isRekt ? 'Classement' : 'Clôturés'}
        me={me}
      >
        <View className="flex-row border-b border-border" style={{ gap: 26, marginBottom: 20 }}>
          <ViewTab label="En cours" active={isBag} onPress={() => setView('bag')} />
          <ViewTab
            label="Clôturés"
            active={view === 'closed'}
            onPress={() => setView('closed')}
          />
          <ViewTab label="Classement" active={isRekt} onPress={() => setView('rekt')} />
        </View>

        {!isRekt ? (
          <View style={{ gap: 16 }}>
            {loading ? <CallSkeleton /> : null}
            {!loading && error ? (
              <Text style={{ fontFamily: f.sans, fontSize: 12, color: c.oxbloodMuted }}>
                {error}
              </Text>
            ) : null}
            {!loading && !error && shown.length === 0 ? (
              <Empty
                message={isBag ? 'Aucun call en cours' : 'Aucune position close pour l’instant'}
              />
            ) : (
              shown.map((call) => {
                // On ne corrige ni ne supprime que ses propres calls ; la base
                // le vérifie aussi (RLS).
                const mine = call.userId === userId;
                return (
                  <CallCard
                    key={call.id}
                    call={call}
                    membersById={byId}
                    // On vote sur le call d'un autre, dans sa fenêtre ; la
                    // base le vérifie aussi (`ticker_votes_guard`).
                    onVote={!mine && userId && call.votesOpen ? startVote : undefined}
                    onEdit={mine ? startEdit : undefined}
                    onDelete={mine ? askDelete : undefined}
                    onCloseCall={mine ? startClose : undefined}
                  />
                );
              })
            )}
          </View>
        ) : (
          <Leaderboards calls={calls} loading={loading} members={members} byId={byId} />
        )}
      </ScreenShell>

      {/* Le FAB n'apparaît que sur la vue Bag, et disparaît sheet ouverte. */}
      {isBag && !composerOpen && !editing && !closing ? (
        <Fab label="Poster un call" onPress={() => setComposerOpen(true)} />
      ) : null}

      <ComposerSheet
        // Une feuille neuve par call corrigé : son état s'initialise à partir
        // du call, sans effet de recopie.
        key={editing?.id ?? 'nouveau'}
        visible={composerOpen || editing !== null}
        editing={editing}
        publishing={publishing}
        error={error}
        onClose={closeSheet}
        onPublish={handlePublish}
      />

      <CloseCallSheet
        key={closing?.id ?? 'aucun'}
        call={closing}
        busy={publishing}
        error={error}
        onClose={() => setClosing(null)}
        onSubmit={async (input) => {
          const target = closing;
          if (!target) return false;
          const done = await close(target.id, input);
          if (done) setClosing(null);
          return done;
        }}
        onReopen={
          closing?.closed
            ? () => {
                setReopening(closing);
                setClosing(null);
              }
            : undefined
        }
      />

      <VoteSheet
        // Une feuille neuve par call : elle s'initialise sur mon vote existant.
        key={voteTarget ? `${voteTarget.call.id}-${voteTarget.side}` : 'aucun'}
        target={voteTarget}
        current={myVoteOn ? { side: myVoteOn.side, reason: myVoteOn.reason } : null}
        busy={voting}
        error={error}
        onClose={() => setVoteTarget(null)}
        onSubmit={async (next) => {
          const target = voteTarget;
          if (!target) return false;
          const done = await vote(target.call.id, next);
          if (done) setVoteTarget(null);
          return done;
        }}
        onRemove={async () => {
          const target = voteTarget;
          if (!target) return false;
          const done = await vote(target.call.id, null);
          if (done) setVoteTarget(null);
          return done;
        }}
      />

      <ConfirmDialog
        visible={reopening !== null}
        title="Rouvrir ce call ?"
        message={`La sortie de ${reopening?.symbol ?? ''} est effacée : la perf repart avec le cours du moment, et la carte indiquera « modifié ».`}
        confirmLabel="ROUVRIR"
        onCancel={() => setReopening(null)}
        onConfirm={() => {
          const target = reopening;
          setReopening(null);
          if (target) void reopen(target.id);
        }}
      />

      <ConfirmDialog
        visible={deleting !== null}
        title="Supprimer ce call ?"
        message={`${deleting?.symbol ?? ''} disparaît du fil et des classements, avec ses votes. Impossible de revenir en arrière.`}
        confirmLabel="SUPPRIMER"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void remove(target.id);
        }}
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
      <Text
        style={{ fontFamily: f.serif, fontSize: 15, color: active ? c.ivory : c.sepiaMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Leaderboards({
  calls,
  loading,
  members,
  byId,
}: {
  calls: CallView[];
  loading: boolean;
  members: Member[];
  byId: Map<string, Member>;
}) {
  // Les deux tableaux sortent du même jeu de calls : ce sont les seuils qui les
  // séparent, pas deux sources de données (`src/lib/performance.ts`).
  const { fame, rekt } = splitLeaderboards(calls);

  // Le classement du club : les points des calls, et ceux de l'Oracle, jugés
  // comme dans son onglet (`useJudgedHistory`).
  const club = useClubBets(byId);
  const currentYear = clubYear(club.now);
  const [year, setYear] = useState<number | null>(currentYear);
  const lines = useMemo(() => pointLines(calls, club.now), [calls, club.now]);
  const rows = useMemo(
    () => clubStandings(members, lines, club.history, year),
    [members, lines, club.history, year],
  );

  return (
    <View style={{ gap: 26 }}>
      <ClubStandings
        rows={rows}
        year={year}
        currentYear={currentYear}
        onYearChange={setYear}
        loading={loading || club.loading}
      />

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
