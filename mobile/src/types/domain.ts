import type { AssetClass } from '@/theme/tokens';
import type { Point } from '@/lib/chart';

export type Uuid = string;

/** Membre du club — `profiles`. Une couleur par membre, stable partout. */
export interface Member {
  id: Uuid;
  displayName: string;
  initials: string;
  color: string;
}

/** `events` */
export interface ClubEvent {
  id: Uuid;
  startsAt: string;
  theme: string;
  location: string;
  tag: string;
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
  createdAt: string;
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
export interface Prediction {
  id: Uuid;
  userId: Uuid;
  season: string;
  /** Points dans le repère logique 360 × 285. */
  pathData: Point[];
  /** Date de verrouillage. Passée ⇒ lecture seule. */
  lockedAt: string | null;
  /** Empreinte courte calculée au verrouillage, affichée `HASH 8F2A`. */
  hash: string | null;
}

/** Prédiction enrichie pour la liste « prédictions déposées ». */
export interface PredictionView extends Prediction {
  author: Member;
  /** Prix visé au jour 90. */
  targetPrice: number;
  /** Écart absolu moyen à la courbe réelle, en %. `null` avant résolution. */
  gapPercent: number | null;
}

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
