import { Fragment, useEffect, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { BLOCK_COUNT, BLOCK_MS, minedAt } from '@/lib/mining';
import { brand } from '@/theme/brand';
import { c } from '@/theme/tokens';

/**
 * L'écran d'attente : le logo, et une chaîne de blocs qui se mine.
 *
 * Des blocs chaînés, pas des carrés : chacun porte ses deux lignes de données
 * et un maillon le relie au suivant.
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
  // La même taille que la coquille HTML (`min(60vw, 240px)`) : le relais de
  // l'une à l'autre ne doit pas faire sauter le logo.
  const { width } = useWindowDimensions();
  const logo = Math.min(width * 0.6, 240);

  return (
    <View className="flex-1 bg-ink items-center justify-center" style={{ gap: 26 }}>
      <Image
        source={require('../../assets/brand/logo.png')}
        style={{ width: logo, height: logo }}
        resizeMode="contain"
        accessibilityLabel={brand.name}
      />

      <View
        className="flex-row items-center"
        accessibilityRole="progressbar"
        accessibilityLabel="Chargement"
      >
        {Array.from({ length: BLOCK_COUNT }, (_, index) => (
          <Fragment key={index}>
            {/* Le maillon s'allume avec le bloc qu'il amène, pas avec celui
                qu'il quitte : c'est ce qui fait une chaîne et pas une rangée. */}
            {index > 0 ? <Link lit={index < mined} /> : null}
            <Block mined={index < mined} />
          </Fragment>
        ))}
      </View>

      <Micro tracking={2.2} style={{ color: c.sepiaMuted }}>
        MINAGE EN COURS
      </Micro>
    </View>
  );
}

/** Géométrie partagée avec la coquille HTML — les deux doivent se ressembler. */
const BLOCK = 16;
const LINK = 8;

/** Un bloc, avec ses deux lignes de données. */
function Block({ mined }: { mined: boolean }) {
  return (
    <View
      style={{
        width: BLOCK,
        height: BLOCK,
        borderRadius: 2,
        borderWidth: 1,
        // Le bloc miné se remplit ; celui qui reste garde son contour, pour
        // qu'on voie la longueur de la chaîne et pas seulement ce qui est fait.
        borderColor: mined ? c.gold : c.dial,
        backgroundColor: mined ? c.gold : 'transparent',
        justifyContent: 'center',
        paddingHorizontal: 3,
        gap: 2,
      }}
    >
      <View style={{ height: 1, backgroundColor: mined ? c.ink : c.dial }} />
      <View style={{ height: 1, width: '60%', backgroundColor: mined ? c.ink : c.dial }} />
    </View>
  );
}

/** Le maillon entre deux blocs. */
function Link({ lit }: { lit: boolean }) {
  return (
    <View
      style={{
        width: LINK,
        height: 2,
        borderRadius: 1,
        backgroundColor: lit ? c.gold : c.dial,
      }}
    />
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
