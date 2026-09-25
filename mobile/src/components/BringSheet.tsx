import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { useKeyboardFrame } from '@/hooks/useKeyboardFrame';
import { a, c, f, goldButtonGradient, radius } from '@/theme/tokens';

/** Même borne que la base (`potluck_items.item_name`). */
export const BRING_MAX = 60;

export interface BringSheetProps {
  visible: boolean;
  busy: boolean;
  /** Pourquoi le dernier ajout a échoué. */
  error: string | null;
  onClose: () => void;
  /** Résout `true` si la ligne est enregistrée ; la feuille se ferme alors. */
  onSubmit: (name: string) => Promise<boolean>;
}

/**
 * « J'apporte aussi… » — ce que l'organisateur n'avait pas demandé.
 *
 * La ligne s'ajoute au bas de « Qui amène quoi », déjà à son nom. Une feuille
 * plutôt qu'un champ dans la liste : clavier ouvert, elle se cale au-dessus
 * de lui (`useKeyboardFrame`), et l'on voit ce qu'on écrit.
 */
export function BringSheet({ visible, busy, error, onClose, onSubmit }: BringSheetProps) {
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const keyboard = useKeyboardFrame();

  const ready = name.trim().length > 0 && !busy;
  const shownError = tried && !busy ? error : null;

  const close = () => {
    setTried(false);
    onClose();
  };

  const submit = async () => {
    if (!ready) return;
    setTried(true);
    if (await onSubmit(name)) {
      setName('');
      setTried(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View className="flex-1" style={keyboard.frame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={close}
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
            gap: 16,
            ...keyboard.sheet,
          }}
        >
          <View
            style={{ width: 34, height: 2, backgroundColor: c.borderSheet, alignSelf: 'center' }}
          />
          <View className="flex-row items-baseline justify-between">
            <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.ivory }}>
              J’apporte aussi
            </Text>
            <Pressable accessibilityRole="button" onPress={close}>
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

          <View>
            <Micro size={8.5} tracking={1.7} style={{ color: c.sepiaMuted }}>
              {`CE QUE J’APPORTE · ${BRING_MAX - name.length} SIGNES RESTANTS`}
            </Micro>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={BRING_MAX}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              placeholder="Un dessert, une bouteille…"
              placeholderTextColor={c.sepiaFaint}
              accessibilityLabel="Ce que j’apporte"
              style={{
                fontFamily: f.sans,
                fontSize: 15,
                color: c.parchment,
                marginTop: 7,
                paddingVertical: 4,
                borderBottomWidth: 1,
                borderBottomColor: c.hairline,
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready, busy }}
            disabled={!ready}
            onPress={() => void submit()}
            style={{ opacity: ready ? 1 : 0.45 }}
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
                {busy ? 'AJOUT…' : 'AJOUTER À LA LISTE'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text
            style={{
              fontFamily: f.sans,
              fontSize: 10,
              lineHeight: 16,
              color: shownError ? c.oxblood : c.sepia,
              textAlign: 'center',
            }}
          >
            {shownError ??
              'La ligne s’ajoute à votre nom. Si vous ne l’apportez plus, touchez-la : elle disparaît.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
