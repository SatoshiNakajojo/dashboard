import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { canPropose, tallyLine, type VoteContext } from '@/features/nights/proposalRules';
import type { EventWithAttendance } from '@/features/nights/useEvents';
import { useProposals, type ProposalView } from '@/features/nights/useProposals';
import { useKeyboardFrame } from '@/hooks/useKeyboardFrame';
import { clubDateTimeParts } from '@/lib/clubTime';
import { a, c, f, goldButtonGradient, radius } from '@/theme/tokens';
import type { Member, ProposalChoice } from '@/types/domain';

export interface EventProposalsProps {
  /** La soirée, avec ses présents : ce sont eux qui votent. */
  event: EventWithAttendance;
  currentUserId: string | null;
  membersById: Map<string, Member>;
}

const LOCATION_MAX = 80;
const COMMENT_MIN = 3;
const COMMENT_MAX = 280;

/**
 * « Autre lieu ? » — les contre-propositions d'une soirée.
 *
 * Un membre qui ne peut pas venir là où la soirée est prévue propose un autre
 * lieu, avec sa raison ; les participants votent. À leur majorité — ou dès
 * que l'organisateur est d'accord —, la base déplace la soirée
 * (`event_proposal_settle`) ; à la majorité des contre, la proposition tombe.
 * Rien ne s'affiche tant qu'il n'y a ni proposition, ni possibilité d'en faire
 * une.
 */
