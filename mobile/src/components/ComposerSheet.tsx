import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { DateField } from '@/components/DateTimeFields';
import { Micro } from '@/components/ui/Micro';
import type { EntryWaiver } from '@/features/bag/source';
import { useCoinSearch } from '@/features/bag/useCoinSearch';
import { useSuggestedPrice } from '@/features/bag/useSuggestedPrice';
import { useKeyboardFrame } from '@/hooks/useKeyboardFrame';
import { entryDayOf } from '@/lib/btcAtDate';
import { todayInClub } from '@/lib/clubTime';
import { keyFromFieldDate, shiftDayKey } from '@/lib/datePicker';
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
import type { CallView } from '@/types/domain';

export interface CallDraft {
  assetClass: AssetClass;
  symbol: string;
  /** Le cours live affiché — jamais une saisie (v1.01). */
  entryPrice: number;
  thesis: string;
  /** Place de cotation, pour les actions et ETF hors États-Unis. */
  exchange: ExchangeKey;
  /**
   * Le jeton coté : celui choisi dans la liste, sinon le mieux classé. `null`
   * laisse la publication résoudre le ticker elle-même.
   */
  coingeckoId: string | null;
  /**
   * Prix et jour d'entrée saisis, avec une exception du club sur ce titre
   * (`waiverFor`) ; `null` sinon.
   */
  manualEntry: { price: number; date: string } | null;
}

