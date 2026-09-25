import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MemberAvatar } from '@/components/MemberAvatar';
import { Micro } from '@/components/ui/Micro';
import { isoToClubDate } from '@/lib/btcAtDate';
import { callStakes } from '@/features/bag/callPoints';
import { myVoteStatus } from '@/features/bag/voteEdit';
import {
  formatLeft,
  formatPercent,
  formatPrice,
  formatRelative,
  formatSize,
} from '@/lib/format';
import { assetClassStyle, c, cardGradient, f, perfColor, radius } from '@/theme/tokens';
import type { CallView, Member, Vote } from '@/types/domain';

export interface CallCardProps {
  call: CallView;
  /**
   * Toucher BULL ou BEAR ouvre la feuille de vote. Absent : on ne peut pas
   * voter — son propre call, fenêtre fermée, call clos.
   */
  onVote?: (call: CallView, side: Vote) => void;
  /** Pour nommer les votants sous la carte. */
  membersById: Map<string, Member>;
  /** Présents seulement sur mes calls : on ne corrige ni ne supprime celui d'un autre. */
  onEdit?: (call: CallView) => void;
  onDelete?: (call: CallView) => void;
  /** Clôturer — ou, sur un call clos, corriger sa sortie. Mes calls seulement. */
  onCloseCall?: (call: CallView) => void;
}

