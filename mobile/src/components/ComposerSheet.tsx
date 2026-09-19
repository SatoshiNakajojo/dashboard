import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { useCoinSearch } from '@/features/bag/useCoinSearch';
import { useSuggestedPrice } from '@/features/bag/useSuggestedPrice';
import { formatUsd } from '@/lib/format';
import { normalizeTicker, type CoinMatch } from '@/lib/coinSearch';
import { DEFAULT_EXCHANGE, EXCHANGES, providerFor, type ExchangeKey } from '@/lib/quotes';
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
  /** Place de cotation, pour les actions et ETF hors États-Unis. */
  exchange: ExchangeKey;
  /**
   * Jeton choisi dans la liste, s'il l'a été. `null` laisse la publication
   * résoudre le ticker elle-même, au mieux classé.
   */
  coingeckoId: string | null;
}

export interface ComposerSheetProps {
  visible: boolean;
  /** Écriture en cours : le bouton se verrouille et annonce l'attente. */
  publishing?: boolean;
  onClose: () => void;
  /** Résout `true` si le call est parti ; la sheet ne se ferme qu'alors. */
  onPublish: (draft: CallDraft) => Promise<boolean> | boolean;
}

/** Limite dure de la thèse — la même que la contrainte `tickers.thesis`. */
const THESIS_MAX = 140;

