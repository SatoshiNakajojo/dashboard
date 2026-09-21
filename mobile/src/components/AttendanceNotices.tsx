import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { noticeText, type AttendanceNotice } from '@/lib/attendanceNotice';
import { a, c, f, radius } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface AttendanceNoticesProps {
  notices: readonly AttendanceNotice[];
  membersById: Map<string, Member>;
  titleFor: (eventId: string) => string | null;
  onDismiss: (id: string) => void;
}

/** Au-delà, on n'a plus le temps de lire la suivante. */
const VISIBLE_MS = 7000;

/**
 * Les « Alex vient à Grillades » qui tombent pendant qu'on est dans l'app.
 *
 * Le temps réel met la liste des présents à jour tout seul, mais en silence :
 * un avatar qui apparaît dans une carte repliée, personne ne le voit. Une
 * soirée se décide à sept, et ce qui la décide est de savoir qui a dit oui.
 *
 * Ce sont des notifications **dans l'app**, visibles seulement app ouverte.
 * L'écran verrouillé relève d'un autre mécanisme — voir « Ce qui reste à
 * faire » dans le README.
 */
export function AttendanceNotices({
  notices,
  membersById,
  titleFor,
  onDismiss,
}: AttendanceNoticesProps) {
  if (notices.length === 0) return null;

  return (
    <View
      // `box-none` : la bannière se touche, la zone autour laisse passer le
      // doigt jusqu'aux cartes en dessous.
      pointerEvents="box-none"
      // Collée sous le bandeau BTC : quelques pixels de plus et on voit
      // dépasser le haut de ce qu'elle recouvre, ce qui ressemble à un bug.
      style={{ position: 'absolute', left: 16, right: 16, top: 0, gap: 8 }}
    >
      {notices.map((notice) => (
        <Notice
          key={notice.id}
          notice={notice}
          member={membersById.get(notice.userId) ?? null}
          title={titleFor(notice.eventId)}
          onDismiss={onDismiss}
        />
      ))}
    </View>
  );
}

function Notice({
  notice,
  member,
  title,
  onDismiss,
}: {
  notice: AttendanceNotice;
  member: Member | null;
  title: string | null;
  onDismiss: (id: string) => void;
}) {
  // Elle s'efface seule : une bannière qu'il faut fermer à la main est une
  // corvée quand sept personnes répondent dans la même minute.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notice.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice.id, onDismiss]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${noticeText(notice, member?.displayName, title)} — toucher pour masquer`}
      onPress={() => onDismiss(notice.id)}
      className="flex-row items-center"
      style={{
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.card,
        borderWidth: 1,
        // Opaque, et posée : elle flotte au-dessus des cartes, qui portent la
        // même famille de bruns — sans l'ombre, on ne sait plus ce qui est
        // devant quoi.
        backgroundColor: c.surfaceLock,
        borderColor: notice.arriving ? a.rsvpSageBorder : c.borderLift,
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <Avatar
        initials={member?.initials ?? '··'}
        color={member?.color ?? c.sepiaMuted}
        size={26}
      />
      <Text
        numberOfLines={2}
        style={{ flex: 1, fontFamily: f.sans, fontSize: 12, lineHeight: 17, color: c.ivory }}
      >
        {noticeText(notice, member?.displayName, title)}
      </Text>
    </Pressable>
  );
}
