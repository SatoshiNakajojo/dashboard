import { Modal, Pressable, Text, View } from 'react-native';

import { a, c, f, radius } from '@/theme/tokens';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  /** Le geste qui détruit — écrit en oxblood. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Une fenêtre qui demande avant de détruire.
 *
 * Dessinée plutôt que confiée à `Alert` : l'alerte système ne s'affiche pas de
 * la même façon sur le web et sur iOS — sur une PWA, c'est un `window.confirm`
 * gris qui sort complètement du registre de l'app.
 *
 * Toucher hors de la fenêtre annule : c'est le geste de qui n'a pas voulu
 * l'ouvrir.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'ANNULER',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Annuler"
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: a.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
        }}
      >
        {/* Un appui dans la fenêtre ne doit pas la refermer : cette vue
            intercepte le toucher sans rien faire. */}
        <Pressable
          accessibilityRole="alert"
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: c.surface,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: c.borderLift,
            padding: 22,
            gap: 12,
          }}
        >
          <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.ivory }}>{title}</Text>
          <Text style={{ fontFamily: f.sans, fontSize: 13, lineHeight: 19, color: c.sepia }}>
            {message}
          </Text>

          <View className="flex-row" style={{ gap: 10, marginTop: 10 }}>
            <DialogButton label={cancelLabel} onPress={onCancel} />
            <DialogButton label={confirmLabel} onPress={onConfirm} destructive />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DialogButton({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: destructive ? c.oxblood : c.borderLift,
      }}
    >
      <Text
        style={{
          fontFamily: f.labelMed,
          fontSize: 10,
          letterSpacing: 1.6,
          color: destructive ? c.oxblood : c.sepia,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