/** Carte d'un call : auteur, thèse, bande de stats, votes. */
export const CallCard = memo(function CallCard({
  call,
  onVote,
  membersById,
  onEdit,
  onDelete,
  onCloseCall,
}: CallCardProps) {
  const cls = assetClassStyle[call.assetClass];
  const [showReasons, setShowReasons] = useState(false);
  const stakes = callStakes(call);
  const myVote = call.myVote;
  const voteStatus = myVoteStatus(myVote, call.votesOpen);

  return (
    <LinearGradient
      colors={[...cardGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ borderRadius: radius.card, borderWidth: 1, borderColor: c.border, padding: 16 }}
    >
      <View className="flex-row items-center" style={{ gap: 11 }}>
        <MemberAvatar member={call.author} size={28} />
        <View className="flex-1">
          <Text style={{ fontFamily: f.sansSemi, fontSize: 12, color: c.bone }}>
            {call.author.displayName}
          </Text>
          <Text
            style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted, marginTop: 3 }}
          >
            {formatRelative(call.createdAt)}
            {/* Le prix d'entrée fait le classement : une correction se voit. */}
            {call.editedAt ? ` · modifié ${formatRelative(call.editedAt)}` : ''}
          </Text>
        </View>
        <View className="items-end">
          <Text
            style={{
              fontFamily: f.serif,
              fontSize: 20,
              lineHeight: 20,
              letterSpacing: 0.2,
              color: c.ivory,
            }}
          >
            {call.symbol}
          </Text>
          <Micro size={8.5} tracking={1.7} style={{ color: cls.fg, marginTop: 5 }}>
            {call.assetClass}
          </Micro>
        </View>
      </View>

      <Text
        style={{
          fontFamily: f.serifItalic,
          fontSize: 14,
          lineHeight: 22,
          color: c.parchment,
          marginTop: 15,
          marginBottom: 16,
        }}
      >
        {`« ${call.thesis} »`}
      </Text>

      {call.closed ? (
        // La perf de la bande est réalisée : le bandeau dit depuis quand, et
        // à quel prix.
        <View
          className="flex-row items-center justify-between"
          style={{
            marginBottom: 12,
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: radius.button,
            borderWidth: 1,
            borderColor: c.borderLift,
          }}
        >
          <Micro size={8.5} tracking={1.7} style={{ color: c.goldMuted }}>
            {`CLÔTURÉ LE ${isoToClubDate(call.closedOn) ?? '—'}`}
          </Micro>
          <Text style={{ fontFamily: f.labelMed, fontSize: 11, color: c.bone }}>
            {`SORTIE ${call.exitPrice === null ? '—' : formatPrice(call.exitPrice)}`}
          </Text>
        </View>
      ) : null}

      <View
        className="flex-row"
        style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
      >
        <Stat label="ENTRÉE" value={formatPrice(call.entryPrice)} />
        <Stat
          label="PERF"
          value={
            call.performancePercent === null ? '—' : formatPercent(call.performancePercent)
          }
          valueColor={
            call.performancePercent === null ? c.sepiaFaint : perfColor(call.performancePercent)
          }
          divided
        />
        <Stat
          label="VS ₿"
          labelColor={c.goldMuted}
          value={call.vsBtcPercent === null ? '—' : formatPercent(call.vsBtcPercent)}
          // Un call BTC est le référentiel : son `—` est en or, pas en gris.
          valueColor={
            call.vsBtcPercent === null
              ? call.assetClass === 'BTC'
                ? c.gold
                : c.sepiaFaint
              : perfColor(call.vsBtcPercent)
          }
          divided
        />
      </View>

      <StakesLine stakes={stakes} settled={call.closed} />

      <View className="flex-row items-center" style={{ paddingTop: 12, gap: 22 }}>
        {/* Hors fenêtre, sur son propre call ou sur un call clos, les voix
            restent affichées, figées. */}
        <VoteButton
          side="bull"
          count={call.bull}
          active={call.myVote === 'bull'}
          disabled={!onVote}
          onPress={() => onVote?.(call, 'bull')}
        />
        <VoteButton
          side="bear"
          count={call.bear}
          active={call.myVote === 'bear'}
          disabled={!onVote}
          onPress={() => onVote?.(call, 'bear')}
        />
        <View className="flex-1" />
        {call.sizeUsd === null ? null : (
          <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaFaint }}>
            {formatSize(call.sizeUsd)}
          </Text>
        )}
      </View>

      {/* Mon vote, et s'il se modifie encore : pendant les 72 h, on peut
          changer d'avis ; ensuite, il est verrouillé. */}
      {myVote && voteStatus ? (
        <View className="flex-row items-center justify-between" style={{ marginTop: 10 }}>
          <Micro size={8} tracking={1.4} style={{ color: c.sepiaMuted }}>
            {'VOTRE VOTE : '}
            <Text style={{ color: myVote === 'bull' ? c.sage : c.oxblood }}>
              {myVote.toUpperCase()}
            </Text>
          </Micro>
          {voteStatus.editable && onVote ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modifier mon vote"
              onPress={() => onVote(call, myVote)}
              hitSlop={8}
            >
              <Micro size={8.5} tracking={1.5} style={{ color: c.gold }}>
                MODIFIER
              </Micro>
            </Pressable>
          ) : (
            <Micro size={8} tracking={1.3} style={{ color: c.sepiaFaint }}>
              VERROUILLÉ
            </Micro>
          )}
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        <View className="flex-row items-center justify-between">
          {call.voters.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              aria-expanded={showReasons}
              onPress={() => setShowReasons((open) => !open)}
              hitSlop={6}
            >
              <Micro size={8.5} tracking={1.5} style={{ color: c.goldMuted }}>
                {showReasons
                  ? 'MASQUER LES AVIS'
                  : `LIRE ${call.voters.length > 1 ? `LES ${call.voters.length} AVIS` : 'L’AVIS'}`}
              </Micro>
            </Pressable>
          ) : (
            <View />
          )}
          {/* La fenêtre de vote : 72 h après la publication (`votes_close_at`). */}
          <Micro size={8} tracking={1.3} style={{ color: c.sepiaFaint }}>
            {call.votesOpen ? `VOTE ENCORE ${formatLeft(call.votesLeftMs)}` : 'VOTES CLOS'}
          </Micro>
        </View>
        {call.voters.length > 0 && showReasons ? (
          <View style={{ marginTop: 8, gap: 10 }}>
            {call.voters.map((voter) => {
              const member = membersById.get(voter.userId);
              return (
                <View key={voter.userId} className="flex-row" style={{ gap: 10 }}>
                  <MemberAvatar member={member} size={20} />
                  <View className="flex-1" style={{ gap: 2 }}>
                    <Text style={{ fontFamily: f.sansSemi, fontSize: 11, color: c.bone }}>
                      {`${member?.displayName ?? 'Membre'} · `}
                      <Text
                        style={{
                          fontFamily: f.labelMed,
                          fontSize: 9,
                          letterSpacing: 1.2,
                          color: voter.side === 'bull' ? c.sage : c.oxblood,
                        }}
                      >
                        {voter.side.toUpperCase()}
                      </Text>
                    </Text>
                    <Text
                      style={{
                        fontFamily: f.serifItalic,
                        fontSize: 13,
                        lineHeight: 18,
                        color: voter.reason ? c.parchment : c.sepiaFaint,
                      }}
                    >
                      {voter.reason ?? 'Vote sans explication.'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {onEdit || onDelete || onCloseCall ? (
        <View
          className="flex-row justify-end border-t border-hairline"
          style={{ marginTop: 14, paddingTop: 12, gap: 22 }}
        >
          {onCloseCall ? (
            <CardAction
              label={call.closed ? 'SORTIE' : 'CLÔTURER'}
              onPress={() => onCloseCall(call)}
              accent={!call.closed}
            />
          ) : null}
          {onEdit ? <CardAction label="MODIFIER" onPress={() => onEdit(call)} /> : null}
          {onDelete ? (
            <CardAction label="SUPPRIMER" onPress={() => onDelete(call)} destructive />
          ) : null}
        </View>
      ) : null}
    </LinearGradient>
  );
});

function CardAction({
  label,
  onPress,
  destructive = false,
  accent = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Le geste attendu sur un call en cours : en or. */
  accent?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text
        style={{
          fontFamily: f.labelMed,
          fontSize: 9,
          letterSpacing: 1.62,
          color: destructive ? c.oxbloodMuted : accent ? c.goldMuted : c.sepiaDim,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface StatProps {
  label: string;
  value: string;
  labelColor?: string;
  valueColor?: string;
  divided?: boolean;
}

function Stat({
  label,
  value,
  labelColor = c.sepiaMuted,
  valueColor = c.bone,
  divided,
}: StatProps) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 11,
        ...(divided
          ? { borderLeftWidth: 1, borderLeftColor: c.hairline, paddingLeft: 14 }
          : null),
      }}
    >
      <Micro size={8.5} tracking={1.7} style={{ color: labelColor }}>
        {label}
      </Micro>
      <Text style={{ fontFamily: f.labelMed, fontSize: 12, color: valueColor, marginTop: 5 }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Ce que rapporte le call, rôle par rôle, à son cours du moment — ou à sa
 * sortie. Latent tant qu'il court : ça se lit sur la carte.
 */
function StakesLine({
  stakes,
  settled,
}: {
  stakes: { author: number; bull: number; bear: number };
  settled: boolean;
}) {
  const sign = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
  const tone = (value: number) =>
    value > 0 ? c.sage : value < 0 ? c.oxbloodMuted : c.sepiaFaint;
  const nothing = stakes.author === 0;
  return (
    <View className="flex-row flex-wrap items-baseline" style={{ marginTop: 10, gap: 10 }}>
      <Micro size={8} tracking={1.4} style={{ color: c.sepiaMuted }}>
        {settled ? 'POINTS ACQUIS' : 'POINTS EN JEU'}
      </Micro>
      {nothing ? (
        <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaFaint }}>
          aucun tant que le cours n’a pas bougé
        </Text>
      ) : (
        (
          [
            ['AUTEUR', stakes.author],
            ['BULLS', stakes.bull],
            ['BEARS', stakes.bear],
          ] as const
        ).map(([label, value]) => (
          <Text
            key={label}
            style={{ fontFamily: f.labelMed, fontSize: 10, color: tone(value) }}
          >
            {`${label} ${sign(value)}`}
          </Text>
        ))
      )}
    </View>
  );
}

interface VoteButtonProps {
  side: Vote;
  count: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function VoteButton({ side, count, active, disabled = false, onPress }: VoteButtonProps) {
  const color = active ? (side === 'bull' ? c.sage : c.oxblood) : c.sepiaFaint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${side === 'bull' ? 'Bull' : 'Bear'}, ${count} voix`}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center"
      style={{ gap: 8 }}
    >
      <Triangle color={color} pointingUp={side === 'bull'} />
      <Text style={{ fontFamily: f.labelMed, fontSize: 10, letterSpacing: 1.6, color }}>
        {`${side.toUpperCase()} ${count}`}
      </Text>
    </Pressable>
  );
}

/** Triangle en bordures — aucun pack d'icônes dans ce projet (README §10). */
function Triangle({ color, pointingUp }: { color: string; pointingUp: boolean }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: 4,
        borderRightWidth: 4,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        ...(pointingUp
          ? { borderBottomWidth: 6, borderBottomColor: color }
          : { borderTopWidth: 6, borderTopColor: color }),
      }}
    />
  );
}
