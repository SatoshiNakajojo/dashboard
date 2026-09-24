import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colorChoices, type ColorChoice } from '@/features/profile/colors';
import { useProfile, type ProfileState } from '@/features/profile/useProfile';
import { colorName } from '@/features/auth/profile';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import {
  MAX_LABEL,
  MAX_LINKS,
  MAX_URL,
  SUGGESTED_LABELS,
  linkKind,
  openableUrl,
  shortenUrl,
  type ProfileLink,
} from '@/lib/profileLinks';
import { a, c, f, radius } from '@/theme/tokens';
import type { Member } from '@/types/domain';

/** Une ligne vide en fin de liste : on tape dedans, une nouvelle apparaît. */
const EMPTY: ProfileLink = { label: '', url: '' };

/** Au-delà, « ENREGISTRÉ » n'est plus une confirmation mais un état. */
const FLASH_MS = 2200;

/**
 * Page de profil.
 *
 * Un membre pouvait changer son nom en se réinscrivant, et rien d'autre. Trois
 * choses lui manquaient : son nom, sa photo, et ce qu'il veut partager au club
 * — un GitHub, une adresse de dépôt BTC, un MetaMask.
 *
 * Les liens sont la seule zone de l'app où un membre écrit du texte que six
 * autres verront **et** pourront toucher. `src/lib/profileLinks.ts` décide ce
 * qui s'ouvre et ce qui se copie ; cet écran ne fait qu'obéir.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const state = useProfile(userId);

  return (
    <View className="flex-1 bg-ink" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
            RETOUR
          </Micro>
        </Pressable>
        <Text style={{ fontFamily: f.display, fontSize: 21, color: c.ivory }}>Mon profil</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40, gap: 26 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {state.loading ? (
          <Notice message="Chargement…" />
        ) : !state.profile ? (
          <Notice message="Profil introuvable." />
        ) : (
          /* La clé monte le formulaire une fois par membre, son état initialisé
             depuis le profil chargé. Sans elle il faudrait un effet de
             synchronisation, qui écraserait la saisie en cours à chaque
             rafraîchissement du profil. */
          <ProfileForm key={state.profile.id} state={state} profile={state.profile} />
        )}
      </ScrollView>
    </View>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Text style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.sepia }}>{message}</Text>
  );
}

// ---------------------------------------------------------------------------

