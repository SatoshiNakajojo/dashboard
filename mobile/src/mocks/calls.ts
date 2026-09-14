import type { Ticker, Vote } from '@/types/domain';
import { MEMBERS } from './members';

/** Cours BTC de référence du prototype — DONNEES_FICTIVES §Oracle. */
export const MOCK_BTC_SPOT = 120_911;
export const MOCK_BTC_CHANGE_24H = 2.41;
export const MOCK_BLOCK_HEIGHT = 912_447;

/**
 * Les fixtures du design donnent des **pourcentages affichés**, pas des prix.
 * On remonte aux prix pour que la vue calcule vraiment ce qu'elle montre,
 * plutôt que de recopier des chaînes de caractères.
 */
const priceFromPerf = (entry: number, perfPercent: number) => entry * (1 + perfPercent / 100);

/** `entryBtc` tel que la perf vs ₿ retombe sur la valeur du design. */
const btcEntryFromVs = (perfPercent: number, vsPercent: number) =>
  (MOCK_BTC_SPOT * (1 + vsPercent / 100)) / (1 + perfPercent / 100);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * Les horodatages sont relatifs à l'instant courant, pas à une date figée :
 * la fixture doit toujours se lire « il y a 2 h », « hier », « il y a 5 j »
 * comme dans le design, quel que soit le jour où on ouvre l'app.
 */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Calls du fil « Le Bag » — DONNEES_FICTIVES §Calls. */
export const MOCK_TICKERS: Ticker[] = [
  {
    id: '44444444-4444-4444-8444-000000000001',
    userId: MEMBERS.lea!.id,
    symbol: '$BTC',
    assetClass: 'BTC',
    entryPrice: 103_200,
    currentPrice: priceFromPerf(103_200, 14.9),
    entryBtcPrice: 103_200, // un call BTC est son propre référentiel
    sizeUsd: 12_500,
    thesis:
      'Le seul actif que je garde dix ans. DCA hebdomadaire, jamais de levier, cold storage.',
    createdAt: ago(2 * HOUR),
  },
  {
    id: '44444444-4444-4444-8444-000000000002',
    userId: MEMBERS.john!.id,
    symbol: '$MSTR',
    assetClass: 'ACTION',
    entryPrice: 412,
    currentPrice: priceFromPerf(412, 12.4),
    entryBtcPrice: btcEntryFromVs(12.4, -2.5),
    sizeUsd: 9_000,
    thesis: 'Levier propre sur BTC via le bilan. Tant que la trésorerie achète, je tiens.',
    createdAt: ago(DAY),
  },
  {
    id: '44444444-4444-4444-8444-000000000003',
    userId: MEMBERS.alex!.id,
    symbol: '$ETH',
    assetClass: 'ALT',
    entryPrice: 3_940,
    currentPrice: priceFromPerf(3_940, 21.8),
    entryBtcPrice: btcEntryFromVs(21.8, 6.9),
    sizeUsd: 4_200,
    thesis: 'Le seul alt que je garde. Staking et L2 ; je sors si le ratio ETH/BTC casse.',
    createdAt: ago(2 * DAY),
  },
  {
    id: '44444444-4444-4444-8444-000000000004',
    userId: MEMBERS.rayan!.id,
    symbol: '$IBIT',
    assetClass: 'ETF',
    entryPrice: 58.3,
    currentPrice: priceFromPerf(58.3, 11.2),
    entryBtcPrice: btcEntryFromVs(11.2, -3.7),
    sizeUsd: 6_800,
    thesis: 'Une poche BTC dans l’enveloppe fiscale. Pratique, mais ce ne sont pas mes clés.',
    createdAt: ago(3 * DAY),
  },
  {
    id: '44444444-4444-4444-8444-000000000005',
    userId: MEMBERS.marco!.id,
    symbol: '$WIF',
    assetClass: 'DEGEN',
    entryPrice: 1.84,
    currentPrice: priceFromPerf(1.84, -61),
    entryBtcPrice: btcEntryFromVs(-61, -66.4),
    sizeUsd: 1_100,
    thesis: 'Aucune thèse. Pur degen. Assumé jusqu’au bout.',
    createdAt: ago(5 * DAY),
  },
];

/**
 * Votes agrégés, **vote de l'utilisateur courant compris** — c'est la forme
 * que renvoie le serveur, donc la seule que l'UI ait à savoir interpréter.
 *
 * Les totaux reprennent ceux affichés par le prototype. Celui de `$WIF`
 * (1 bull + 7 bear) dépasse d'une voix les 7 membres du club : la fixture du
 * design est sur-souscrite. Le seed Supabase, lui, reste à un vote par membre.
 */
export const MOCK_VOTES: Record<string, { bull: number; bear: number }> = {
  [MOCK_TICKERS[0]!.id]: { bull: 7, bear: 0 },
  [MOCK_TICKERS[1]!.id]: { bull: 5, bear: 2 },
  [MOCK_TICKERS[2]!.id]: { bull: 4, bear: 3 },
  [MOCK_TICKERS[3]!.id]: { bull: 3, bear: 4 },
  [MOCK_TICKERS[4]!.id]: { bull: 1, bear: 7 },
};

/** Vote de l'utilisateur courant, par identifiant de call. */
export const MOCK_MY_VOTES: Record<string, Vote> = {
  [MOCK_TICKERS[0]!.id]: 'bull',
  [MOCK_TICKERS[4]!.id]: 'bear',
};

/**
 * Classements de la saison — DONNEES_FICTIVES §Hall of Fame / §Rekt Board.
 *
 * Ce sont des positions closes d'anciennes saisons, pas les calls du fil :
 * elles ne se déduisent donc pas de `MOCK_TICKERS`. En production, la même
 * liste vient de `tickers` filtré par saison et trié par `splitLeaderboards`.
 */
export interface LeaderboardEntry {
  memberId: string;
  symbol: string;
  percent: number;
  note: string;
}

export const MOCK_FAME: LeaderboardEntry[] = [
  { memberId: MEMBERS.lea!.id, symbol: '$BTC', percent: 96, note: 'DCA 2 ans · 0,84 ₿' },
  { memberId: MEMBERS.alex!.id, symbol: '$NVDA', percent: 74, note: '+31 % vs ₿' },
  { memberId: MEMBERS.john!.id, symbol: '$MSTR', percent: 63, note: '+19 % vs ₿' },
];

export const MOCK_REKT: LeaderboardEntry[] = [
  { memberId: MEMBERS.marco!.id, symbol: '$WIF', percent: -61, note: '-66 % vs ₿' },
  { memberId: MEMBERS.rayan!.id, symbol: '$ETHW', percent: -48, note: 'fork oubliée' },
  { memberId: MEMBERS.sofia!.id, symbol: '$GME', percent: -22, note: 'nostalgie 2021' },
];
