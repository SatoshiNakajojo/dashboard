import type { Ticker, Vote } from '@/types/domain';
import type { VoteRow } from '@/features/bag/source';
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
/** Le jour du club, `AAAA-MM-JJ` — Nouméa a onze heures d'avance sur UTC. */
const clubDay = (ms: number) => new Date(ms + 11 * HOUR).toISOString().slice(0, 10);

/** La fenêtre de vote que poserait la base : publication + 72 h. */
function withWindows(
  rows: Omit<Ticker, 'votesCloseAt' | 'entryConfirmedAt' | 'exitConfirmedAt'>[],
): Ticker[] {
  return rows.map((row) => ({
    ...row,
    votesCloseAt: new Date(Date.parse(row.createdAt) + 72 * HOUR).toISOString(),
    entryConfirmedAt: row.createdAt,
    exitConfirmedAt: row.closedAt,
  }));
}

/** Calls en cours — DONNEES_FICTIVES §Calls. Les cinq cartes du fil. */
export const MOCK_CURRENT_TICKERS: Ticker[] = withWindows([
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
    coingeckoId: 'bitcoin',
    yahooSymbol: null,
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    exitPrice: null,
    exitBtcPrice: null,
    closedOn: null,
    closedAt: null,
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
    coingeckoId: null,
    yahooSymbol: 'MSTR',
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    exitPrice: null,
    exitBtcPrice: null,
    closedOn: null,
    closedAt: null,
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
    coingeckoId: 'ethereum',
    yahooSymbol: null,
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    exitPrice: null,
    exitBtcPrice: null,
    closedOn: null,
    closedAt: null,
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
    coingeckoId: null,
    yahooSymbol: 'IBIT',
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    exitPrice: null,
    exitBtcPrice: null,
    closedOn: null,
    closedAt: null,
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
    coingeckoId: 'dogwifcoin',
    yahooSymbol: null,
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    exitPrice: null,
    exitBtcPrice: null,
    closedOn: null,
    closedAt: null,
    createdAt: ago(5 * DAY),
  },
]);

/**
 * Les votes du club, avec leur phrase.
 *
 * Les totaux du prototype (`$BTC` 7 bull, `$WIF` 1 bull + 7 bear) dépassaient
 * les six membres qui peuvent voter sur un call — l'auteur ne vote pas sur le
 * sien. Ce sont maintenant de vrais membres, au plus six par call. « Toi »
 * n'a pas encore voté sur `$MSTR` ni sur `$ETH` : c'est là qu'on essaie.
 */
const VOTES: [ticker: number, member: keyof typeof MEMBERS, side: Vote, reason: string][] = [
  [0, 'me', 'bull', 'Le seul actif qui ne se dilue pas.'],
  [0, 'john', 'bull', 'Les ETF absorbent plus que ce que les mineurs produisent.'],
  [0, 'alex', 'bull', 'Halving passé, offre qui se raréfie.'],
  [0, 'marco', 'bull', 'DCA sans levier : difficile d’avoir tort sur dix ans.'],
  [0, 'sofia', 'bull', 'Les trésoreries d’entreprise commencent à peine.'],
  [0, 'rayan', 'bull', 'Cold storage, discipline : rien à redire.'],
  [1, 'alex', 'bull', 'Tant que la prime sur l’actif net tient, ça monte.'],
  [1, 'marco', 'bull', 'Un levier sur BTC sans liquidation possible.'],
  [1, 'sofia', 'bull', 'Saylor ne vend jamais.'],
  [1, 'lea', 'bear', 'La prime finira par se refermer, et vite.'],
  [2, 'john', 'bull', 'Les L2 ramènent de l’activité sur la chaîne.'],
  [2, 'marco', 'bear', 'Le ratio ETH/BTC baisse depuis trois ans.'],
  [2, 'sofia', 'bull', 'Le staking en ETF change la donne.'],
  [2, 'rayan', 'bear', 'Solana lui prend ses utilisateurs.'],
  [2, 'lea', 'bull', 'Le seul alt avec des revenus réels.'],
  [3, 'john', 'bear', 'Les frais mangent la perf face au BTC en direct.'],
  [3, 'alex', 'bull', 'Les flux ETF ne s’arrêtent pas.'],
  [3, 'marco', 'bear', 'Pas tes clés, pas tes coins.'],
  [3, 'sofia', 'bull', 'Pratique pour le PEA, on n’a pas mieux.'],
  [3, 'lea', 'bear', 'Autant acheter le vrai.'],
  [4, 'me', 'bear', 'Je préfère perdre mon temps que mon argent.'],
  [4, 'john', 'bear', 'Un mème sans utilité, la liquidité partira ailleurs.'],
  [4, 'alex', 'bear', 'Le prochain chien fera oublier celui-ci.'],
  [4, 'sofia', 'bull', 'Les mèmes reviennent toujours en fin de cycle.'],
  [4, 'rayan', 'bear', 'Les baleines ont déjà vendu.'],
  [4, 'lea', 'bear', 'Aucune thèse, c’est écrit dessus.'],
];

/**
 * Positions closes des saisons précédentes.
 *
 * Ce sont de vrais `tickers`, pas une liste de classement à part : les deux
 * tableaux sortent de `splitLeaderboards()` appliqué au même jeu de calls.
 * Sans elles, le Hall of Fame serait vide — aucun call du fil courant
 * n'atteint +50 % — et on ne verrait jamais l'écran tel qu'il est conçu.
 *
 * Les perfs visées sont celles de DONNEES_FICTIVES §Hall of Fame / §Rekt Board.
 */