/** `12,5` ou `12.5` → 12.5 ; autre chose → `null`. */
function parsePrice(text: string): number | null {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface ComposerSheetProps {
  visible: boolean;
  /** Écriture en cours : le bouton se verrouille et annonce l'attente. */
  publishing?: boolean;
  /**
   * Pourquoi la dernière publication a échoué. Affiché **dans** la sheet :
   * l'écran derrière est masqué, un message posé là ne serait jamais lu.
   */
  error?: string | null;
  onClose: () => void;
  /** Résout `true` si le call est parti ; la sheet ne se ferme qu'alors. */
  onPublish: (draft: CallDraft) => Promise<boolean> | boolean;
  /**
   * Le call à corriger, s'il s'agit d'une modification. Le titre et la classe
   * sont alors figés : changer de titre, c'est un autre call.
   *
   * L'état de la feuille s'initialise à partir de lui : le parent la remonte
   * avec une `key` différente pour chaque call, plutôt que de recopier ses
   * valeurs dans un effet.
   */
  editing?: CallView | null;
  /**
   * Mon exception au cours live sur ce ticker, s'il y en a une : le club m'y
   * autorise à publier au prix et au jour où je suis entré, une fois.
   */
  waiverFor?: (symbol: string) => EntryWaiver | null;
}

/** Limite dure de la thèse — la même que la contrainte `tickers.thesis`. */
const THESIS_MAX = 140;

/** Bottom sheet « Poster un call ». */
export function ComposerSheet({
  visible,
  publishing = false,
  error = null,
  onClose,
  onPublish,
  editing = null,
  waiverFor,
}: ComposerSheetProps) {
  const [assetClass, setAssetClass] = useState<AssetClass>(editing?.assetClass ?? 'BTC');
  const [symbol, setSymbol] = useState(editing?.symbol ?? '$BTC');
  const [thesis, setThesis] = useState(editing?.thesis ?? '');
  const [exchange, setExchange] = useState<ExchangeKey>(DEFAULT_EXCHANGE);
  const [picked, setPicked] = useState<CoinMatch | null>(null);
  /** Avec une exception : le prix et le jour d'entrée, saisis. */
  const [manualPrice, setManualPrice] = useState('');
  const [manualDate, setManualDate] = useState(() => todayInClub());

  /** Seuls les titres ont une place de cotation ; un jeton se négocie partout. */
  const isStock = providerFor(assetClass) === 'yahoo';
  /** `$BTC` n'a pas d'homonyme — lui proposer une liste serait du bruit. */
  const isCoin = !isStock && assetClass !== 'BTC' && !editing;

  const search = useCoinSearch(assetClass, symbol);

  /**
   * Le choix ne survit pas à une modification du ticker.
   *
   * Dérivé plutôt que rangé dans un effet : le symbole fait foi, et il n'y a
   * aucun instant où l'écran montrerait un jeton que la saisie contredit.
   */
  const pinned =
    picked && normalizeTicker(symbol) === picked.symbol.toLowerCase() ? picked : null;

  /** Le jeton coté : le choix du membre, ou le mieux classé de la liste. */
  const coin = pinned ?? (isCoin ? (search.matches[0] ?? null) : null);

  /**
   * Le prix d'entrée : le cours live, et rien d'autre (v1.01).
   *
   * Spot BTC pour un call bitcoin, Yahoo pour une action ou un ETF, CoinGecko
   * pour un jeton. Pas de saisie, pas de date d'entrée : un call se publie au
   * marché, maintenant. Sinon on attendrait de voir un actif monter pour
   * publier « le call d'il y a deux semaines ». Le serveur relit ce cours au
   * relevé suivant et le confirme.
   */
  const suggested = useSuggestedPrice(assetClass, symbol, exchange, coin?.id ?? null);

  /** Une exception du club sur ce ticker : le prix et le jour se saisissent. */
  const waiver = editing ? null : (waiverFor?.(symbol) ?? null);
  const todayKey = keyFromFieldDate(todayInClub())!;
  const typedPrice = parsePrice(manualPrice);
  const entryPrice = waiver ? (typedPrice ?? 0) : (suggested.price ?? 0);

  const reset = () => {
    setAssetClass('BTC');
    setSymbol('$BTC');
    setThesis('');
    setExchange(DEFAULT_EXCHANGE);
    setPicked(null);
    setManualPrice('');
    setManualDate(todayInClub());
  };

  const submit = async () => {
    const sent = await onPublish({
      assetClass,
      symbol,
      entryPrice,
      thesis: thesis.trim(),
      exchange,
      coingeckoId: coin?.id ?? null,
      manualEntry: waiver && typedPrice ? { price: typedPrice, date: manualDate } : null,
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
  const blockedReason = editing
    ? thesis.trim().length === 0
      ? 'Une thèse, même courte.'
      : thesis.trim() === editing.thesis
        ? 'Rien n’a encore changé.'
        : null
    : !symbolValid
      ? 'Un ticker comme « $BTC », lettres et chiffres.'
      : waiver && typedPrice === null
        ? 'Votre prix d’entrée, en dollars.'
        : entryPrice <= 0
          ? suggested.loading || search.loading
            ? 'Recherche du cours live…'
            : isCoin && search.empty
              ? 'Aucun jeton connu sous ce ticker : sans cours de marché, pas de call.'
              : 'Cours live introuvable pour ce ticker : un call se publie au prix du marché.'
          : thesis.trim().length === 0
            ? 'Une thèse, même courte.'
            : null;

  const canPublish = blockedReason === null && !publishing;
  const keyboard = useKeyboardFrame();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Clavier ouvert, la feuille se cale au-dessus (`useKeyboardFrame`). */}
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
              {editing ? 'Modifier le call' : 'Poster un call'}
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18 }}
            showsVerticalScrollIndicator={false}
          >
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
                      accessibilityState={{ selected: on, disabled: Boolean(editing) }}
                      disabled={Boolean(editing)}
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
                        // En modification, seule la classe du call reste lisible.
                        opacity: editing && !on ? 0.35 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: f.labelMed,
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
                  editable={!editing}
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
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  paddingLeft: 16,
                  borderLeftWidth: 1,
                  borderLeftColor: c.hairline,
                }}
              >
                {waiver ? (
                  <>
                    <Micro size={8.5} tracking={1.7} style={{ color: c.gold }}>
                      PRIX D’ENTRÉE · EXCEPTION
                    </Micro>
                    <TextInput
                      value={manualPrice}
                      onChangeText={setManualPrice}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Votre prix d’entrée, en dollars"
                      placeholder={
                        suggested.price !== null ? `live ${formatUsd(suggested.price)}` : '0,00'
                      }
                      placeholderTextColor={c.sepiaFaint}
                      style={{
                        fontFamily: f.labelMed,
                        fontSize: 15,
                        color: typedPrice === null && manualPrice ? c.oxblood : c.ivory,
                        marginTop: 6,
                        padding: 0,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
                      {editing ? 'PRIX D’ENTRÉE' : 'PRIX D’ENTRÉE · LIVE'}
                    </Micro>
                    <Text
                      accessibilityLabel="Prix d’entrée, cours live"
                      style={{
                        fontFamily: f.labelMed,
                        fontSize: 14,
                        color: (editing ? editing.entryPrice : suggested.price)
                          ? c.ivory
                          : c.sepiaFaint,
                        marginTop: 8,
                      }}
                    >
                      {editing
                        ? formatUsd(editing.entryPrice)
                        : suggested.price !== null
                          ? formatUsd(suggested.price)
                          : suggested.loading || search.loading
                            ? '…'
                            : 'introuvable'}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {waiver ? (
              <DateField
                label="JOUR D’ENTRÉE"
                date={manualDate}
                onDateChange={setManualDate}
                minKey={shiftDayKey(todayKey, -waiver.maxDaysBack)}
                maxKey={todayKey}
              />
            ) : null}

            <Text
              style={{
                fontFamily: f.sans,
                fontSize: 10,
                lineHeight: 16,
                color: waiver ? c.gold : c.sepiaFaint,
                marginTop: -8,
              }}
            >
              {waiver
                ? `Exception accordée par le club pour ${waiver.symbol} : votre prix et votre jour d’entrée (${waiver.maxDaysBack} jours en arrière au plus), une seule fois. Le bitcoin de référence est celui de ce jour-là.`
                : editing
                  ? `Entrée au marché le ${entryDayOf(editing)}. Le prix et le jour d’entrée ne se modifient pas ; la thèse, si.`
                  : 'Un call se publie au cours du marché, maintenant : ni saisie, ni date passée. Le serveur relit ce cours dans le quart d’heure et le confirme.'}
            </Text>

            {isStock && !editing && (
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
                            fontFamily: f.labelMed,
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
                          fontFamily: f.labelMed,
                          fontSize: 10,
                          letterSpacing: 1.08,
                          color: style.fg,
                        }}
                      >
                        {coin.symbol}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontFamily: f.sans,
                          fontSize: 11,
                          color: c.parchment,
                        }}
                      >
                        {coin.name}
                      </Text>
                      <Text
                        style={{ fontFamily: f.labelMed, fontSize: 9, color: c.sepiaFaint }}
                      >
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
                        ? 'Aucun jeton connu sous ce ticker : sans cours de marché, pas de call.'
                        : search.matches.length > 0
                          ? `Sans choix, le mieux classé est retenu : ${search.matches[0]!.name}.`
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
          </ScrollView>

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
                  fontFamily: f.labelSemi,
                  fontSize: 10,
                  letterSpacing: 2.4,
                  color: c.onGold,
                }}
              >
                {publishing
                  ? editing
                    ? 'ENREGISTREMENT…'
                    : 'PUBLICATION…'
                  : editing
                    ? 'ENREGISTRER'
                    : 'PUBLIER AU CLUB'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: error && !publishing ? c.oxblood : blockedReason ? c.sepia : c.sepiaFaint,
              textAlign: 'center',
            }}
          >
            {(!publishing && error) ||
              blockedReason ||
              (editing
                ? 'La carte indiquera « modifié », avec la date.'
                : 'Perf calculée en dollars et vs ₿ depuis ce prix et cette date.')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
