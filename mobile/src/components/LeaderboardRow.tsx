import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { formatPercent } from '@/lib/format';
import { desaturate } from '@/lib/performance';
import { c, f } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export interface LeaderboardRowProps {
  /** Rang romain (Hall of Fame) ou frimousse monospace (Rekt Board). */
  marker: string;
  member: Member;
  symbol: string;
  note: string;
  percent: number;
  variant: 'fame' | 'rekt';
}

/** Une ligne de classement. Les deux tableaux partagent la même grammaire. */
export function LeaderboardRow({
  marker,
  member,
  symbol,
  note,
  percent,
  variant,
}: LeaderboardRowProps) {
  const isFame = variant === 'fame';

  return (
    <View
      className="flex-row items-center border-b border-hairline"
      style={{ gap: 14, paddingVertical: 14, paddingHorizontal: 2 }}
    >
      <View style={{ width: 22 }}>
        <Text
          style={
            isFame
              ? { fontFamily: f.serif, fontSize: 20, color: c.goldMuted }
              : { fontFamily: f.mono, fontSize: 11, color: c.oxbloodMuted }
          }
        >
          {marker}
        </Text>
      </View>

      <Avatar
        initials={member.initials}
        // Pas de filtre CSS en RN : la désaturation est calculée (README §8.5).
        color={isFame ? member.color : desaturate(member.color, 0.7)}
        size={28}
      />

      <View className="flex-1">
        <Text
          style={{ fontFamily: f.sansSemi, fontSize: 13, color: isFame ? c.bone : c.parchment }}
        >
          {member.displayName}
        </Text>
        <Text style={{ fontFamily: f.mono, fontSize: 10, color: c.sepiaMuted, marginTop: 3 }}>
          {`${symbol} · ${note}`}
        </Text>
      </View>

      <Text
        style={{ fontFamily: f.serif, fontSize: 19, color: isFame ? c.sage : c.oxblood }}
      >
        {formatPercent(percent, 0)}
      </Text>
    </View>
  );
}
