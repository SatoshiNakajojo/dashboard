import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { formatLeft } from '@/lib/format';
import { a, c, f, goldButtonGradient, radius } from '@/theme/tokens';
import type { CallView, Vote } from '@/types/domain';

/** La même limite que la contrainte `ticker_votes_reason_length`. */
const REASON_MAX = 140;
const REASON_MIN = 3;

export interface VoteSheetProps {
  /** Le call et le camp choisi au toucher. `null` : feuille fermée. */
  target: { call: CallView; side: Vote } | null;
  /** Mon vote actuel sur ce call, s'il y en a un. */
  current: { side: Vote; reason: string | null } | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (vote: { side: Vote; reason: string }) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}

/**
 * Bottom sheet « Voter » : bull ou bear, et la phrase qui l'explique.
 *
 * Le camp touché sur la carte est présélectionné, mais se change ici. La phrase
 * est obligatoire — la base la refuse vide — et c'est elle qu'on lira sous la
 * carte : un vote sans raison n'apprend rien au club.
 *
 * L'état s'initialise à partir du vote existant : le parent remonte la feuille
 * avec une `key` par call.
 */
export function VoteSheet({
  target,
  current,
  busy = false,
  error = null,
  onClose,
  onSubmit,
  onRemove,
}: VoteSheetProps) {
  const [side, setSide] = useState<Vote>(target?.side ?? 'bull');
  const [reason, setReason] = useState(current?.reason ?? '');
  const [tried, setTried] = useState(false);

  const call = target?.call ?? null;
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= REASON_MIN && !busy;
  const shownError = tried && !busy ? error : null;
  const left = call?.votesLeftMs ?? 0;

  const submit = async () => {
    setTried(true);
    await onSubmit({ side, reason: trimmed });
  };

  return (
    <Modal visible={call !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
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
              {call ? `Voter sur ${call.symbol}` : 'Voter'}
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

          {call ? (
            <Text
              numberOfLines={3}
              style={{
                fontFamily: f.serifItalic,
                fontSize: 14,
                lineHeight: 20,
                color: c.sepia,
              }}
            >
              {`${call.author.displayName} : « ${call.thesis} »`}
            </Text>
          ) : null}

          <View className="flex-row" style={{ gap: 10 }}>
            {(['bull', 'bear'] as const).map((option) => {
              const on = side === option;
              const tone = option === 'bull' ? c.sage : c.oxblood;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => setSide(option)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 11,
                    borderRadius: radius.button,
                    borderWidth: 1,
                    borderColor: on ? tone : c.borderLift,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: f.labelMed,
                      fontSize: 10,
                      letterSpacing: 1.8,
                      color: on ? tone : c.sepiaMuted,
                    }}
                  >
                    {option === 'bull' ? 'BULL — J’Y CROIS' : 'BEAR — PAS DU TOUT'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View>
            <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
              {`POURQUOI · ${REASON_MAX - reason.length} SIGNES RESTANTS`}
            </Micro>
            <TextInput
              value={reason}
              onChangeText={setReason}
              maxLength={REASON_MAX}
              multiline
              accessibilityLabel="Pourquoi ce vote"
              placeholder={
                side === 'bull'
                  ? 'En une phrase : pourquoi vous y croyez.'
                  : 'En une phrase : pourquoi vous n’y croyez pas.'
              }
              placeholderTextColor={c.sepiaFaint}
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
            {`Un votant prend la moitié des points de l’auteur : le bull gagne si le call monte et perd s’il baisse, le bear l’inverse. Barème complet dans l’onglet Classement. ${
              left > 0 ? `Votes ouverts encore ${formatLeft(left)}.` : 'Votes clos.'
            }`}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit, busy }}
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={{ opacity: canSubmit ? 1 : 0.45 }}
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
                {busy ? 'ENREGISTREMENT…' : side === 'bull' ? 'VOTER BULL' : 'VOTER BEAR'}
              </Text>
            </LinearGradient>
          </Pressable>

          {current ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTried(true);
                void onRemove();
              }}
              disabled={busy}
              hitSlop={8}
              style={{ alignSelf: 'center' }}
            >
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: c.oxbloodMuted,
                }}
              >
                RETIRER MON VOTE
              </Text>
            </Pressable>
          ) : null}

          {shownError || trimmed.length < REASON_MIN ? (
            <Text
              style={{
                fontFamily: f.sans,
                fontSize: 10,
                lineHeight: 16,
                color: shownError ? c.oxblood : c.sepia,
                textAlign: 'center',
              }}
            >
              {shownError ?? 'Une phrase, même courte : c’est elle que le club lira.'}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
