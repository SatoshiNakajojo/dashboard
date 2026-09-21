import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { parseClubDateTime, todayInClub } from '@/lib/clubTime';
import { MAX_THEME_LENGTH, normalizeThemes, suggestThemes } from '@/lib/nightThemes';
import { a, c, f, goldButtonGradient, radius } from '@/theme/tokens';

export interface NightSheetDraft {
  startsAt: string;
  title: string;
  location: string;
  themes: string[];
  potluck: string[];
}

export interface NightSheetProps {
  visible: boolean;
  /** Thèmes déjà employés par le club, proposés avant les nouveaux. */
  knownThemes?: string[];
  /** Écriture en cours : le bouton se verrouille et annonce l'attente. */
  creating?: boolean;
  onClose: () => void;
  /** Résout `true` si la soirée est partie ; la feuille ne se ferme qu'alors. */
  onCreate: (draft: NightSheetDraft) => Promise<boolean> | boolean;
}

/** Contraintes de la base — refuser ici ce qu'elle refuserait de toute façon. */
const TITLE_MAX = 80;
const LOCATION_MAX = 80;
const ITEM_MAX = 60;

/** Six lignes vides : assez pour une soirée, sans transformer l'écran en tableur. */
const POTLUCK_SLOTS = 6;

/** Bottom sheet « Proposer une Crypto Night ». */
export function NightSheet({
  visible,
  knownThemes = [],
  creating = false,
  onClose,
  onCreate,
}: NightSheetProps) {
  const [date, setDate] = useState(() => todayInClub());
  const [time, setTime] = useState('19:30');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [invented, setInvented] = useState('');
  const [potluck, setPotluck] = useState<string[]>(() => Array<string>(POTLUCK_SLOTS).fill(''));

  const startsAt = parseClubDateTime(date, time);

  /**
   * Les thèmes proposés : ceux du club, puis ceux qu'il a inventés, puis celui
   * qu'on est en train d'écrire — pour qu'il soit sélectionnable avant même
   * d'avoir quitté le champ.
   */
  const offered = suggestThemes([...knownThemes, ...picked, invented]);
  const themes = normalizeThemes(picked);

  const reset = () => {
    setDate(todayInClub());
    setTime('19:30');
    setTitle('');
    setLocation('');
    setPicked([]);
    setInvented('');
    setPotluck(Array<string>(POTLUCK_SLOTS).fill(''));
  };

  const toggleTheme = (theme: string) =>
    setPicked((current) =>
      current.some((one) => one.toLocaleLowerCase('fr') === theme.toLocaleLowerCase('fr'))
        ? current.filter((one) => one.toLocaleLowerCase('fr') !== theme.toLocaleLowerCase('fr'))
        : normalizeThemes([...current, theme]),
    );

  /**
   * Pourquoi la création est bloquée, s'il y a lieu.
   *
   * Un bouton inerte sans explication est un cul-de-sac — et une date refusée
   * l'est en silence, puisqu'elle a l'air correcte à l'écran.
   */
  const blockedReason =
    startsAt === null
      ? 'Une date et une heure — 03/10/2026 et 19:30.'
      : themes.length === 0
        ? 'Au moins un thème.'
        : title.trim().length === 0
          ? 'Un titre, même court.'
          : location.trim().length === 0
            ? 'Où ça se passe.'
            : null;

  const canCreate = blockedReason === null && !creating;

  const submit = async () => {
    if (startsAt === null) return;
    const sent = await onCreate({
      startsAt,
      title,
      location,
      themes,
      potluck: potluck.filter((item) => item.trim().length > 0),
    });
    // Sur échec, on garde la saisie : personne ne doit retaper sa liste.
    if (sent) reset();
  };

  const setSlot = (index: number, value: string) =>
    setPotluck((current) => current.map((item, i) => (i === index ? value : item)));

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
            maxHeight: '92%',
          }}
        >
          <View style={{ width: 34, height: 2, backgroundColor: c.borderSheet, alignSelf: 'center' }} />

          <View className="flex-row items-baseline justify-between" style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.ivory }}>
              Proposer une soirée
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text
                style={{ fontFamily: f.monoMed, fontSize: 9, letterSpacing: 1.62, color: c.sepiaMuted }}
              >
                FERMER
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ marginTop: 18 }} keyboardShouldPersistTaps="handled">
            <View
              className="flex-row"
              style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
            >
              <Line label="DATE" value={date} onChangeText={setDate} placeholder="03/10/2026" mono />
              <Line
                label="HEURE"
                value={time}
                onChangeText={setTime}
                placeholder="19:30"
                mono
                divided
              />
            </View>

            <View style={{ marginTop: 22 }}>
              <Micro style={{ marginBottom: 10 }}>THÈMES</Micro>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {offered.map((theme) => {
                  const on = themes.some(
                    (one) => one.toLocaleLowerCase('fr') === theme.toLocaleLowerCase('fr'),
                  );
                  return (
                    <Pressable
                      key={theme}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleTheme(theme)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radius.button,
                        borderWidth: 1,
                        borderColor: on ? c.gold : c.border,
                        backgroundColor: on ? a.rsvpGoldBg : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: f.monoMed,
                          fontSize: 9,
                          letterSpacing: 1.08,
                          color: on ? c.gold : c.sepiaMuted,
                        }}
                      >
                        {theme.toLocaleUpperCase('fr')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={invented}
                onChangeText={setInvented}
                onSubmitEditing={() => {
                  if (invented.trim()) {
                    toggleTheme(invented.trim());
                    setInvented('');
                  }
                }}
                placeholder="Inventer un thème — Pizza Night…"
                placeholderTextColor={c.sepiaFaint}
                maxLength={MAX_THEME_LENGTH}
                returnKeyType="done"
                style={{
                  fontFamily: f.sans,
                  fontSize: 13,
                  color: c.parchment,
                  marginTop: 12,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: c.hairline,
                }}
              />
            </View>

            <Block
              label="TITRE"
              value={title}
              onChangeText={setTitle}
              placeholder="Grillades & Halving Talk"
              maxLength={TITLE_MAX}
            />
            <Block
              label="LIEU"
              value={location}
              onChangeText={setLocation}
              placeholder="Rooftop — chez Alex"
              maxLength={LOCATION_MAX}
            />

            <View style={{ marginTop: 22 }}>
              <Micro style={{ marginBottom: 4 }}>À APPORTER</Micro>
              <Text
                style={{
                  fontFamily: f.sans,
                  fontSize: 10,
                  lineHeight: 16,
                  color: c.sepiaFaint,
                  marginBottom: 8,
                }}
              >
                Laissées libres : chacun prendra la sienne dans l’app.
              </Text>
              {potluck.map((item, index) => (
                <TextInput
                  key={index}
                  value={item}
                  onChangeText={(value) => setSlot(index, value)}
                  placeholder={index === 0 ? 'Glaçons' : '—'}
                  placeholderTextColor={c.sepiaFaint}
                  maxLength={ITEM_MAX}
                  style={{
                    fontFamily: f.sans,
                    fontSize: 14,
                    color: c.parchment,
                    paddingVertical: 9,
                    borderBottomWidth: 1,
                    borderBottomColor: c.hairline,
                  }}
                />
              ))}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCreate, busy: creating }}
            disabled={!canCreate}
            onPress={() => void submit()}
            style={{ opacity: canCreate ? 1 : 0.45, marginTop: 20 }}
          >
            <LinearGradient
              colors={[...goldButtonGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ alignItems: 'center', paddingVertical: 14, borderRadius: radius.button }}
            >
              <Text
                style={{ fontFamily: f.monoSemi, fontSize: 10, letterSpacing: 2.4, color: c.onGold }}
              >
                {creating ? 'CRÉATION…' : 'INSCRIRE AU CALENDRIER'}
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
              marginTop: 12,
            }}
          >
            {blockedReason ?? 'Heure de Nouméa. Tout le club la verra.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function Line({
  label,
  divided,
  mono,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; divided?: boolean; mono?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 13,
        paddingLeft: divided ? 16 : 0,
        borderLeftWidth: divided ? 1 : 0,
        borderLeftColor: c.hairline,
      }}
    >
      <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
        {label}
      </Micro>
      <TextInput
        autoCorrect={false}
        placeholderTextColor={c.sepiaFaint}
        style={{
          fontFamily: mono ? f.monoMed : f.serif,
          fontSize: mono ? 15 : 20,
          color: c.ivory,
          marginTop: 7,
          padding: 0,
        }}
        {...rest}
      />
    </View>
  );
}

function Block({
  label,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
        {label}
      </Micro>
      <TextInput
        placeholderTextColor={c.sepiaFaint}
        style={{
          fontFamily: f.sans,
          fontSize: 15,
          color: c.parchment,
          marginTop: 7,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderBottomColor: c.hairline,
        }}
        {...rest}
      />
    </View>
  );
}
