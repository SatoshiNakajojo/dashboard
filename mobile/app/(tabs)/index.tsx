import { Text, View } from 'react-native';

import { EventCard } from '@/components/EventCard';
import { ScreenShell } from '@/components/ScreenShell';
import { useEvents } from '@/features/nights/useEvents';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { c, f } from '@/theme/tokens';

/** Onglet Nights — agenda du club et checklists potluck. */
export default function NightsScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const { events, loading, error, toggleRsvp } = useEvents(userId);

  const me = userId ? (byId.get(userId) ?? null) : null;

  return (
    <ScreenShell overline="Prochaines sessions du club" title="Crypto Nights" me={me}>
      <View style={{ gap: 20 }}>
        {loading ? <EventSkeleton /> : null}

        {!loading && error ? <Notice message={error} /> : null}

        {!loading && !error && events.length === 0 ? (
          <Empty message="Aucune session prévue" />
        ) : (
          events.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              currentUserId={userId}
              membersById={byId}
              // La première carte est dépliée par défaut (README §7.1).
              defaultExpanded={index === 0}
              onToggleRsvp={toggleRsvp}
            />
          ))
        )}
      </View>
    </ScreenShell>
  );
}

function EventSkeleton() {
  return (
    <View style={{ gap: 20 }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          className="bg-surface border border-border"
          style={{ height: 148, borderRadius: 4 }}
        />
      ))}
    </View>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Text style={{ fontFamily: f.sans, fontSize: 12, lineHeight: 18, color: c.oxbloodMuted }}>
      {message}
    </Text>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 15,
        color: c.sepia,
        textAlign: 'center',
        paddingVertical: 40,
      }}
    >
      {message}
    </Text>
  );
}
