import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Arrow } from '@/components/MonthCalendar';
import { Micro } from '@/components/ui/Micro';
import {
  fieldDateFromKey,
  keyFromFieldDate,
  longDateLabel,
  monthOfKey,
  shortDateLabel,
  timeOptions,
} from '@/lib/datePicker';
import { buildMonth, clubDayKey, monthLabel, shiftMonth, WEEKDAYS } from '@/lib/monthGrid';
import { a, c, f, radius } from '@/theme/tokens';

export interface DateTimeFieldsProps {
  /** `03/10/2026` — le format que lit `parseClubDateTime`. */
  date: string;
  /** `19:30`. */
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

/** Hauteur d'une heure dans le menu : sert à le faire défiler jusqu'à l'heure choisie. */
const TIME_ROW = 40;
const TIME_MENU_HEIGHT = 5.5 * TIME_ROW;

/**
 * La date et l'heure d'une soirée, sans rien taper.
 *
 * Taper `03/10/2026` au clavier numérique d'un téléphone, avec ses barres
 * obliques, c'était l'erreur assurée. On touche le champ : la date ouvre un
 * calendrier, l'heure un menu déroulant par quart d'heure. Un seul des deux
 * est ouvert à la fois, et il se referme au choix.
 *
 * Les jours passés sont grisés : on n'organise pas une soirée hier. Celui déjà
 * choisi reste sélectionnable — modifier une soirée passée ne doit pas la
 * forcer à changer de date.
 */
export function DateTimeFields({
  date,
  time,
  onDateChange,
  onTimeChange,
}: DateTimeFieldsProps) {
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const selected = keyFromFieldDate(date);
  const today = clubDayKey(new Date().toISOString());
  const [view, setView] = useState(() => monthOfKey(selected ?? today));

  const toggle = (panel: 'date' | 'time') => {
    if (panel === 'date' && open !== 'date') setView(monthOfKey(selected ?? today));
    setOpen((current) => (current === panel ? null : panel));
  };

  return (
    <View>
      <View
        className="flex-row"
        style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hairline }}
      >
        <FieldButton
          label="DATE"
          value={selected ? shortDateLabel(selected) : 'Choisir'}
          accessibilityLabel={`Date : ${selected ? longDateLabel(selected) : 'à choisir'}`}
          active={open === 'date'}
          onPress={() => toggle('date')}
        />
        <FieldButton
          label="HEURE"
          value={time || 'Choisir'}
          accessibilityLabel={`Heure : ${time || 'à choisir'}`}
          active={open === 'time'}
          onPress={() => toggle('time')}
          divided
        />
      </View>

      {open === 'date' ? (
        <DatePanel
          year={view.year}
          month={view.month}
          selected={selected}
          today={today}
          onShiftMonth={(delta) =>
            setView((current) => shiftMonth(current.year, current.month, delta))
          }
          onPick={(key) => {
            onDateChange(fieldDateFromKey(key));
            setOpen(null);
          }}
        />
      ) : null}