function ProfileForm({ state, profile }: { state: ProfileState; profile: Member }) {
  const { saving, uploading, error, save, pickPhoto, removePhoto } = state;

  const [name, setName] = useState(profile.displayName);
  const [color, setColor] = useState(profile.color);
  const { members } = useMembers();
  const choices = useMemo(() => colorChoices(members, profile.id), [members, profile.id]);
  const [links, setLinks] = useState<ProfileLink[]>(() =>
    profile.links.length > 0 ? [...profile.links, { ...EMPTY }] : [{ ...EMPTY }],
  );
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Ce qu'on enregistrerait maintenant, ligne vide de fin exclue. */
  const filled = useMemo(() => links.filter((link) => link.url.trim()), [links]);

  const dirty = useMemo(() => {
    if (name.trim() !== profile.displayName) return true;
    if (color.toLowerCase() !== profile.color.toLowerCase()) return true;
    if (filled.length !== profile.links.length) return true;
    return filled.some(
      (link, i) =>
        link.url.trim() !== profile.links[i]!.url ||
        (link.label.trim() || 'Lien') !== profile.links[i]!.label,
    );
  }, [name, color, filled, profile]);

  const updateLink = (index: number, patch: Partial<ProfileLink>) => {
    setLinks((current) => {
      const next = current.map((link, i) => (i === index ? { ...link, ...patch } : link));
      // Une ligne vide attend toujours en fin de liste — sauf au plafond, où en
      // proposer une de plus serait un mensonge.
      const last = next[next.length - 1];
      if (last && (last.label.trim() || last.url.trim()) && next.length < MAX_LINKS) {
        next.push({ ...EMPTY });
      }
      return next;
    });
  };

  const removeLink = (index: number) => {
    setLinks((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ ...EMPTY }];
    });
  };

  const openOrCopy = async (link: ProfileLink) => {
    const url = openableUrl(link.url);
    if (url) {
      await Linking.openURL(url);
      return;
    }
    // Ce n'est pas une adresse web : elle se copie. C'est aussi la porte fermée
    // à `javascript:` — rien d'autre que http(s) ne s'ouvre jamais.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(link.url.trim()).catch(() => {});
    }
    setCopied(link.url);
  };

  return (
    <>
      <View className="items-center" style={{ gap: 14, paddingTop: 8 }}>
        {/* La couleur choisie s'y voit tout de suite, avant d'enregistrer. */}
        <Avatar
          initials={profile.initials}
          color={color}
          photo={profile.avatarUrl}
          size={96}
        />
        <View className="flex-row" style={{ gap: 20 }}>
          <Pressable
            accessibilityRole="button"
            disabled={uploading}
            onPress={() => void pickPhoto()}
          >
            <Micro tracking={1.6} style={{ color: uploading ? c.sepiaMuted : c.gold }}>
              {uploading
                ? 'ENVOI…'
                : profile.avatarUrl
                  ? 'CHANGER LA PHOTO'
                  : 'AJOUTER UNE PHOTO'}
            </Micro>
          </Pressable>
          {profile.avatarUrl ? (
            <Pressable accessibilityRole="button" onPress={() => void removePhoto()}>
              <Micro tracking={1.6} style={{ color: c.sepiaDim }}>
                RETIRER
              </Micro>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ gap: 9 }}>
        <Micro>PRÉNOM</Micro>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="John"
          placeholderTextColor={c.sepiaFaint}
          maxLength={40}
          accessibilityLabel="Prénom"
          style={{
            fontFamily: f.serif,
            fontSize: 19,
            color: c.ivory,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.borderLift,
          }}
        />
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle label="MA COULEUR" hint={(colorName(color) ?? '').toUpperCase()} />
        <ColorPicker choices={choices} value={color} onChange={setColor} />
        <Text style={{ fontFamily: f.serifItalic, fontSize: 14, lineHeight: 19, color: c.sepia }}>
          Celle de votre avatar et de vos courbes dans l’Oracle. Une couleur déjà
          portée par un membre ne se choisit pas.
        </Text>
      </View>

      <View style={{ gap: 4 }}>
        <SectionTitle label="MES LIENS" hint={`${filled.length} / ${MAX_LINKS}`} />
        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 11,
            lineHeight: 17,
            color: c.sepiaMuted,
            marginBottom: 6,
          }}
        >
          Une adresse web s’ouvre ; une adresse de portefeuille se copie.
        </Text>

        {links.map((link, index) => (
          <View
            key={index}
            className="border-b border-hairline"
            style={{ paddingVertical: 11, gap: 7 }}
          >
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <TextInput
                value={link.label}
                onChangeText={(value) => updateLink(index, { label: value })}
                placeholder="GitHub"
                placeholderTextColor={c.sepiaFaint}
                maxLength={MAX_LABEL}
                accessibilityLabel={`Libellé du lien ${index + 1}`}
                style={{
                  width: 104,
                  fontFamily: f.labelMed,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: c.bone,
                }}
              />
              <TextInput
                value={link.url}
                onChangeText={(value) => updateLink(index, { url: value })}
                placeholder="github.com/… ou bc1q…"
                placeholderTextColor={c.sepiaFaint}
                maxLength={MAX_URL}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={`Adresse du lien ${index + 1}`}
                className="flex-1"
                style={{ fontFamily: f.sans, fontSize: 12, color: c.ivory }}
              />
              {link.url.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Supprimer le lien ${index + 1}`}
                  onPress={() => removeLink(index)}
                  hitSlop={10}
                >
                  <Micro size={9} tracking={0} style={{ color: c.sepiaFaint }}>
                    ✕
                  </Micro>
                </Pressable>
              ) : null}
            </View>

            {link.url.trim() ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Ouvrir ou copier ${link.url}`}
                onPress={() => void openOrCopy(link)}
              >
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Micro size={9} tracking={1.2} style={{ color: c.gold }}>
                    {copied === link.url
                      ? 'COPIÉ'
                      : linkKind(link.url) === 'web'
                        ? 'OUVRIR ·'
                        : 'COPIER ·'}
                  </Micro>
                  {copied === link.url ? null : (
                    /* L'adresse garde sa casse : `Micro` met en capitales, et
                       une adresse Ethereum porte sa somme de contrôle dans la
                       casse de ses lettres. L'afficher en majuscules en fait
                       une adresse fausse sous les yeux de qui la vérifie. */
                    <Text
                      style={{
                        fontFamily: f.label,
                        fontSize: 9,
                        letterSpacing: 0.6,
                        color: c.gold,
                      }}
                    >
                      {shortenUrl(link.url)}
                    </Text>
                  )}
                </View>
              </Pressable>
            ) : null}
          </View>
        ))}

        <View className="flex-row" style={{ gap: 14, paddingTop: 12, flexWrap: 'wrap' }}>
          {SUGGESTED_LABELS.map((label) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter un lien ${label}`}
              onPress={() => {
                const slot = links.findIndex((link) => !link.label.trim() && !link.url.trim());
                if (slot >= 0) updateLink(slot, { label });
              }}
            >
              <Micro size={9} tracking={1.2} style={{ color: c.sepiaDim }}>
                {label.toUpperCase()}
              </Micro>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <Text style={{ fontFamily: f.sans, fontSize: 12, color: c.oxbloodMuted }}>{error}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !dirty || saving }}
        disabled={!dirty || saving}
        onPress={async () => {
          const ok = await save({ displayName: name, links: filled, color });
          if (ok) setSaved(true);
        }}
        style={{
          alignItems: 'center',
          paddingVertical: 13,
          borderRadius: radius.button,
          borderWidth: 1,
          backgroundColor: dirty ? a.rsvpGoldBg : 'transparent',
          borderColor: dirty ? a.rsvpGoldBorder : c.border,
        }}
      >
        <Text
          style={{
            fontFamily: f.labelMed,
            fontSize: 10,
            letterSpacing: 1.8,
            color: saving ? c.sepiaMuted : saved ? c.sage : dirty ? c.gold : c.sepiaMuted,
          }}
        >
          {saving ? 'ENREGISTREMENT…' : saved ? 'ENREGISTRÉ' : dirty ? 'ENREGISTRER' : 'À JOUR'}
        </Text>
      </Pressable>
    </>
  );
}

/**
 * Les quatorze couleurs du club, en pastilles.
 *
 * Celle qu'on porte est cerclée d'or. Celles des autres membres sont voilées,
 * marquées de leurs initiales, et ne se touchent pas : deux membres de la même
 * couleur rendraient l'Oracle illisible.
 */
function ColorPicker({
  choices,
  value,
  onChange,
}: {
  choices: readonly ColorChoice[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    // Deux rangées de sept dès 330 points de large.
    <View className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
      {choices.map((choice) => {
        const selected = choice.hex.toLowerCase() === value.toLowerCase();
        const taken = choice.takenBy !== null;
        return (
          <Pressable
            key={choice.hex}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: taken }}
            accessibilityLabel={
              taken ? `${choice.name}, portée par ${choice.takenBy!.displayName}` : choice.name
            }
            disabled={taken}
            onPress={() => onChange(choice.hex)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 2,
              borderColor: selected ? c.gold : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: choice.hex,
                opacity: taken ? 0.28 : 1,
              }}
            />
            {/* Hors de la pastille voilée : sinon les initiales en hériteraient
                l'opacité et s'effaceraient avec elle. */}
            {taken ? (
              <Text
                style={{
                  position: 'absolute',
                  fontFamily: f.labelMed,
                  fontSize: 9,
                  color: c.ivory,
                }}
              >
                {choice.takenBy!.initials}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
