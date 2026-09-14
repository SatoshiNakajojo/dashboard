import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { formatUsd } from '@/lib/format';
import {
  ASSET_CLASSES,
  a,
  assetClassIdle,
  assetClassStyle,
  c,
  f,
  goldButtonGradient,
  radius,
  type AssetClass,
} from '@/theme/tokens';

export interface CallDraft {
  assetClass: AssetClass;
  symbol: string;
  entryPrice: number;
  thesis: string;
}

export interface ComposerSheetProps {
  visible: boolean;
  /** Cours spot, pour pré-remplir le prix d'entrée. */
  spotPrice: number;
  onClose: () => void;
  onPublish: (draft: CallDraft) => void;
}

/** Limite dure de la thèse — la même que la contrainte `tickers.thesis`. */
const THESIS_MAX = 140;

/** Bottom sheet « Poster un call ». */
export function ComposerSheet({ visible, spotPrice, onClose, onPublish }: ComposerSheetProps) {
  const [assetClass, setAssetClass] = useState<AssetClass>('BTC');
  const [symbol, setSymbol] = useState('$BTC');
  const [entry, setEntry] = useState('');
  const [thesis, setThesis] = useState('');

  const entryPrice = useMemo(() => {
    const parsed = Number(entry.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : spotPrice;
  }, [entry, spotPrice]);

  const symbolValid = /^\$[A-Z0-9.\-]{1,10}$/.test(symbol);
  const canPublish = symbolValid && thesis.trim().length > 0 && entryPrice > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
          <View style={{ width: 34, height: 2, backgroundColor: c.borderSheet, alignSelf: 'center' }} />

          <View className="flex-row items-baseline justify-between">
            <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.ivory }}>
              Poster un call
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text
                style={{ fontFamily: f.monoMed, fontSize: 9, letterSpacing: 1.62, color: c.sepiaMuted }}
              >
                FERMER
              </Text>
            </Pressable>
          </View>

          <View>
            <Micro style={{ marginBottom: 10 }}>CLASSE D’ACTIF</Micro>
            <View className="flex-row" style={{ gap: 8 }}>
              {ASSET_CLASSES.map((key) => {
                const on = assetClass === key;
                const style = on ? assetClassStyle[key] : assetClassIdle;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setAssetClass(key)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 9,
                      borderRadius: radius.button,
                      borderWidth: 1,
                      borderColor: style.border,
                      backgroundColor: style.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: f.monoMed,
                        fontSize: 9,
                        letterSpacing: 1.08,
                        color: style.fg,
                      }}
                    >
                      {key}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View
            className="flex-row"
            style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
          >
            <View style={{ flex: 1, paddingVertical: 13 }}>
              <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                TICKER
              </Micro>
              <TextInput
                value={symbol}
                onChangeText={(text) => setSymbol(text.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                placeholder="$BTC"
                placeholderTextColor={c.sepiaFaint}
                style={{
                  fontFamily: f.serif,
                  fontSize: 20,
                  color: symbolValid ? c.ivory : c.oxblood,
                  marginTop: 5,
                  padding: 0,
                }}
              />
            </View>
            <View
              style={{ flex: 1, paddingVertical: 13, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: c.hairline }}
            >
              <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                PRIX D’ENTRÉE
              </Micro>
              <TextInput
                value={entry}
                onChangeText={setEntry}
                keyboardType="decimal-pad"
                // Pré-rempli au cours spot, mais éditable (README §5.5).
                placeholder={formatUsd(spotPrice)}
                placeholderTextColor={c.sepiaFaint}
                style={{
                  fontFamily: f.monoMed,
                  fontSize: 14,
                  color: c.ivory,
                  marginTop: 8,
                  padding: 0,
                }}
              />
            </View>
          </View>

          <View>
            <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
              {`THÈSE · ${THESIS_MAX - thesis.length} SIGNES RESTANTS`}
            </Micro>
            <TextInput
              value={thesis}
              onChangeText={setThesis}
              maxLength={THESIS_MAX}
              multiline
              placeholder="Votre thèse, en une phrase."
              placeholderTextColor={c.sepiaFaint}
              style={{
                fontFamily: f.serifItalic,
                fontSize: 15,
                lineHeight: 24,
                color: c.parchment,
                marginTop: 8,
                padding: 0,
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canPublish}
            onPress={() => onPublish({ assetClass, symbol, entryPrice, thesis: thesis.trim() })}
            style={{ opacity: canPublish ? 1 : 0.45 }}
          >
            <LinearGradient
              colors={[...goldButtonGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ alignItems: 'center', paddingVertical: 14, borderRadius: radius.button }}
            >
              <Text
                style={{
                  fontFamily: f.monoSemi,
                  fontSize: 10,
                  letterSpacing: 2.4,
                  color: c.onGold,
                }}
              >
                PUBLIER AU CLUB
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: c.sepiaFaint,
              textAlign: 'center',
            }}
          >
            Perf calculée en dollars et vs ₿ depuis ce prix. Non modifiable après publication.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
