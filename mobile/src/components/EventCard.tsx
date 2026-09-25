import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { EventProposals } from '@/components/EventProposals';
import { PotluckList } from '@/components/PotluckList';
import { MemberAvatar } from '@/components/MemberAvatar';
import { Micro } from '@/components/ui/Micro';
import { clubDateTimeParts } from '@/lib/clubTime';
import { formatTime, splitEventDate } from '@/lib/format';
import { CLUB_SIZE } from '@/mocks/members';
import { formatThemes } from '@/lib/nightThemes';
import { a, c, cardGradient, f, radius } from '@/theme/tokens';
import type { Member } from '@/types/domain';
import type { EventWithAttendance } from '@/features/nights/useEvents';

export interface EventCardProps {
  event: EventWithAttendance;
  currentUserId: string | null;
  membersById: Map<string, Member>;
  defaultExpanded?: boolean;
  onToggleRsvp: (eventId: string) => void;
  /** Ouvre la modification — proposée seulement à celui qui a créé la soirée. */
  onEdit?: (eventId: string) => void;
}

const MAX_STACKED_AVATARS = 5;

/** Carte d'une Crypto Night : en-tête dépliable + checklist potluck. */
export function EventCard({
  event,
  currentUserId,
  membersById,
  defaultExpanded = false,
  onToggleRsvp,
  onEdit,
}: EventCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { day, month } = splitEventDate(event.startsAt);
  const going = currentUserId !== null && event.attendeeIds.includes(currentUserId);
  const stacked = event.attendeeIds.slice(0, MAX_STACKED_AVATARS);
  const mine = currentUserId !== null && event.createdBy === currentUserId;
  const editedOn = event.editedAt ? clubDateTimeParts(event.editedAt)?.date.slice(0, 5) : null;

  return (
    <LinearGradient
      colors={[...cardGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: expanded ? a.cardBorderOpen : c.border,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}
      >
        <View className="flex-row items-start" style={{ gap: 15 }}>
          <View
            className="items-center border-r border-borderStrong"
            style={{ paddingRight: 15 }}
          >
            <Text
              style={{
                fontFamily: f.serif,
                fontSize: 26,
                lineHeight: 26,
                color: expanded ? c.gold : c.ivory,
              }}
            >
              {day}
            </Text>
            <Micro size={8} tracking={1.6} style={{ marginTop: 5 }}>
              {month}
            </Micro>
          </View>

          <View className="flex-1">
            <Micro tracking={1.98} style={{ color: c.goldMuted }}>
              {formatThemes(event.themes)}
            </Micro>
            <Text
              style={{
                fontFamily: f.serif,
                fontSize: 19,
                lineHeight: 23,
                color: c.ivory,
                marginTop: 6,
              }}
            >
              {event.title}
            </Text>
            <Text
              style={{
                fontFamily: f.sans,
                fontSize: 11,
                lineHeight: 17,
                color: c.sepia,
                marginTop: 5,
              }}
            >
              {`${event.location} · ${formatTime(event.startsAt)}`}
            </Text>
            {/* Qui avait noté 19 h 30 doit voir que l'heure a bougé. */}
            {editedOn ? (
              <Micro size={8} tracking={1.4} style={{ color: c.gold, marginTop: 6 }}>
                {`MODIFIÉE LE ${editedOn}`}
              </Micro>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center justify-between" style={{ marginTop: 14 }}>
          <View className="flex-row items-center">
            {stacked.map((id, index) => {
              const member = membersById.get(id);
              return (
                <View
                  key={id}
                  style={{ marginRight: -6, zIndex: MAX_STACKED_AVATARS - index }}
                >
                  <MemberAvatar member={member} size={22} ringColor={c.surfaceDeep} />
                </View>
              );
            })}
            <Micro tracking={1} style={{ color: c.sepiaMuted, marginLeft: 14 }}>
              {`${event.attendeeIds.length} / ${CLUB_SIZE} PRÉSENTS`}
            </Micro>
          </View>

          <Micro tracking={1.8} style={{ color: c.goldMuted }}>
            {expanded ? 'RÉDUIRE' : 'DÉTAILS'}
          </Micro>
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
          <View className="flex-row" style={{ gap: 10, marginBottom: 18 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onToggleRsvp(event.id)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 11,
                borderRadius: radius.button,
                borderWidth: 1,
                backgroundColor: going ? a.rsvpSageBg : a.rsvpGoldBg,
                borderColor: going ? a.rsvpSageBorder : a.rsvpGoldBorder,
              }}
            >
              {/* Une coche plutôt qu'un simple changement de mot : l'état se
                  voit d'un coup d'œil sur une carte pliée, sans qu'on ait à
                  lire. */}
              <View className="flex-row items-center" style={{ gap: 7 }}>
                {going ? <Check color={c.sage} /> : null}
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: going ? c.sage : c.gold,
                  }}
                >
                  {going ? 'VOUS Y ÊTES' : 'JE VIENS'}
                </Text>
              </View>
            </Pressable>

            {mine && onEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Modifier ${event.title}`}
                onPress={() => onEdit(event.id)}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 11,
                  paddingHorizontal: 16,
                  borderRadius: radius.button,
                  borderWidth: 1,
                  borderColor: c.borderLift,
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: c.sepia,
                  }}
                >
                  MODIFIER
                </Text>
              </Pressable>
            ) : null}
          </View>

          <EventProposals
            event={event}
            currentUserId={currentUserId}
            membersById={membersById}
          />

          <PotluckList
            eventId={event.id}
            currentUserId={currentUserId}
            membersById={membersById}
          />
        </View>
      ) : null}
    </LinearGradient>
  );
}

/**
 * Coche dessinée : deux traits pivotés.
 *
 * Pas une police d'icônes ni un caractère Unicode — `✓` se fait substituer par
 * le système et arrive à des tailles imprévisibles selon l'appareil, ce qu'on a
 * déjà payé une fois avec le ₿.
 */
function Check({ color }: { color: string }) {
  return (
    <View style={{ width: 11, height: 11 }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 5,
          width: 5,
          height: 1.6,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 3,
          top: 4,
          width: 9,
          height: 1.6,
          backgroundColor: color,
          transform: [{ rotate: '-50deg' }],
        }}
      />
    </View>
  );
}
