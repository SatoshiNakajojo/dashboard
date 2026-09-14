import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { c } from '@/theme/tokens';
import { Micro } from './Micro';

export interface SectionTitleProps {
  label: string;
  /** Qualificatif poussé à droite — `3 / 6`, `R.I.P.`, `≥ +50 % VS ₿`. */
  hint?: string;
  labelColor?: string;
  /** Filet dégradé (classements) plutôt qu'uni (sections ordinaires). */
  gradientFrom?: string;
}

/** Label espacé + filet extensible + qualificatif. La grammaire de toutes les sections. */
export function SectionTitle({ label, hint, labelColor = c.sepia, gradientFrom }: SectionTitleProps) {
  return (
    <View className="flex-row items-center gap-3 mb-1.5">
      <Micro style={{ color: labelColor }}>{label}</Micro>

      {gradientFrom ? (
        <LinearGradient
          colors={[gradientFrom, c.border]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, height: 1 }}
        />
      ) : (
        <View className="flex-1 h-px bg-border" />
      )}

      {hint ? (
        <Micro tracking={0.9} style={{ color: c.sepiaMuted }}>
          {hint}
        </Micro>
      ) : null}
    </View>
  );
}
