import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { OracleGraph, type OracleCurve } from '@/components/OracleGraph';
import { ScreenShell } from '@/components/ScreenShell';
import { TimeLockCard } from '@/components/TimeLockCard';
import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { usePredictions } from '@/features/oracle/usePredictions';
import { useBtcHistory, useBtcSpot } from '@/hooks/useBtcMarket';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { DAYS } from '@/lib/chart';
import { formatPercent, formatThousands, formatUsd } from '@/lib/format';
import { CLUB_SIZE } from '@/mocks/members';
import { c, f, gapColor } from '@/theme/tokens';

/** Membre dont la courbe est en pointillés dans le design de référence. */
const DASHED_MEMBER = 'Marco';

/** Onglet Oracle — prédiction BTC à 90 jours, tracée au doigt puis scellée. */
export default function OracleScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const { spot } = useBtcSpot();
  const history = useBtcHistory();

  const {
    others,
    myPoints,
    setMyPoints,
    clearMine,
    locked,
    remainingMs,
    resolutionLabel,
    hash,
    simulateLock,
  } = usePredictions(userId, byId, history.points);

  const [showOthers, setShowOthers] = useState(true);

  const me = userId ? (byId.get(userId) ?? null) : null;

  const curves = useMemo<OracleCurve[]>(
    () =>
      others.map((prediction) => ({
        id: prediction.id,
        color: prediction.author.color,
        points: prediction.pathData,
        dashed: prediction.author.displayName === DASHED_MEMBER,
      })),
    [others],
  );

  return (
    <ScreenShell overline="Prédictions BTC · 90 jours" title="L’Oracle" me={me}>
      <View style={{ gap: 20 }}>
        <TimeLockCard
          locked={locked}
          remainingMs={remainingMs}
          resolutionLabel={resolutionLabel}
          onSimulateLock={simulateLock}
        />

        <View>
          <View className="flex-row items-end justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Micro>BTC / USD · 90 JOURS</Micro>
              <Text
                style={{ fontFamily: f.serif, fontSize: 26, color: c.ivory, marginTop: 8 }}
              >
                {formatUsd(spot.usd)}
              </Text>
            </View>
            <View className="items-end">
              <Micro tracking={0.9} size={9} style={{ color: c.sepiaMuted, lineHeight: 16 }}>
                {`JOUR ${history.today} / ${DAYS}`}
              </Micro>
              <Micro tracking={0.9} size={9} style={{ color: c.sepiaMuted, lineHeight: 16 }}>
                {`RÉSOLUTION J+${DAYS}`}
              </Micro>
            </View>
          </View>

          <OracleGraph
            btcSeries={history.points}
            todayIndex={history.today}
            curves={curves}
            showOthers={showOthers}
            points={myPoints}
            color={me?.color ?? c.ivory}
            locked={locked}
            onPointsChange={setMyPoints}
          />

          <View className="flex-row" style={{ paddingTop: 14, gap: 24 }}>
            <Pressable accessibilityRole="button" onPress={() => setShowOthers((on) => !on)}>
              <Text
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: showOthers ? c.gold : c.sepiaMuted,
                }}
              >
                {showOthers ? 'MASQUER LE CLUB' : `VOIR LE CLUB (${curves.length})`}
              </Text>
            </Pressable>

            <Pressable accessibilityRole="button" disabled={locked} onPress={clearMine}>
              <Text
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: locked ? c.sepiaFaint : c.sepiaDim,
                }}
              >
                {locked ? `FIGÉ · HASH ${hash ?? '····'}` : 'EFFACER MA COURBE'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View>
          <SectionTitle
            label="PRÉDICTIONS DÉPOSÉES"
            hint={locked ? 'ÉCART MOYEN' : `${others.length} / ${CLUB_SIZE} MEMBRES`}
          />
          {others.map((prediction) => {
            const gap = prediction.gapPercent;
            return (
              <View
                key={prediction.id}
                className="flex-row items-center border-b border-hairline"
                style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 2 }}
              >
                <View
                  style={{ width: 14, height: 1.5, backgroundColor: prediction.author.color }}
                />
                <Avatar
                  initials={prediction.author.initials}
                  color={prediction.author.color}
                  size={24}
                />
                <Text
                  className="flex-1"
                  style={{ fontFamily: f.sansSemi, fontSize: 12, color: c.bone }}
                >
                  {prediction.author.displayName}
                </Text>
                <Text style={{ fontFamily: f.mono, fontSize: 11, color: c.sepia }}>
                  {formatThousands(prediction.targetPrice)}
                </Text>
                <Text
                  style={{
                    width: 78,
                    textAlign: 'right',
                    fontFamily: f.mono,
                    fontSize: 9,
                    letterSpacing: 1.08,
                    color: gap === null ? c.sepiaFaint : gapColor(gap),
                  }}
                >
                  {gap === null ? 'VERROUILLÉ' : `ÉCART ${formatPercent(gap).replace('+', '')}`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScreenShell>
  );
}
