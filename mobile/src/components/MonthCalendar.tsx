import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { clubDayKey, buildMonth, monthLabel, WEEKDAYS } from '@/lib/monthGrid';
import { a, c, f, radius } from '@/theme/tokens';
import type { ClubEvent } from '@/types/domain';

export interface MonthCalendarProps {
  year: number;
  month: number;
  events: readonly ClubEvent[];
  /** Jour sélectionné, `2026-10-03`. `null` tant qu'on n'a rien touché. */
  selected: string | null;
  onSelect: (day: string | null) => void;
  onShiftMonth: (delta: number) => void;
}

/**
 * Le mois en grille, comme un agenda.
 *
 * Elle ne remplace pas la liste : une liste dit ce qui arrive, une grille dit
 * où sont les trous. C'est ce qu'on regarde pour proposer une date, et c'est à
 * ça qu'elle sert ici — on tape un jour, la liste dessous s'y réduit.
 *
 * Six lignes toujours, même quand cinq suffiraient : sans ça, la grille saute
 * d'une hauteur en changeant de mois, et l'œil perd le fil.
 */
export function MonthCalendar({
  year,
  month,
  events,
  selected,
  onSelect,
  onShiftMonth,
}: MonthCalendarProps) {
  const weeks = useMemo(() => buildMonth(year, month), [year, month]);

  /** Combien de soirées par jour — une pastille par soirée, jusqu'à trois. */
  const byDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = clubDayKey(event.startsAt);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.card,
        padding: 14,
        marginBottom: 20,
      }}
    >
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Arrow label="Mois précédent" direction="left" onPress={() => onShiftMonth(-1)} />
        <Text
          style={{ fontFamily: f.labelMed, fontSize: 11, letterSpacing: 1.8, color: c.ivory }}
        >
          {monthLabel(year, month)}
        </Text>
        <Arrow label="Mois suivant" direction="right" onPress={() => onShiftMonth(1)} />
      </View>

      <View className="flex-row" style={{ marginBottom: 6 }}>
        {WEEKDAYS.map((letter, index) => (
          <View key={index} style={{ flex: 1, alignItems: 'center' }}>
            <Micro size={8} tracking={1.2} style={{ color: c.sepiaFaint }}>
              {letter}
            </Micro>
          </View>
        ))}
      </View>

      {weeks.map((week, rowIndex) => (
        <View key={rowIndex} className="flex-row">
          {week.map((day) => {
            const count = byDay.get(day.key) ?? 0;
            const isSelected = selected === day.key;
            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day.day} — ${count} soirée${count > 1 ? 's' : ''}`}
                // Retaper le jour déjà choisi rend la liste entière : une
                // sélection dont on ne peut pas sortir est un piège.
                onPress={() => onSelect(isSelected ? null : day.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingTop: 7,
                  paddingBottom: 5,
                  borderRadius: radius.button,
                  backgroundColor: isSelected ? a.rsvpGoldBg : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected ? a.rsvpGoldBorder : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 12,
                    color: !day.inMonth
                      ? c.sepiaFaint
                      : day.isToday
                        ? c.gold
                        : count > 0
                          ? c.ivory
                          : c.sepia,
                  }}
                >
                  {day.day}
                </Text>
                {/* Les pastilles disent « il se passe quelque chose », pas quoi :
                    le détail est dans la liste, un point suffit ici. */}
                <View className="flex-row" style={{ height: 6, marginTop: 3, gap: 2 }}>
                  {Array.from({ length: Math.min(count, 3) }, (_, dot) => (
                    <View
                      key={dot}
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: day.inMonth ? c.gold : c.goldMuted,
                      }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

/**
 * Chevron dessiné — deux traits, comme la coche : aucune police à charger.
 *
 * Le sens compte plus qu'il n'y paraît : un chevron qui pointe du mauvais côté
 * fait reculer là où on croyait avancer. `left` doit donner `<`, donc le trait
 * du haut penche `/` et celui du bas `\` — l'inverse de la rotation naïve.
 */
function Arrow({
  label,
  direction,
  onPress,
}: {
  label: string;
  direction: 'left' | 'right';
  onPress: () => void;
}) {
  const tilt = direction === 'left' ? -1 : 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={12}
      style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 9, height: 12 }}>
        <View
          style={{
            position: 'absolute',
            left: 1,
            top: 2,
            width: 7,
            height: 1.4,
            backgroundColor: c.sepiaMuted,
            transform: [{ rotate: `${45 * tilt}deg` }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 1,
            top: 8,
            width: 7,
            height: 1.4,
            backgroundColor: c.sepiaMuted,
            transform: [{ rotate: `${-45 * tilt}deg` }],
          }}
        />
      </View>
    </Pressable>
  );
}
