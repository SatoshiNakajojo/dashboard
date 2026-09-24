import type { AssetClass } from '@/theme/tokens';

import type { ProfileLink } from '@/lib/profileLinks';

export type Uuid = string;

/** Membre du club — `profiles`. Une couleur par membre, stable partout. */
export interface Member {
  id: Uuid;
  displayName: string;
  initials: string;
  color: string;
  /** Photo de profil. `null` = on affiche les initiales, comme avant. */
  avatarUrl: string | null;
  /** Ce que le membre partage au club : GitHub, adresse BTC, MetaMask… */
  links: ProfileLink[];
}

/** `events` */
export interface ClubEvent {
  id: Uuid;
  startsAt: string;
  title: string;
  location: string;
  /** Crypto Night, Stock Night… une soirée peut en porter plusieurs. */
  themes: string[];
}

/** `potluck_items` — une ligne « qui amène quoi ». */
export interface PotluckItem {
  id: Uuid;
  eventId: Uuid;
  itemName: string;
  assignedUserId: Uuid | null;
  position: number;
}

/** Ligne de potluck enrichie du membre assigné, prête à l'affichage. */
export interface PotluckRow extends PotluckItem {
  assignee: Member | null;
  /** Assignée à l'utilisateur courant. */
  isMine: boolean;
  /** Libre — donc cliquable par tout le monde. */
  isFree: boolean;
  /** Prise par quelqu'un d'autre — donc verrouillée. */
  isLocked: boolean;
  /** Écriture optimiste en attente de confirmation serveur. */
  isPending: boolean;
}

/** `tickers` — un call d'investissement publié au club. */
export interface Ticker {
  id: Uuid;
  userId: Uuid;
  symbol: string;
  assetClass: AssetClass;
  entryPrice: number;
  currentPrice: number | null;
  /** Prix du BTC au moment de l'entrée — sert au calcul de la perf vs ₿. */
  entryBtcPrice: number | null;
  sizeUsd: number | null;
  thesis: string;
  /**
   * De quoi redemander un cours, sans quoi un call reste figé à son prix
   * d'entrée. La base les stockait déjà ; ils étaient perdus à la lecture.
   */
  coingeckoId: string | null;
  yahooSymbol: string | null;
  /** Dernier rafraîchissement réussi du cours. `null` si jamais rafraîchi. */
  priceUpdatedAt: string | null;
  createdAt: string;
  /**
   * Jour de l'entrée, `AAAA-MM-JJ` à Nouméa. `null` pour les calls d'avant la
   * colonne : leur jour d'entrée est celui de leur publication.
   */
  enteredOn: string | null;
  /** Dernière modification par l'auteur — posée par la base, affichée sur la carte. */
  editedAt: string | null;
}

/** Call prêt à l'affichage : perfs calculées, votes agrégés. */
export interface CallView extends Ticker {
  author: Member;
  /** Perf en dollars, en %. `null` si le prix courant est indisponible. */
  performancePercent: number | null;
  /** Perf relative à Bitcoin, en %. `null` pour un call BTC (le référentiel). */
  vsBtcPercent: number | null;
  bull: number;
  bear: number;
  myVote: Vote | null;
}

export type Vote = 'bull' | 'bear';

/** `predictions` — le tracé d'un membre pour la saison. */
/*
 * `Prediction` et `PredictionView` ont disparu : un pari de l'Oracle est un
 * `Bet` (`src/features/oracle/betting.ts`), avec son horizon, son calendrier
 * fixé par le serveur, et un tracé stocké en prix plutôt qu'en coordonnées de
 * toile. Voir la migration `20260923090000_prediction_horizons.sql`.
 */

/** Un point de la série BTC : jour du repère + prix. */
export interface MarketPoint {
  day: number;
  price: number;
}

/** Cours spot alimentant le bandeau. */
export interface BtcSpot {
  usd: number;
  change24h: number;
  /** Horodatage de la donnée servie — permet d'afficher `HORS LIGNE`. */
  fetchedAt: number;
  /** Vrai si la valeur vient du cache alors que le réseau a échoué. */
  stale: boolean;
}
