/**
 * Choix d'un jeton parmi les homonymes.
 *
 * Un ticker ne désigne pas un actif : CoinGecko connaît plusieurs dizaines de
 * `$SOL` et une bonne poignée de `$WIF`. Le classement par capitalisation
 * départage dans l'immense majorité des cas — mais quand il se trompe, il se
 * trompe en silence, et le call publié suit le cours d'un autre jeton.
 *
 * Ce module est **pur** : il trie ce que l'API a renvoyé, sans rien demander.
 * C'est ce qui le rend testable sans réseau, et c'est la même règle qui sert
 * au composer (qui propose) et à la publication (qui tranche seule).
 */

/** Une proposition affichable, dépouillée de ce que l'API ajoute autour. */
export interface CoinMatch {
  /** Identifiant CoinGecko, celui qu'on écrit dans `tickers.coingecko_id`. */
  id: string;
  /** Symbole en majuscules, sans le `$` du club. */
  symbol: string;
  name: string;
  /** Rang par capitalisation ; `null` pour un jeton non classé. */
  rank: number | null;
}

/** Forme utile d'une entrée de `/search`. `name` manque sur les vieux caches. */
export interface RawCoin {
  id: string;
  symbol: string;
  name?: string;
  market_cap_rank?: number | null;
}

/** `'$WIF '` → `'wif'`. La même normalisation partout, sinon le cache se dédouble. */
export function normalizeTicker(input: string): string {
  return input.replace(/^\$/, '').trim().toLowerCase();
}

/** Non classé = dernier, jamais premier. */
const byRank = (a: CoinMatch, b: CoinMatch) =>
  (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);

function toMatch(coin: RawCoin): CoinMatch {
  return {
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name?.trim() || coin.symbol.toUpperCase(),
    rank: typeof coin.market_cap_rank === 'number' ? coin.market_cap_rank : null,
  };
}

/**
 * Propositions pour le composer, de la plus probable à la moins.
 *
 * Trois rangs, chacun trié par capitalisation : le symbole exact, puis ce qui
 * commence par la saisie, puis les noms qui la contiennent. Le troisième rang
 * est là pour qui tape « sola » sans connaître le ticker.
 */
export function rankCoins(coins: readonly RawCoin[], query: string, limit = 6): CoinMatch[] {
  const q = normalizeTicker(query);
  if (!q) return [];

  const seen = new Set<string>();
  const exact: CoinMatch[] = [];
  const prefix: CoinMatch[] = [];
  const named: CoinMatch[] = [];

  for (const coin of coins) {
    if (!coin?.id || !coin.symbol || seen.has(coin.id)) continue;
    seen.add(coin.id);

    const match = toMatch(coin);
    const symbol = match.symbol.toLowerCase();
    const name = match.name.toLowerCase();

    if (symbol === q) exact.push(match);
    else if (symbol.startsWith(q)) prefix.push(match);
    else if (name.includes(q)) named.push(match);
  }

  return [...exact.sort(byRank), ...prefix.sort(byRank), ...named.sort(byRank)].slice(0, limit);
}

/**
 * Le jeton retenu quand personne ne choisit.
 *
 * Volontairement plus strict que `rankCoins` : seul un symbole **exact** peut
 * être choisi à l'aveugle. Publier un `$WIF` en le faisant suivre un jeton dont
 * seul le nom ressemble serait pire que de publier sans fournisseur, parce que
 * la carte afficherait alors un cours — faux, mais crédible.
 */
export function bestCoin(coins: readonly RawCoin[], query: string): CoinMatch | null {
  const q = normalizeTicker(query);
  if (!q) return null;
  const exact = coins.filter((coin) => coin?.symbol?.toLowerCase() === q).map(toMatch);
  return exact.sort(byRank)[0] ?? null;
}
