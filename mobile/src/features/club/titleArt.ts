import type { ImageSourcePropType } from 'react-native';

import type { ClubTitleKey } from './clubStandings';

/**
 * Les affiches des titres du club, en trois tailles :
 *
 *   • `poster` — l'affiche entière, 1080 px : plein écran et page d'un membre ;
 *   • `card` — la même en 540 px, pour la galerie où elles défilent ensemble ;
 *   • `medal` — le personnage dans son halo, rogné en carré de 240 px, que
 *     l'écran arrondit : le podium et les lignes du classement.
 *
 * À part de `clubStandings.ts` : un `require` d'image n'a pas de sens pour les
 * tests, qui tournent sous Node. Le test des titres vérifie seulement que les
 * fichiers existent.
 */
export const TITLE_ART: Record<
  ClubTitleKey,
  { poster: ImageSourcePropType; card: ImageSourcePropType; medal: ImageSourcePropType }
> = {
  oracle: {
    poster: require('../../../assets/titles/oracle.jpg'),
    card: require('../../../assets/titles/oracle-card.jpg'),
    medal: require('../../../assets/titles/oracle-medal.jpg'),
  },
  loup: {
    poster: require('../../../assets/titles/loup.jpg'),
    card: require('../../../assets/titles/loup-card.jpg'),
    medal: require('../../../assets/titles/loup-medal.jpg'),
  },
  chercheur: {
    poster: require('../../../assets/titles/chercheur.jpg'),
    card: require('../../../assets/titles/chercheur-card.jpg'),
    medal: require('../../../assets/titles/chercheur-medal.jpg'),
  },
  analyste: {
    poster: require('../../../assets/titles/analyste.jpg'),
    card: require('../../../assets/titles/analyste-card.jpg'),
    medal: require('../../../assets/titles/analyste-medal.jpg'),
  },
  fournisseur: {
    poster: require('../../../assets/titles/fournisseur.jpg'),
    card: require('../../../assets/titles/fournisseur-card.jpg'),
    medal: require('../../../assets/titles/fournisseur-medal.jpg'),
  },
};