      {open === 'time' ? (
        <TimePanel
          time={time}
          onPick={(value) => {
            onTimeChange(value);
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function FieldButton({
  label,
  value,
  accessibilityLabel,
  active,
  divided,
  onPress,
}: {
  label: string;
  value: string;
  accessibilityLabel: string;
  active: boolean;
  divided?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 13,
        paddingLeft: divided ? 16 : 0,
        borderLeftWidth: divided ? 1 : 0,
        borderLeftColor: c.hairline,
      }}
    >
      <Micro size={8.5} tracking={1.7} style={{ color: active ? c.gold : c.sepiaMuted }}>
        {label}
      </Micro>
      <View className="flex-row items-center" style={{ marginTop: 7, gap: 8 }}>
        <Text style={{ fontFamily: f.labelMed, fontSize: 15, color: c.ivory }}>{value}</Text>
        <Caret open={active} />
      </View>
    </Pressable>
  );
}

/** Chevron dessiné, vers le bas — vers le haut quand le panneau est ouvert. */
function Caret({ open }: { open: boolean }) {
  const tilt = open ? -1 : 1;
  return (
    <View style={{ width: 10, height: 7 }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 3,
          width: 6,
          height: 1.4,
          backgroundColor: c.gold,
          transform: [{ rotate: `${45 * tilt}deg` }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 3,
          width: 6,
          height: 1.4,
          backgroundColor: c.gold,
          transform: [{ rotate: `${-45 * tilt}deg` }],
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function DatePanel({
  year,
  month,
  selected,
  today,
  onShiftMonth,
  onPick,
}: {
  year: number;
  month: number;
  selected: string | null;
  today: string;
  onShiftMonth: (delta: number) => void;
  onPick: (key: string) => void;
}) {
  const weeks = useMemo(() => buildMonth(year, month), [year, month]);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.card,
        padding: 12,
        marginTop: 12,
      }}
    >
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <Arrow label="Mois précédent" direction="left" onPress={() => onShiftMonth(-1)} />
        <Text
          style={{ fontFamily: f.labelMed, fontSize: 11, letterSpacing: 1.8, color: c.ivory }}
        >
          {monthLabel(year, month)}
        </Text>
        <Arrow label="Mois suivant" direction="right" onPress={() => onShiftMonth(1)} />
      </View>

      <View className="flex-row" style={{ marginBottom: 4 }}>
        {WEEKDAYS.map((letter, index) => (
          <View key={index} style={{ flex: 1, alignItems: 'center' }}>
            <Micro size={8} tracking={1.2} style={{ color: c.sepiaFaint }}>
              {letter}
            </Micro>
          </View>
        ))}
      </View>

      {weeks.map((week, row) => (
        <View key={row} className="flex-row">
          {week.map((day) => {
            const isSelected = day.key === selected;
            const past = day.key < today && !isSelected;
            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityLabel={longDateLabel(day.key)}
                accessibilityState={{ selected: isSelected, disabled: past }}
                disabled={past}
                onPress={() => onPick(day.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 38,
                  borderRadius: radius.button,
                  backgroundColor: isSelected ? a.rsvpGoldBg : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected
                    ? a.rsvpGoldBorder
                    : day.isToday
                      ? c.border
                      : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 13,
                    color: isSelected
                      ? c.gold
                      : past
                        ? c.sepiaFaint
                        : !day.inMonth
                          ? c.sepiaMuted
                          : day.isToday
                            ? c.gold
                            : c.ivory,
                    opacity: past ? 0.45 : 1,
                  }}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

function TimePanel({ time, onPick }: { time: string; onPick: (time: string) => void }) {
  const options = useMemo(() => timeOptions(time), [time]);
  const scroller = useRef<ScrollView>(null);
  // L'heure choisie arrive au milieu du menu, pas en haut : on voit aussi
  // celles d'avant et d'après.
  const index = Math.max(0, options.indexOf(time));
  const offset = Math.max(0, index * TIME_ROW - TIME_MENU_HEIGHT / 2 + TIME_ROW / 2);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.card,
        marginTop: 12,
        height: TIME_MENU_HEIGHT,
        overflow: 'hidden',
      }}
    >
      <ScrollView
        ref={scroller}
        nestedScrollEnabled
        contentOffset={{ x: 0, y: offset }}
        onLayout={() => scroller.current?.scrollTo({ y: offset, animated: false })}
        showsVerticalScrollIndicator
      >
        {options.map((option) => {
          const isSelected = option === time;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onPick(option)}
              style={({ pressed }) => ({
                height: TIME_ROW,
                justifyContent: 'center',
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: c.hairline,
                backgroundColor: isSelected
                  ? a.rsvpGoldBg
                  : pressed
                    ? a.pressed
                    : 'transparent',
              })}
            >
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 15,
                  color: isSelected ? c.gold : option.endsWith(':00') ? c.ivory : c.sepia,
                }}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
