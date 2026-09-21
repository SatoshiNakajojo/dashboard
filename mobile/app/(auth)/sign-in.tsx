import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Micro } from '@/components/ui/Micro';
import { useAuth, useProfileBootstrap } from '@/features/auth/useAuth';
import { useSession } from '@/hooks/useSession';
import { brand } from '@/theme/brand';
import { c, f, goldButtonGradient, radius } from '@/theme/tokens';

/**
 * Porte du club.
 *
 * Trois états, jamais deux écrans différents : saisie de l'e-mail, saisie du
 * code, puis — au tout premier accès — le prénom qui crée la ligne `profiles`
 * sans laquelle `is_member()` refuse tout.
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const auth = useAuth();
  const profile = useProfileBootstrap(userId);

  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  const onProfileStep = Boolean(userId) && profile.needsProfile;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-ink"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-1 justify-center" style={{ paddingHorizontal: 22 }}>
        <View className="items-center" style={{ marginBottom: 34 }}>
          {/* Le logo du club, pas un ₿ générique : c'est la porte d'entrée,
              autant qu'on reconnaisse chez qui on frappe. */}
          <Image
            source={require('../../assets/brand/logo.png')}
            style={{ width: 92, height: 92 }}
            resizeMode="contain"
            accessibilityLabel={brand.name}
          />

          <Micro style={{ marginTop: 20 }}>{brand.name}</Micro>
          <Text
            style={{
              fontFamily: f.serif,
              fontSize: 29,
              lineHeight: 34,
              color: c.ivory,
              marginTop: 7,
              textAlign: 'center',
            }}
          >
            {onProfileStep ? 'Bienvenue au club' : 'Entrez au club'}
          </Text>
        </View>

        {onProfileStep ? (
          <Field
            label="VOTRE PRÉNOM"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Léa"
            autoCapitalize="words"
            autoComplete="name"
          />
        ) : auth.step === 'email' ? (
          <Field
            label="VOTRE ADRESSE"
            value={auth.email}
            onChangeText={auth.setEmail}
            placeholder="vous@exemple.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        ) : (
          <Field
            label="CODE REÇU PAR COURRIEL"
            value={auth.code}
            // `maxLength` compte les caractères, pas les chiffres : un code
            // collé avec une espace se faisait tronquer à cinq chiffres, et le
            // membre voyait « le code compte six chiffres » devant six chiffres
            // affichés. On filtre avant de borner.
            onChangeText={(text) => auth.setCode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={12}
            mono
          />
        )}

        {profile.error ?? auth.error ? (
          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 12,
              lineHeight: 18,
              color: c.oxbloodMuted,
              marginTop: 12,
            }}
          >
            {profile.error ?? auth.error}
          </Text>
        ) : null}

        <PrimaryButton
          label={
            onProfileStep
              ? creating
                ? 'CRÉATION…'
                : 'REJOINDRE LE CLUB'
              : auth.step === 'email'
                ? auth.busy
                  ? 'ENVOI…'
                  : 'RECEVOIR UN CODE'
                : auth.busy
                  ? 'VÉRIFICATION…'
                  : 'ENTRER'
          }
          busy={auth.busy || creating}
          onPress={async () => {
            if (onProfileStep) {
              setCreating(true);
              await profile.create(displayName);
              setCreating(false);
              return;
            }
            await (auth.step === 'email' ? auth.requestCode() : auth.verifyCode());
          }}
        />

        {auth.step === 'code' && !onProfileStep ? (
          <Pressable
            accessibilityRole="button"
            onPress={auth.changeEmail}
            style={{ alignItems: 'center', marginTop: 18 }}
          >
            <Micro tracking={1.62} style={{ color: c.sepiaMuted }}>
              Changer d’adresse
            </Micro>
          </Pressable>
        ) : null}

        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 10,
            lineHeight: 16,
            color: c.sepiaFaint,
            textAlign: 'center',
            marginTop: 26,
          }}
        >
          Club fermé. Seules les adresses déjà inscrites reçoivent un code.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  /** Saisie tabulaire — le code à six chiffres. */
  mono?: boolean;
}

function Field({ label, mono, style, ...rest }: FieldProps) {
  return (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}>
      <View style={{ paddingVertical: 13 }}>
        <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
          {label}
        </Micro>
        <TextInput
          autoCorrect={false}
          placeholderTextColor={c.sepiaFaint}
          style={[
            {
              fontFamily: mono ? f.monoMed : f.serif,
              fontSize: mono ? 22 : 20,
              letterSpacing: mono ? 6 : 0,
              color: c.ivory,
              marginTop: 8,
              padding: 0,
            },
            style,
          ]}
          {...rest}
        />
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void | Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={() => void onPress()}
      style={{ marginTop: 24, opacity: busy ? 0.45 : 1 }}
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
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}