export function EventProposals({ event, currentUserId, membersById }: EventProposalsProps) {
  const context = useMemo<VoteContext>(
    () => ({ attendeeIds: event.attendeeIds, organizerId: event.createdBy }),
    [event.attendeeIds, event.createdBy],
  );
  const state = useProposals(event.id, currentUserId, context);
  const [composing, setComposing] = useState(false);
  const allowed = canPropose(event, state.proposals, currentUserId);
  const open = state.proposals.filter((proposal) => proposal.status === 'open').length;

  if (!allowed && state.proposals.length === 0) return null;

  const nameOf = (userId: string) => membersById.get(userId)?.displayName ?? 'Un membre';

  return (
    <View style={{ marginBottom: 18 }}>
      <SectionTitle label="Autre lieu ?" hint={open > 0 ? `${open} EN VOTE` : undefined} />

      {state.proposals.map((proposal) => (
        <ProposalRow
          key={proposal.id}
          proposal={proposal}
          author={nameOf(proposal.userId)}
          mineAuthor={proposal.userId === currentUserId}
          organizer={event.createdBy !== null && event.createdBy === currentUserId}
          busy={state.busy}
          onVote={(choice) => void state.vote(proposal.id, choice)}
          onWithdraw={() => void state.withdraw(proposal.id)}
        />
      ))}

      {allowed ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setComposing(true)}
          style={{
            alignItems: 'center',
            paddingVertical: 11,
            marginTop: 10,
            borderRadius: radius.button,
            borderWidth: 1,
            borderColor: c.borderLift,
          }}
        >
          <Text
            style={{ fontFamily: f.labelMed, fontSize: 10, letterSpacing: 1.8, color: c.sepia }}
          >
            PROPOSER UN AUTRE LIEU
          </Text>
        </Pressable>
      ) : null}

      {state.error ? (
        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 11,
            lineHeight: 17,
            color: c.oxbloodMuted,
            marginTop: 8,
          }}
        >
          {state.error}
        </Text>
      ) : null}

      <ProposalSheet
        key={composing ? 'ouverte' : 'fermée'}
        visible={composing}
        currentLocation={event.location}
        busy={state.busy}
        error={state.error}
        onClose={() => setComposing(false)}
        onSubmit={async (location, comment) => {
          const sent = await state.propose(location, comment);
          if (sent) setComposing(false);
          return sent;
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function ProposalRow({
  proposal,
  author,
  mineAuthor,
  organizer,
  busy,
  onVote,
  onWithdraw,
}: {
  proposal: ProposalView;
  author: string;
  mineAuthor: boolean;
  /** Je suis l'organisateur : mon « pour » suffit. */
  organizer: boolean;
  busy: boolean;
  onVote: (choice: ProposalChoice | null) => void;
  onWithdraw: () => void;
}) {
  const decidedOn = proposal.decidedAt
    ? clubDateTimeParts(proposal.decidedAt)?.date.slice(0, 5)
    : null;

  if (proposal.status !== 'open') {
    const adopted = proposal.status === 'adopted';
    return (
      <View
        style={{
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.hairline,
          gap: 3,
        }}
      >
        <Micro size={8} tracking={1.4} style={{ color: adopted ? c.sage : c.sepiaFaint }}>
          {adopted
            ? `LIEU CHANGÉ PAR VOTE LE ${decidedOn ?? '—'}`
            : `REJETÉE LE ${decidedOn ?? '—'}`}
        </Micro>
        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 12,
            lineHeight: 18,
            color: adopted ? c.parchment : c.sepiaFaint,
          }}
        >
          {`${proposal.location} — proposé par ${author} · ${proposal.tally.for} pour, ${proposal.tally.against} contre`}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.hairline,
        gap: 6,
      }}
    >
      <Micro size={8} tracking={1.4} style={{ color: c.goldMuted }}>
        {mineAuthor ? 'VOUS PROPOSEZ' : `${author.toLocaleUpperCase('fr')} PROPOSE`}
      </Micro>
      <Text style={{ fontFamily: f.serif, fontSize: 18, lineHeight: 22, color: c.ivory }}>
        {proposal.location}
      </Text>
      <Text style={{ fontFamily: f.serifItalic, fontSize: 14, lineHeight: 20, color: c.sepia }}>
        {`« ${proposal.comment} »`}
      </Text>
      <Micro size={8} tracking={1.2} style={{ color: c.sepiaMuted }}>
        {tallyLine(proposal.tally)}
      </Micro>

      {mineAuthor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retirer ma proposition : ${proposal.location}`}
          disabled={busy}
          onPress={onWithdraw}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', marginTop: 2 }}
        >
          <Micro size={8.5} tracking={1.6} style={{ color: c.oxbloodMuted }}>
            RETIRER MA PROPOSITION
          </Micro>
        </Pressable>
      ) : proposal.canVote ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          {organizer ? (
            <Text style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 16, color: c.sepia }}>
              Vous organisez : votre accord suffit à changer de lieu.
            </Text>
          ) : null}
          <View className="flex-row" style={{ gap: 8 }}>
            {(['for', 'against'] as const).map((choice) => {
              const on = proposal.mine === choice;
              const tone = choice === 'for' ? c.sage : c.oxblood;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityLabel={
                    choice === 'for'
                      ? `Pour : aller à ${proposal.location}`
                      : 'Contre : garder le lieu actuel'
                  }
                  disabled={busy}
                  // Retoucher son choix le retire : on peut s'abstenir.
                  onPress={() => onVote(on ? null : choice)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 9,
                    borderRadius: radius.button,
                    borderWidth: 1,
                    borderColor: on ? tone : c.borderLift,
                    backgroundColor: on
                      ? choice === 'for'
                        ? a.rsvpSageBg
                        : 'transparent'
                      : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: f.labelMed,
                      fontSize: 9.5,
                      letterSpacing: 1.6,
                      color: on ? tone : c.sepiaMuted,
                    }}
                  >
                    {choice === 'for' ? 'POUR CE LIEU' : 'GARDER L’ACTUEL'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 16, color: c.sepiaMuted }}>
          Seuls les participants votent : dites « Je viens » pour donner votre avis.
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

function ProposalSheet({
  visible,
  currentLocation,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  currentLocation: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (location: string, comment: string) => Promise<boolean>;
}) {
  const [location, setLocation] = useState('');
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const keyboard = useKeyboardFrame();

  const same =
    location.trim().toLocaleLowerCase('fr') === currentLocation.trim().toLocaleLowerCase('fr');
  const blocked =
    location.trim().length === 0
      ? 'Le lieu que vous proposez.'
      : same
        ? 'C’est déjà le lieu de la soirée.'
        : comment.trim().length < COMMENT_MIN
          ? 'Une phrase pour dire pourquoi.'
          : null;
  const shownError = tried && !busy ? error : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={keyboard.frame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <BlurView intensity={18} tint="dark" style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: a.scrim }} />
          </BlurView>
        </Pressable>

        <View
          style={{
            backgroundColor: c.sheet,
            borderTopWidth: 1,
            borderTopColor: c.borderSheet,
            borderTopLeftRadius: radius.sheetTop,
            borderTopRightRadius: radius.sheetTop,
            borderBottomLeftRadius: radius.sheetBottom,
            borderBottomRightRadius: radius.sheetBottom,
            paddingTop: 16,
            paddingHorizontal: 22,
            paddingBottom: 28,
            gap: 16,
            ...keyboard.sheet,
          }}
        >
          <View
            style={{
              width: 34,
              height: 2,
              backgroundColor: c.borderSheet,
              alignSelf: 'center',
            }}
          />
          <View className="flex-row items-baseline justify-between">
            <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.ivory }}>
              Proposer un autre lieu
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: c.sepiaMuted,
                }}
              >
                FERMER
              </Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            <Text
              style={{
                fontFamily: f.serifItalic,
                fontSize: 14,
                lineHeight: 20,
                color: c.sepia,
              }}
            >
              {`Prévu actuellement : ${currentLocation}.`}
            </Text>

            <View>
              <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                NOUVEAU LIEU
              </Micro>
              <TextInput
                value={location}
                onChangeText={setLocation}
                maxLength={LOCATION_MAX}
                placeholder="Chez moi — Anse Vata"
                placeholderTextColor={c.sepiaFaint}
                accessibilityLabel="Nouveau lieu"
                style={{
                  fontFamily: f.sans,
                  fontSize: 15,
                  color: c.parchment,
                  marginTop: 7,
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: c.hairline,
                }}
              />
            </View>

            <View>
              <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                {`POURQUOI · ${COMMENT_MAX - comment.length} SIGNES RESTANTS`}
              </Micro>
              <TextInput
                value={comment}
                onChangeText={setComment}
                maxLength={COMMENT_MAX}
                multiline
                placeholder="Je garde mes enfants ce soir-là : on peut le faire chez moi."
                placeholderTextColor={c.sepiaFaint}
                accessibilityLabel="Pourquoi ce lieu"
                style={{
                  fontFamily: f.serifItalic,
                  fontSize: 15,
                  lineHeight: 23,
                  color: c.parchment,
                  marginTop: 8,
                  padding: 0,
                  minHeight: 46,
                }}
              />
            </View>

            <Text
              style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 17, color: c.sepiaMuted }}
            >
              {
                'Votent les participants de la soirée, et vous votez pour d’office. À la majorité des pour — ou avec l’accord de l’organisateur —, la soirée change de lieu ; à la majorité des contre, la proposition tombe.'
              }
            </Text>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked !== null || busy, busy }}
            disabled={blocked !== null || busy}
            onPress={() => {
              setTried(true);
              void onSubmit(location, comment);
            }}
            style={{ opacity: blocked === null && !busy ? 1 : 0.45 }}
          >
            <LinearGradient
              colors={[...goldButtonGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ alignItems: 'center', paddingVertical: 14, borderRadius: radius.button }}
            >
              <Text
                style={{
                  fontFamily: f.labelSemi,
                  fontSize: 10,
                  letterSpacing: 2.4,
                  color: c.onGold,
                }}
              >
                {busy ? 'ENVOI…' : 'SOUMETTRE AU VOTE'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: shownError ? c.oxblood : c.sepia,
              textAlign: 'center',
            }}
          >
            {shownError ?? blocked ?? 'Tout le club verra votre proposition et sa raison.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
