import { Text, type TextProps } from 'react-native';

import { cn } from '@/lib/cn';

export interface MicroProps extends TextProps {
  /** Interlettrage en px — déjà converti depuis les `em` du design (README §8.1). */
  tracking?: number;
  size?: number;
  className?: string;
}

/**
 * Le micro-label espacé, présent sur tous les écrans.
 *
 * Sans son `letterSpacing`, le design s'effondre (SPEC §7) : le composant le
 * rend obligatoire plutôt que de le laisser à la discrétion de l'appelant.
 */
export function Micro({
  tracking = 2.34,
  size = 9,
  className,
  style,
  children,
  ...rest
}: MicroProps) {
  return (
    <Text
      className={cn('font-mono text-sepia', className)}
      // Les micro-labels sont toujours en majuscules (SPEC §0, helper `microLabel`).
      style={[{ fontSize: size, letterSpacing: tracking, textTransform: 'uppercase' }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
