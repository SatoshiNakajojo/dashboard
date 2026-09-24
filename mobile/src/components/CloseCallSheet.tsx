import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { checkEntryDate, entryDayOf, isoToClubDate } from '@/lib/btcAtDate';
import { todayInClub } from '@/lib/clubTime';
import { formatPercent, formatPrice, formatUsd } from '@/lib/format';
import { performancePercent } from '@/lib/performance';
import { a, c, f, goldButtonGradient, perfColor, radius } from '@/theme/tokens';
import type { CallView } from '@/types/domain';
import type { CloseInput } from '@/features/bag/useCalls';

export interface CloseCallSheetProps {
  /** Le call à clôturer, ou dont on corrige la sortie. `null` : feuille fermée. */
  call: CallView | null;
  busy?: boolean;
  /** Pourquoi la dernière clôture a échoué — affiché dans la feuille. */
  error?: string | null;
  onClose: () => void;
  /** Résout `true` si la sortie est enregistrée ; la feuille ne se ferme qu'alors. */
  onSubmit: (input: CloseInput) => Promise<boolean>;
  /** Présent sur un call déjà clos : annuler la sortie. */
  onReopen?: () => void;
}

/**
 * Bottom sheet « Clôturer le call ».
 *
 * Deux champs : le prix et le jour de la sortie. Le jour décide du bitcoin de
 * référence — celui de ce jour-là — et la perf affichée devient réalisée.
 *
 * L'état s'initialise à partir du call : le parent remonte la feuille avec une
 * `key` différente pour chaque call.
 */
export function CloseCallSheet({
  call,
  busy = false,
  error = null,
  onClose,
  onSubmit,
  onReopen,
}: CloseCallSheetProps) {
  const correcting = call?.closed ?? false;
  const [price, setPrice] = useState(() =>
    call?.exitPrice ? String(call.exitPrice).replace('.', ',') : '',
  );
  const [date, setDate] = useState(() => isoToClubDate(call?.closedOn) ?? '');
  /** L'erreur affichée est celle de notre envoi, pas un reste d'un autre geste. */
  const [tried, setTried] = useState(false);

  const when = checkEntryDate(date);
  const live = call && !call.closed ? call.currentPrice : null;

  /** Le prix saisi, ou le cours du moment pour une sortie du jour. */
  const exitPrice = (() => {
    const parsed = Number(price.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return when.kind === 'today' && live !== null && live > 0 ? live : 0;
  })();

  const realized =
    call && exitPrice > 0 ? performancePercent(call.entryPrice, exitPrice) : null;

  const blockedReason =
    when.kind === 'invalid'
      ? 'Une date de sortie comme 12/03/2026.'
      : when.kind === 'future'
        ? 'La date de sortie est dans le futur.'
        : exitPrice <= 0
          ? 'Indiquez le prix de sortie.'
          : null;

  const canSubmit = call !== null && blockedReason === null && !busy;

  const submit = async () => {
    setTried(true);
    await onSubmit({ exitPrice, exitDate: date.trim() });
  };

  const shownError = tried && !busy ? error : null;

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
            gap: 18,
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
              {correcting ? 'Corriger la sortie' : 'Clôturer le call'}
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
            <Text style={{ fontFamily: f.sans, fontSize: 12, lineHeight: 18, color: c.sepia }}>
              {`${call.symbol} · entrée à ${formatPrice(call.entryPrice)} le ${entryDayOf(call)}`}
            </Text>
          ) : null}

          <View
            className="flex-row"
            style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
          >
            <View style={{ flex: 1, paddingVertical: 13 }}>
              <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                PRIX DE SORTIE
              </Micro>
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                accessibilityLabel="Prix de sortie"
                placeholder={live !== null && live > 0 ? formatUsd(live, 2) : 'à saisir'}
                placeholderTextColor={c.sepiaFaint}
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 14,
                  color: c.ivory,
                  marginTop: 8,
                  padding: 0,
                }}
              />
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
                DATE DE SORTIE
              </Micro>
              <TextInput
                value={date}
                onChangeText={setDate}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Date de sortie, au format jour, mois, année"
                placeholder={`Aujourd’hui · ${todayInClub()}`}
                placeholderTextColor={c.sepiaFaint}
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 14,
                  color:
                    when.kind === 'invalid' || when.kind === 'future' ? c.oxblood : c.ivory,
                  marginTop: 8,
                  padding: 0,
                }}
              />
            </View>
          </View>

          <View className="flex-row items-baseline justify-between">
            <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
              PERF RÉALISÉE
            </Micro>
            <Text
              style={{
                fontFamily: f.labelMed,
                fontSize: 16,
                color: realized === null ? c.sepiaFaint : perfColor(realized),
              }}
            >
              {realized === null ? '—' : formatPercent(realized)}
            </Text>
          </View>

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
                {busy ? 'ENREGISTREMENT…' : correcting ? 'ENREGISTRER' : 'CLÔTURER LE CALL'}
              </Text>
            </LinearGradient>
          </Pressable>

          {onReopen ? (
            <Pressable
              accessibilityRole="button"
              onPress={onReopen}
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
                ROUVRIR LE CALL
              </Text>
            </Pressable>
          ) : null}

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: shownError ? c.oxblood : blockedReason ? c.sepia : c.sepiaFaint,
              textAlign: 'center',
            }}
          >
            {shownError ||
              blockedReason ||
              'La perf ne bougera plus. Le bitcoin est comparé jusqu’à ce jour-là.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
