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
      className={cn('font-label text-sepia', className)}
      // Les micro-labels sont toujours en majuscules (SPEC §0, helper `microLabel`).
      // Chiffres tabulaires : Inter les a, et un compteur ou un montant ne
      // doit pas bouger de largeur d'une valeur à l'autre.
      style={[
        {
          fontSize: size,
          letterSpacing: tracking,
          textTransform: 'uppercase',
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