/** Bottom sheet « Poster un call ». */
export function ComposerSheet({
  visible,
  publishing = false,
  onClose,
  onPublish,
}: ComposerSheetProps) {
  const [assetClass, setAssetClass] = useState<AssetClass>('BTC');
  const [symbol, setSymbol] = useState('$BTC');
  const [entry, setEntry] = useState('');
  const [thesis, setThesis] = useState('');
  const [exchange, setExchange] = useState<ExchangeKey>(DEFAULT_EXCHANGE);
  const [picked, setPicked] = useState<CoinMatch | null>(null);

  /** Seuls les titres ont une place de cotation ; un jeton se négocie partout. */
  const isStock = providerFor(assetClass) === 'yahoo';
  /** `$BTC` n'a pas d'homonyme — lui proposer une liste serait du bruit. */
  const isCoin = !isStock && assetClass !== 'BTC';

  const search = useCoinSearch(assetClass, symbol);

  /**
   * Le choix ne survit pas à une modification du ticker.
   *
   * Dérivé plutôt que rangé dans un effet : le symbole fait foi, et il n'y a
   * aucun instant où l'écran montrerait un jeton que la saisie contredit.
   */
  const pinned =
    picked && normalizeTicker(symbol) === picked.symbol.toLowerCase() ? picked : null;

  // Le cours proposé dépend de l'actif : spot BTC pour un call bitcoin, Yahoo
  // pour une action ou un ETF, rien pour un alt — plutôt qu'un prix faux.
  const suggested = useSuggestedPrice(assetClass, symbol, exchange);

  /** Le prix saisi, ou le cours proposé à défaut. */
  const entryPrice = (() => {
    const parsed = Number(entry.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return suggested.price ?? 0;
  })();

  const reset = () => {
    setAssetClass('BTC');
    setSymbol('$BTC');
    setEntry('');
    setThesis('');
    setExchange(DEFAULT_EXCHANGE);
    setPicked(null);
  };

  const submit = async () => {
    const sent = await onPublish({
      assetClass,
      symbol,
      entryPrice,
      thesis: thesis.trim(),
      exchange,
      coingeckoId: pinned?.id ?? null,
    });
    // Sur échec, on garde la saisie : le membre ne doit pas réécrire sa thèse.
    if (sent) reset();
  };

  // Le motif est celui de la contrainte `tickers_symbol_check` : refuser ici
  // ce que la base refusera de toute façon, mais avec un retour immédiat.
  const symbolValid = /^\$[A-Z0-9.\-]{1,10}$/.test(symbol);

  /**
   * Pourquoi la publication est bloquée, s'il y a lieu.
   *
   * Un bouton inerte sans explication est un cul-de-sac : depuis que le cours
   * n'est plus pré-rempli au petit bonheur, un alt exige une saisie, et il faut
   * le dire.
   */
  const blockedReason = !symbolValid
    ? 'Un ticker comme « $BTC », lettres et chiffres.'
    : entryPrice <= 0
      ? suggested.loading
        ? 'Recherche du cours…'
        : 'Indiquez votre prix d’entrée.'
      : thesis.trim().length === 0
        ? 'Une thèse, même courte.'
        : null;

  const canPublish = blockedReason === null && !publishing;

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
                    onPress={() => {
                      setAssetClass(key);
                      // Une place retenue d'un call précédent n'a aucun sens
                      // sur un jeton, et fausserait le symbole d'un retour aux
                      // actions.
                      if (providerFor(key) !== 'yahoo') setExchange(DEFAULT_EXCHANGE);
                    }}
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
                {suggested.source === 'yahoo' ? 'PRIX D’ENTRÉE · YAHOO' : 'PRIX D’ENTRÉE'}
              </Micro>
              <TextInput
                value={entry}
                onChangeText={setEntry}
                keyboardType="decimal-pad"
                // Pré-rempli au cours du moment, mais éditable (README §5.5).
                placeholder={
                  suggested.loading
                    ? '…'
                    : suggested.price === null
                      ? 'à saisir'
                      : formatUsd(suggested.price)
                }
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

          {isStock && (
            <View>
              <Micro style={{ marginBottom: 10 }}>PLACE DE COTATION</Micro>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 22 }}
              >
                {EXCHANGES.map(({ key, label }) => {
                  const on = exchange === key;
                  const style = on ? assetClassStyle[assetClass] : assetClassIdle;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setExchange(key)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
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
                        {label.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text
                style={{
                  fontFamily: f.sans,
                  fontSize: 10,
                  lineHeight: 16,
                  color: c.sepiaFaint,
                  marginTop: 9,
                }}
              >
                {suggested.symbol
                  ? `Suivi comme ${suggested.symbol} sur Yahoo Finance.`
                  : 'Hors des États-Unis, Yahoo suffixe le ticker : AI.PA, pas AI.'}
              </Text>
            </View>
          )}

          {isCoin && (
            <View>
              <Micro style={{ marginBottom: 10 }}>JETON</Micro>
              {search.matches.slice(0, 4).map((coin) => {
                const on = pinned?.id === coin.id;
                const style = on ? assetClassStyle[assetClass] : assetClassIdle;
                return (
                  <Pressable
                    key={coin.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setSymbol(`$${coin.symbol}`);
                      setPicked(coin);
                    }}
                    className="flex-row items-baseline"
                    style={{
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      marginBottom: 6,
                      borderRadius: radius.button,
                      borderWidth: 1,
                      borderColor: style.border,
                      backgroundColor: style.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: f.monoMed,
                        fontSize: 10,
                        letterSpacing: 1.08,
                        color: style.fg,
                      }}
                    >
                      {coin.symbol}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, fontFamily: f.sans, fontSize: 11, color: c.parchment }}
                    >
                      {coin.name}
                    </Text>
                    <Text style={{ fontFamily: f.monoMed, fontSize: 9, color: c.sepiaFaint }}>
                      {coin.rank === null ? 'HORS RANG' : `#${coin.rank}`}
                    </Text>
                  </Pressable>
                );
              })}
              <Text
                style={{
                  fontFamily: f.sans,
                  fontSize: 10,
                  lineHeight: 16,
                  color: search.empty ? c.sepia : c.sepiaFaint,
                  marginTop: 3,
                }}
              >
                {pinned
                  ? `Suivi comme ${pinned.name} sur CoinGecko.`
                  : search.loading
                    ? 'Recherche…'
                    : search.empty
                      ? 'Aucun jeton connu sous ce ticker. Le call partira sans cours, et sa carte restera au prix d’entrée.'
                      : search.matches.length > 0
                        ? 'Sans choix, le mieux classé sera retenu.'
                        : 'Tapez deux lettres pour voir les jetons connus.'}
              </Text>
            </View>
          )}

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
            accessibilityState={{ disabled: !canPublish, busy: publishing }}
            disabled={!canPublish}
            onPress={() => void submit()}
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
                {publishing ? 'PUBLICATION…' : 'PUBLIER AU CLUB'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: blockedReason ? c.sepia : c.sepiaFaint,
              textAlign: 'center',
            }}
          >
            {blockedReason ??
              'Perf calculée en dollars et vs ₿ depuis ce prix. Non modifiable après publication.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
