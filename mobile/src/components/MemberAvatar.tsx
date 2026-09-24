import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { c } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface MemberAvatarProps {
  /** `null` ou absent : un membre qu'on ne connaît pas encore — rien à ouvrir. */
  member: Member | null | undefined;
  size?: number;
  ringColor?: string;
  dimmed?: boolean;
  /** Remplace la couleur du membre — le Rekt Board la désature. */
  color?: string;
}

/**
 * L'avatar d'un membre, qui ouvre son profil.
 *
 * Partout où un membre apparaît — un call, une soirée, un classement, un pari —
 * son avatar mène à sa page : sa photo, et les liens qu'il partage au club.
 * Il porte aussi sa photo là où l'app ne montrait que ses initiales.
 */
export function MemberAvatar({
  member,
  size = 24,
  ringColor,
  dimmed,
  color,
}: MemberAvatarProps) {
  const router = useRouter();

  const avatar = (
    <Avatar
      initials={member?.initials ?? '··'}
      color={color ?? member?.color ?? c.dial}
      photo={member?.avatarUrl ?? null}
      size={size}
      ringColor={ringColor}
      dimmed={dimmed}
    />
  );
  if (!member) return avatar;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Voir le profil de ${member.displayName}`}
      hitSlop={4}
      onPress={() => router.push({ pathname: '/member/[id]', params: { id: member.id } })}
    >
      {avatar}
    </Pressable>
  );
}
