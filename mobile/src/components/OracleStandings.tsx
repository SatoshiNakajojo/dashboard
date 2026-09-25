import { Pressable, Text, View } from 'react-native';

import { MemberAvatar } from '@/components/MemberAvatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { formatInteger, toRoman } from '@/lib/format';
import { a, c, f } from '@/theme/tokens';
import type { Standing } from '@/features/oracle/standings';

export interface OracleStandingsProps {
  rows: Standing[];
  /** L'année affichée, ou `null` pour « depuis toujours ». */
  year: number | null;
  /** L'année en cours, à Nouméa : celle de l'« Oracle de l'année ». */
  currentYear: number;
  onYearChange: (year: number | null) => void;
  loading: boolean;
}

/**
 * Le classement des oracles : les points cumulés des paris résolus.
 *
 * Même grammaire que le Hall of Fame des calls — rang romain, avatar, nom,
 * chiffre à droite — pour qu'on lise les deux classements de la même façon.
 * Le premier de l'année en cours porte le titre d'« Oracle de l'année ».
 */
export function OracleStandings({
  rows,
  year,
  currentYear,
  onYearChange,
  loading,
}: OracleStandingsProps) {
  return (
    <View>
      <SectionTitle
        label="CLASSEMENT DES ORACLES"
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

      {rows.length === 0 ? (
        <Text
          style={{
            fontFamily: f.serifItalic,
            fontSize: 14,
            color: c.sepia,
            paddingVertical: 14,
            paddingHorizontal: 2,
          }}
        >
          {loading
            ? 'Chargement des paris…'
            : year === null
              ? 'Aucun pari résolu pour l’instant.'
              : `Aucun pari résolu en ${year}.`}
        </Text>
      ) : (
        rows.map((row, index) => (
          <StandingRow
            key={row.member.id}
            row={row}
            // Le titre ne se décerne que sur l'année en cours, et qu'au seul
            // premier : deux ex æquo n'en font pas deux oracles.
            crowned={
              year === currentYear && row.rank === 1 && rows[index + 1]?.rank !== 1
                ? `ORACLE ${currentYear}`
                : null
            }
          />
        ))
      )}

      <Text
        style={{
          fontFamily: f.sans,
          fontSize: 10,
          lineHeight: 16,
          color: c.sepiaFaint,
          marginTop: 10,
        }}
      >
        Un pari résolu rapporte sa justesse, multipliée selon la longueur de la prévision : 1
        pour une semaine, jusqu’à 8 pour dix ans — viser juste de loin est plus dur. Ces points
        comptent aussi au classement du club, avec ceux des calls (onglet Classement).
      </Text>
    </View>
  );
}

/** « 2026 » ou « DEPUIS TOUJOURS » : le choix de période des classements. */
export function PeriodTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={{
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: active ? c.gold : 'transparent',
      }}
    >
      <Micro size={8.5} tracking={1.6} style={{ color: active ? c.ivory : c.sepiaMuted }}>
        {label}
      </Micro>
    </Pressable>
  );
}

function StandingRow({ row, crowned }: { row: Standing; crowned: string | null }) {
  return (
    <View
      className="flex-row items-center border-b border-hairline"
      style={{ gap: 14, paddingVertical: 14, paddingHorizontal: 2 }}
    >
      <View style={{ width: 26 }}>
        <Text style={{ fontFamily: f.serif, fontSize: 18, color: c.goldMuted }}>
          {toRoman(row.rank)}
        </Text>
      </View>

      <MemberAvatar member={row.member} size={28} />

      <View className="flex-1" style={{ gap: 3 }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontFamily: f.sansSemi, fontSize: 13, color: c.bone }}
          >
            {row.member.displayName}
          </Text>
          {crowned ? (
            <Micro size={7.5} tracking={1.4} style={{ color: c.gold }}>
              {crowned}
            </Micro>
          ) : null}
        </View>
        <Text style={{ fontFamily: f.label, fontSize: 10, color: c.sepiaMuted }}>
          {`${row.bets} ${row.bets > 1 ? 'paris' : 'pari'} · moy. ${Math.round(row.average)} % · meilleur ${Math.round(row.best)} %`}
        </Text>
      </View>

      <View className="items-end">
        <Text
          style={{
            fontFamily: f.serif,
            fontSize: 19,
            color: c.ivory,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatInteger(row.points)}
        </Text>
        <Micro size={7.5} tracking={1.4} style={{ color: c.sepiaMuted }}>
          PTS
        </Micro>
      </View>
    </View>
  );
}
