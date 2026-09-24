import { Pressable, Text, View } from 'react-native';

import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  NOTIFICATION_TOPICS,
  useNotifications,
  type NotificationsState,
} from '@/features/notifications/useNotifications';
import { a, c, f, radius } from '@/theme/tokens';

/**
 * Les notifications, dans le profil : les activer sur cet appareil, et
 * choisir lesquelles recevoir.
 *
 * Les réglages s'enregistrent au toucher — pas de bouton « enregistrer » à
 * chercher — et valent pour tous les appareils du membre.
 */
export function NotificationSettings({ userId }: { userId: string | null }) {
  const state = useNotifications(userId);
  const { subscribed, prefs, setTopic } = state;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle
        label="NOTIFICATIONS"
        hint={
          subscribed ? 'ACTIVÉES ICI' : subscribed === false ? 'DÉSACTIVÉES ICI' : undefined
        }
      />

      <DeviceStatus state={state} />

      <View>
        {NOTIFICATION_TOPICS.map((topic) => {
          const on = prefs[topic.key];
          return (
            <Pressable
              key={topic.key}
              accessibilityRole="switch"
              // `aria-checked` et non `accessibilityState.checked` : React Native
              // Web ignore ce dernier, et le lecteur d'écran ne saurait pas si
              // l'interrupteur est ouvert.
              aria-checked={on}
              accessibilityLabel={topic.label}
              onPress={() => setTopic(topic.key, !on)}
            >
              <View
                className="flex-row items-center border-b border-hairline"
                style={{ gap: 14, paddingVertical: 12 }}
              >
                <View className="flex-1" style={{ gap: 3 }}>
                  <Text style={{ fontFamily: f.sansMed, fontSize: 13, color: c.bone }}>
                    {topic.label}
                  </Text>
                  <Text style={{ fontFamily: f.sans, fontSize: 11, color: c.sepiaMuted }}>
                    {topic.hint}
                  </Text>
                </View>
                <Toggle on={on} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DeviceStatus({ state }: { state: NotificationsState }) {
  const { support, configured, subscribed, denied, busy, error, info } = state;

  const explanation =
    support === 'needs-install'
      ? 'Sur iPhone, les notifications passent par l’app installée : Partager → « Sur l’écran d’accueil », puis ouvrez-la depuis son icône.'
      : support !== 'ready'
        ? 'Ce navigateur ne reçoit pas de notifications.'
        : !configured
          ? 'Les notifications ne sont pas encore activées sur le serveur du club.'
          : denied
            ? 'Refusées pour cette app : elles se réactivent dans les réglages du téléphone.'
            : subscribed
              ? 'Cet appareil reçoit les notifications du club.'
              : 'Cet appareil ne reçoit rien pour l’instant.';

  const canAct = support === 'ready' && configured && !denied && subscribed !== null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: f.serifItalic, fontSize: 14, lineHeight: 19, color: c.sepia }}>
        {explanation}
      </Text>

      {canAct ? (
        subscribed ? (
          <View className="flex-row" style={{ gap: 10 }}>
            <ActionButton
              label={busy ? '…' : 'M’ENVOYER UN ESSAI'}
              onPress={() => void state.sendTest()}
              disabled={busy}
              primary
            />
            <ActionButton
              label="DÉSACTIVER"
              onPress={() => void state.disable()}
              disabled={busy}
            />
          </View>
        ) : (
          <ActionButton
            label={busy ? 'ACTIVATION…' : 'ACTIVER SUR CET APPAREIL'}
            onPress={() => void state.enable()}
            disabled={busy}
            primary
          />
        )
      ) : null}

      {error || info ? (
        <Text
          style={{
            fontFamily: f.sans,
            fontSize: 11,
            lineHeight: 17,
            color: error ? c.oxbloodMuted : c.sage,
          }}
        >
          {error ?? info}
        </Text>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: radius.button,
        borderWidth: 1,
        backgroundColor: primary ? a.rsvpGoldBg : 'transparent',
        borderColor: primary ? a.rsvpGoldBorder : c.borderLift,
      }}
    >
      <Text
        style={{
          fontFamily: f.labelMed,
          fontSize: 10,
          letterSpacing: 1.6,
          color: primary ? c.gold : c.sepiaDim,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Un interrupteur dessiné : or quand il est ouvert, comme le reste des choix. */
function Toggle({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: on ? c.gold : c.borderLift,
        backgroundColor: on ? a.rsvpGoldBg : 'transparent',
        justifyContent: 'center',
        paddingHorizontal: 2,
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: on ? c.gold : c.sepiaFaint,
          alignSelf: on ? 'flex-end' : 'flex-start',
        }}
      />
    </View>
  );
}
