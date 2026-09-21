import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { BLOCK_COUNT, BLOCK_MS, minedAt } from '@/lib/mining';
import { brand } from '@/theme/brand';
import { c } from '@/theme/tokens';

/**
 * L'écran d'attente : le logo, et une chaîne de blocs qui se mine.
 *
 * Il tient deux moments. Sur le web, la coquille HTML (`scripts/boot-shell.mjs`)
 * dessine exactement la même chose dès le premier octet, bien avant que les
 * 2,7 Mo de bundle n'arrivent ; celui-ci prend le relais pendant le chargement
 * des polices, et sur mobile natif il est seul. Les deux doivent se ressembler
 * au pixel près, sans quoi le passage de l'un à l'autre clignote.
 *
 * Pas de pourcentage : on ignore le débit, et une barre bloquée à 80 % ressemble
 * à une panne. Des blocs qui se minent en boucle ne promettent rien d'autre que
 * « ça travaille », ce qui est la seule chose vraie.
 */
export function BootScreen() {
  const mined = useMining();

  return (
    <View className="flex-1 bg-ink items-center justify-center" style={{ gap: 26 }}>
      <Image
        source={require('../../assets/brand/logo.png')}
        style={{ width: 132, height: 132 }}
        resizeMode="contain"
        accessibilityLabel={brand.name}
      />

      <View
        className="flex-row"
        accessibilityRole="progressbar"
        accessibilityLabel="Chargement"
        style={{ gap: 5 }}
      >
        {Array.from({ length: BLOCK_COUNT }, (_, index) => (
          <View
            key={index}
            style={{
              width: 11,
              height: 11,
              borderRadius: 1,
              borderWidth: 1,
              // Le bloc miné se remplit ; celui qui reste garde son contour,
              // pour qu'on voie la longueur de la chaîne et pas seulement ce
              // qui est fait.
              borderColor: index < mined ? c.gold : c.dial,
              backgroundColor: index < mined ? c.gold : 'transparent',
            }}
          />
        ))}
      </View>

      <Micro tracking={2.2} style={{ color: c.sepiaMuted }}>
        MINAGE EN COURS
      </Micro>
    </View>
  );
}

/** Le compteur de blocs, avancé par l'horloge plutôt que par un compteur. */
function useMining(): number {
  const [mined, setMined] = useState(0);

  useEffect(() => {
    const start = Date.now();
    // On relit l'horloge à chaque tick au lieu d'incrémenter : un onglet mis en
    // veille reprend à la bonne case, sans rattrapage saccadé.
    const timer = setInterval(() => setMined(minedAt(Date.now() - start)), BLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  return mined;
}
