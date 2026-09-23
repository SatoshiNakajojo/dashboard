import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { formatPercent, formatPrice, formatRelative, formatSize } from '@/lib/format';
import { assetClassStyle, c, cardGradient, f, perfColor, radius } from '@/theme/tokens';
import type { CallView, Vote } from '@/types/domain';

export interface CallCardProps {
  call: CallView;
  onVote: (tickerId: string, side: Vote) => void;
}

/** Carte d'un call : auteur, thèse, bande de stats, votes. */
export const CallCard = memo(function CallCard({ call, onVote }: CallCardProps) {
  const cls = assetClassStyle[call.assetClass];

  return (
    <LinearGradient
      colors={[...cardGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ borderRadius: radius.card, borderWidth: 1, borderColor: c.border, padding: 16 }}
    >
      <View className="flex-row items-center" style={{ gap: 11 }}>
        <Avatar initials={call.author.initials} color={call.author.color} size={28} />
        <View className="flex-1">
          <Text style={{ fontFamily: f.sansSemi, fontSize: 12, color: c.bone }}>
            {call.author.displayName}
          </Text>
          <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted, marginTop: 3 }}>
            {formatRelative(call.createdAt)}
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

      <View
        className="flex-row"
        style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
      >
        <Stat label="ENTRÉE" value={formatPrice(call.entryPrice)} />
        <Stat
          label="PERF"
          value={call.performancePercent === null ? '—' : formatPercent(call.performancePercent)}
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

      <View className="flex-row items-center" style={{ paddingTop: 14, gap: 22 }}>
        <VoteButton
          side="bull"
          count={call.bull}
          active={call.myVote === 'bull'}
          onPress={() => onVote(call.id, 'bull')}
        />
        <VoteButton
          side="bear"
          count={call.bear}
          active={call.myVote === 'bear'}
          onPress={() => onVote(call.id, 'bear')}
        />
        <View className="flex-1" />
        {call.sizeUsd === null ? null : (
          <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaFaint }}>
            {formatSize(call.sizeUsd)}
          </Text>
        )}
      </View>
    </LinearGradient>
  );
});

interface StatProps {
  label: string;
  value: string;
  labelColor?: string;
  valueColor?: string;
  divided?: boolean;
}

function Stat({ label, value, labelColor = c.sepiaMuted, valueColor = c.bone, divided }: StatProps) {
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

interface VoteButtonProps {
  side: Vote;
  count: number;
  active: boolean;
  onPress: () => void;
}

function VoteButton({ side, count, active, onPress }: VoteButtonProps) {
  const color = active ? (side === 'bull' ? c.sage : c.oxblood) : c.sepiaFaint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${side === 'bull' ? 'Bull' : 'Bear'}, ${count} voix`}
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
