import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { useKeyboardFrame } from '@/hooks/useKeyboardFrame';
import { entryDayOf } from '@/lib/btcAtDate';
import { formatPercent, formatPrice, formatUsd } from '@/lib/format';
import { performancePercent } from '@/lib/performance';
import { a, c, f, goldButtonGradient, perfColor, radius } from '@/theme/tokens';
import type { CallView } from '@/types/domain';

export interface CloseCallSheetProps {
  /** Le call à clôturer. `null` : feuille fermée. */
  call: CallView | null;
  busy?: boolean;
  /** Pourquoi la dernière clôture a échoué — affiché dans la feuille. */
  error?: string | null;
  onClose: () => void;
  /** Résout `true` si la clôture est enregistrée ; la feuille ne se ferme qu'alors. */
  onSubmit: () => Promise<boolean>;
}

/**
 * Bottom sheet « Clôturer le call » — au cours du marché (v1.01).
 *
 * Plus de champ : ni prix, ni jour de sortie. On sort **maintenant**, au cours
 * live que la feuille affiche ; la clôture le relit, et le serveur le confirme
 * au relevé suivant. Sinon on attendrait le repli pour déclarer être sorti au
 * plus haut, la semaine d'avant. Une clôture est définitive.
 */
export function CloseCallSheet({
  call,
  busy = false,
  error = null,
  onClose,
  onSubmit,
}: CloseCallSheetProps) {
  /** L'erreur affichée est celle de notre envoi, pas un reste d'un autre geste. */
  const [tried, setTried] = useState(false);
  const keyboard = useKeyboardFrame();

  const live =
    call && call.currentPrice !== null && call.currentPrice > 0 ? call.currentPrice : null;
  const realized = call && live !== null ? performancePercent(call.entryPrice, live) : null;
  const canSubmit = call !== null && !busy;
  const shownError = tried && !busy ? error : null;

  const submit = async () => {
    setTried(true);
    await onSubmit();
  };

  return (
    <Modal visible={call !== null} transparent animationType="slide" onRequestClose={onClose}>
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
            gap: 18,
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
              Clôturer le call
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

          <ScrollView contentContainerStyle={{ gap: 18 }} showsVerticalScrollIndicator={false}>
            {call ? (
              <Text
                style={{ fontFamily: f.sans, fontSize: 12, lineHeight: 18, color: c.sepia }}
              >
                {`${call.symbol} · entrée à ${formatPrice(call.entryPrice)} le ${entryDayOf(call)}`}
              </Text>
            ) : null}

            <View
              className="flex-row"
              style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
            >
              <View style={{ flex: 1, paddingVertical: 13 }}>
                <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                  PRIX DE SORTIE · LIVE
                </Micro>
                <Text
                  accessibilityLabel="Prix de sortie, cours live"
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 14,
                    color: live === null ? c.sepiaFaint : c.ivory,
                    marginTop: 8,
                  }}
                >
                  {live === null ? 'relu à la clôture' : formatUsd(live, 2)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  paddingLeft: 16,
                  borderLeftWidth: 1,
                  borderLeftColor: c.hairline,
                }}
              >
                <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                  PERF RÉALISÉE
                </Micro>
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 14,
                    color: realized === null ? c.sepiaFaint : perfColor(realized),
                    marginTop: 8,
                  }}
                >
                  {realized === null ? '—' : formatPercent(realized)}
                </Text>
              </View>
            </View>

            <Text
              style={{ fontFamily: f.sans, fontSize: 10, lineHeight: 16, color: c.sepiaFaint }}
            >
              On sort au cours du marché, maintenant : ni saisie, ni date passée. Le serveur
              relit ce cours dans le quart d’heure et le confirme. Une clôture est définitive.
            </Text>
          </ScrollView>

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
                {busy ? 'CLÔTURE…' : 'CLÔTURER AU COURS LIVE'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: shownError ? c.oxblood : c.sepiaFaint,
              textAlign: 'center',
            }}
          >
            {shownError ??
              'La perf ne bougera plus. Le bitcoin est comparé jusqu’à aujourd’hui.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
