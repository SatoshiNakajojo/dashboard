import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { OracleCanvas } from '@/components/OracleCanvas';
import type { OracleCurve } from '@/components/OracleGraph';
import { ScreenShell } from '@/components/ScreenShell';
import { TimeLockCard } from '@/components/TimeLockCard';
import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { usePredictions } from '@/features/oracle/usePredictions';
import { accuracyLabel } from '@/lib/accuracy';
import { useBtcHistory, useBtcSpot } from '@/hooks/useBtcMarket';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { DAYS } from '@/lib/chart';
import { formatThousands, formatUsd } from '@/lib/format';
import { CLUB_SIZE } from '@/mocks/members';
import { a, c, f, radius } from '@/theme/tokens';

/** Membre dont la courbe est en pointillés dans le design de référence. */
const DASHED_MEMBER = 'Marco';

/** Au-delà, une confirmation restée en attente n'est plus une confirmation. */
const CONFIRM_WINDOW_MS = 4000;

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
    saveMine,
    saving,
    dirty,
    clearMine,
    myAccuracy,
    locked,
    remainingMs,
    resolutionLabel,
    hash,
    simulateLock,
  } = usePredictions(userId, byId, history.points);

  const [showOthers, setShowOthers] = useState(true);
  /**
   * L'effacement demande confirmation, en deux temps sur le même bouton.
   *
   * Une `Alert` système ne s'affiche pas de la même façon sur le web et sur
   * iOS, et sortirait du registre de l'écran. Le libellé change, vire à
   * l'oxblood, et redevient lui-même si on ne confirme pas.
   */
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

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
              <Text style={{ fontFamily: f.serif, fontSize: 26, color: c.ivory, marginTop: 8 }}>
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

          <OracleCanvas
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

            <Pressable
              accessibilityRole="button"
              disabled={locked || myPoints.length === 0}
              onPress={() => {
                if (confirmingClear) {
                  setConfirmingClear(false);
                  clearMine();
                } else {
                  setConfirmingClear(true);
                }
              }}
            >
              <Text
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: locked
                    ? c.sepiaFaint
                    : myPoints.length === 0
                      ? c.sepiaFaint
                      : confirmingClear
                        ? c.oxblood
                        : c.sepiaDim,
                }}
              >
                {locked
                  ? `FIGÉ · HASH ${hash ?? '····'}`
                  : confirmingClear
                    ? 'CONFIRMER L’EFFACEMENT'
                    : 'EFFACER MA COURBE'}
              </Text>
            </Pressable>
          </View>

          {/* Le tracé ne part plus tout seul : il se dépose. */}
          {!locked && myPoints.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !dirty || saving }}
              disabled={!dirty || saving}
              onPress={saveMine}
              style={{
                marginTop: 14,
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: radius.button,
                borderWidth: 1,
                backgroundColor: dirty ? a.rsvpGoldBg : 'transparent',
                borderColor: dirty ? a.rsvpGoldBorder : c.border,
              }}
            >
              <Text
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 10,
                  letterSpacing: 1.8,
                  color: saving ? c.sepiaMuted : dirty ? c.gold : c.sage,
                }}
              >
                {saving
                  ? 'ENREGISTREMENT…'
                  : dirty
                    ? 'DÉPOSER MA PRÉDICTION'
                    : 'PRÉDICTION DÉPOSÉE'}
              </Text>
            </Pressable>
          ) : null}

          {myAccuracy !== null ? (
            <View
              className="flex-row items-baseline justify-between"
              style={{ marginTop: 14, paddingHorizontal: 2 }}
            >
              <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
                {`MA JUSTESSE · ${accuracyLabel(myAccuracy)}`}
              </Micro>
              <Text
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 13,
                  color: accuracyColor(myAccuracy),
                }}
              >
                {`${myAccuracy.toFixed(0)} %`}
              </Text>
            </View>
          ) : null}
        </View>

        <View>
          <SectionTitle
            label="PRÉDICTIONS DÉPOSÉES"
            hint={locked ? 'JUSTESSE' : `${others.length} / ${CLUB_SIZE} MEMBRES`}
          />
          {others.map((prediction) => {
            const score = prediction.accuracyPercent;
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
                    color: score === null ? c.sepiaFaint : accuracyColor(score),
                  }}
                >
                  {score === null ? 'EN ATTENTE' : `${score.toFixed(0)} % JUSTE`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScreenShell>
  );
}

/**
 * La couleur d'un score de justesse.
 *
 * `gapColor` faisait l'inverse — elle colorait un **écart**, où plus c'est
 * grand, pire c'est. Les seuils suivent ceux de `ACCURACY_TIERS` pour que la
 * couleur et le mot ne puissent pas se contredire.
 */
function accuracyColor(percent: number): string {
  if (percent >= 90) return c.sage;
  if (percent >= 70) return c.gold;
  return c.oxblood;
}
