import { Text, View } from 'react-native';

import { MemberAvatar } from '@/components/MemberAvatar';
import { PeriodTab } from '@/components/OracleStandings';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { CALL_TIERS } from '@/features/bag/callPoints';
import { titlesOf, type ClubStanding } from '@/features/club/clubStandings';
import { formatInteger, toRoman } from '@/lib/format';
import { a, c, f } from '@/theme/tokens';

export interface ClubStandingsProps {
  rows: ClubStanding[];
  year: number | null;
  currentYear: number;
  onYearChange: (year: number | null) => void;
  loading: boolean;
}

/** `+150`, `−200`, `0` — le signe se lit, même en petit. */
function signed(value: number): string {
  if (value > 0) return `+${formatInteger(value)}`;
  if (value < 0) return `−${formatInteger(-value)}`;
  return '0';
}

const GAINS = CALL_TIERS.filter((tier) => 'atLeast' in tier)
  .map((tier) => `${tier.points} à +${(tier as { atLeast: number }).atLeast} %`)
  .reverse()
  .join(', ');
const LOSSES = CALL_TIERS.filter((tier) => 'atMost' in tier)
  .map((tier) => `${-tier.points} à −${-(tier as { atMost: number }).atMost} %`)
  .reverse()
  .join(', ');

/**
 * Le classement du club : les points des calls et ceux de l'Oracle, ensemble.
 *
 * Le premier détient la vérité ; le dernier est à côté de la plaque — si
 * l'écart le justifie, et s'ils sont seuls à leur place.
 */
export function ClubStandings({
  rows,
  year,
  currentYear,
  onYearChange,
  loading,
}: ClubStandingsProps) {
  const titles = titlesOf(rows);

  return (
    <View>
      <SectionTitle
        label="QUI DÉTIENT LA VÉRITÉ"
        labelColor={c.goldMuted}
        gradientFrom={a.fameRule}
      />

      <View className="flex-row" style={{ gap: 18, marginTop: 8, marginBottom: 4 }}>
        <PeriodTab
          label={String(currentYear)}
          active={year === currentYear}
          onPress={() => onYearChange(currentYear)}
        />
        <PeriodTab
          label="DEPUIS TOUJOURS"
          active={year === null}
          onPress={() => onYearChange(null)}
        />
      </View>

      {rows.map((row) => {
        const title =
          row.member.id === titles.truth
            ? { label: 'DÉTIENT LA VÉRITÉ', color: c.gold }
            : row.member.id === titles.offMark
              ? { label: 'À CÔTÉ DE LA PLAQUE', color: c.oxbloodMuted }
              : null;
        return (
          <View
            key={row.member.id}
            className="flex-row items-center border-b border-hairline"
            style={{ gap: 14, paddingVertical: 13, paddingHorizontal: 2 }}
          >
            <View style={{ width: 26 }}>
              <Text style={{ fontFamily: f.serif, fontSize: 18, color: c.goldMuted }}>
                {toRoman(row.rank)}
              </Text>
            </View>
            <MemberAvatar member={row.member} size={28} />
            <View className="flex-1" style={{ gap: 3 }}>
              <View className="flex-row items-center flex-wrap" style={{ columnGap: 8 }}>
                <Text style={{ fontFamily: f.sansSemi, fontSize: 13, color: c.bone }}>
                  {row.member.displayName}
                </Text>
                {title ? (
                  <Micro size={7.5} tracking={1.3} style={{ color: title.color }}>
                    {title.label}
                  </Micro>
                ) : null}
              </View>
              <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted }}>
                {`Calls ${signed(row.calls)}${
                  row.callsLatent !== 0 ? ` (dont ${signed(row.callsLatent)} en jeu)` : ''
                } · Oracle ${signed(row.oracle)}`}
              </Text>
            </View>
            <View className="items-end">
              <Text
                style={{
                  fontFamily: f.serif,
                  fontSize: 19,
                  color: row.total < 0 ? c.oxblood : c.ivory,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {signed(row.total)}
              </Text>
              <Micro size={7.5} tracking={1.4} style={{ color: c.sepiaMuted }}>
                PTS
              </Micro>
            </View>
          </View>
        );
      })}

      {rows.length === 0 ? (
        <Text
          style={{
            fontFamily: f.serifItalic,
            fontSize: 14,
            color: c.sepia,
            paddingVertical: 14,
          }}
        >
          {loading ? 'Chargement…' : 'Aucun membre pour l’instant.'}
        </Text>
      ) : null}

      <Text
        style={{
          fontFamily: f.sans,
          fontSize: 10,
          lineHeight: 16,
          color: c.sepiaFaint,
          marginTop: 10,
        }}
      >
        {`Calls — l’auteur gagne ${GAINS} ; il perd ${LOSSES}. Un vote rapporte ou coûte la moitié, dans son sens : un bull gagne avec l’auteur, un bear quand le call s’effondre. Points en jeu tant que le call court, acquis à sa clôture. Oracle — la justesse des paris résolus, multipliée par leur horizon.`}
      </Text>
    </View>
  );
}