/**
 * `$WIF` n'y figure pas : le `-61 %` du Rekt Board **est** le call du fil.
 * L'inscrire ici le classerait deux fois.
 */
const HISTORY: {
  key: keyof typeof MEMBERS;
  symbol: string;
  assetClass: Ticker['assetClass'];
  entry: number;
  perf: number;
  /** Perf vs ₿ affichée en sous-ligne. `null` pour un call BTC. */
  vs: number | null;
  ageDays: number;
}[] = [
  {
    key: 'lea',
    symbol: '$BTC',
    assetClass: 'BTC',
    entry: 61_000,
    perf: 96,
    vs: null,
    ageDays: 420,
  },
  {
    key: 'alex',
    symbol: '$NVDA',
    assetClass: 'ACTION',
    entry: 88.4,
    perf: 74,
    vs: 31,
    ageDays: 300,
  },
  {
    key: 'john',
    symbol: '$MSTR',
    assetClass: 'ACTION',
    entry: 252,
    perf: 63,
    vs: 19,
    ageDays: 280,
  },
  {
    key: 'rayan',
    symbol: '$ETHW',
    assetClass: 'ALT',
    entry: 4.2,
    perf: -48,
    vs: -52,
    ageDays: 260,
  },
  {
    key: 'sofia',
    symbol: '$GME',
    assetClass: 'ACTION',
    entry: 28.9,
    perf: -22,
    vs: -33,
    ageDays: 190,
  },
];

const THESES: Record<string, string> = {
  $BTC: 'Le seul actif que je garde dix ans. DCA hebdomadaire, jamais de levier, cold storage.',
  $NVDA:
    'Les pelles de la ruée vers l’or. Je sors quand les hyperscalers arrêtent de commander.',
  $MSTR: 'Levier propre sur BTC via le bilan. Tant que la trésorerie achète, je tiens.',
  $ETHW: 'La fork que personne n’a gardée. J’ai oublié de vendre.',
  $GME: 'Nostalgie 2021. Ce n’était pas un investissement, c’était un souvenir.',
};

const HISTORY_TICKERS: Ticker[] = withWindows(
  HISTORY.map((entry, index) => ({
    id: `44444444-4444-4444-8444-${String(100 + index).padStart(12, '0')}`,
    userId: MEMBERS[entry.key]!.id,
    symbol: entry.symbol,
    assetClass: entry.assetClass,
    entryPrice: entry.entry,
    currentPrice: priceFromPerf(entry.entry, entry.perf),
    entryBtcPrice: entry.vs === null ? entry.entry : btcEntryFromVs(entry.perf, entry.vs),
    sizeUsd: null,
    thesis: THESES[entry.symbol] ?? '',
    // Les positions historiques ne se rafraîchissent plus : elles sont closes.
    coingeckoId: null,
    yahooSymbol: null,
    priceUpdatedAt: ago(0),
    enteredOn: null,
    editedAt: null,
    // Sorties au cours du design, et au bitcoin du prototype : les perfs vs ₿
    // retombent ainsi sur celles de DONNEES_FICTIVES.
    exitPrice: priceFromPerf(entry.entry, entry.perf),
    exitBtcPrice: entry.vs === null ? priceFromPerf(entry.entry, entry.perf) : MOCK_BTC_SPOT,
    closedOn: clubDay(Date.now() - Math.round(entry.ageDays / 3) * DAY),
    closedAt: ago(Math.round(entry.ageDays / 3) * DAY),
    createdAt: ago(entry.ageDays * DAY),
  })),
);

/**
 * Le fil du Bag : les cinq calls en cours, suivis des positions historiques.
 * Le fil est trié par date, donc l'historique arrive naturellement en fin de
 * liste sans traitement particulier.
 */
export const MOCK_TICKERS: Ticker[] = [...MOCK_CURRENT_TICKERS, ...HISTORY_TICKERS];

/**
 * Des votes sur les positions closes aussi : c'est là que les points se
 * gagnent et se perdent pour de bon.
 */
const HISTORY_VOTES: [
  ticker: number,
  member: keyof typeof MEMBERS,
  side: Vote,
  reason: string,
][] = [
  [1, 'john', 'bull', 'Les hyperscalers n’ont pas fini de commander.'],
  [1, 'lea', 'bull', 'Le monopole des GPU pour trois ans.'],
  [1, 'marco', 'bear', 'Valorisation de bulle.'],
  [3, 'alex', 'bear', 'Une fork que personne n’utilise.'],
  [3, 'me', 'bear', 'Zéro développeur, zéro avenir.'],
  [3, 'john', 'bull', 'Le marché récompense parfois les oubliés.'],
  [4, 'rayan', 'bear', 'La nostalgie ne paie pas de dividende.'],
  [4, 'john', 'bull', 'Les short squeezes reviennent.'],
];

/** Tous les votes de la démo, à l'heure où on les aurait posés. */
export const MOCK_VOTE_ROWS: VoteRow[] = [
  ...VOTES.map(([index, member, side, reason]) => ({
    call: MOCK_CURRENT_TICKERS[index]!,
    member,
    side,
    reason,
  })),
  ...HISTORY_VOTES.map(([index, member, side, reason]) => ({
    call: HISTORY_TICKERS[index]!,
    member,
    side,
    reason,
  })),
].map(({ call, member, side, reason }) => ({
  tickerId: call.id,
  userId: MEMBERS[member]!.id,
  side,
  reason,
  // Une heure après la publication : dans la fenêtre de vote.
  createdAt: new Date(Date.parse(call.createdAt) + HOUR).toISOString(),
  changedAt: null,
}));
