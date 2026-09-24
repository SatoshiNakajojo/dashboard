/**
 * Rafraîchissement des prix — Edge Function Supabase (Deno).
 *
 * Deux fournisseurs, un seul écrivain. CoinGecko cote les cryptos, Yahoo
 * Finance les actions et ETF — la même source que le dashboard JCGI. C'est le
 * seul écrivain légitime de `tickers.current_price` : le déclencheur
 * `tickers_freeze` interdit au membre de toucher à quoi que ce soit d'autre,
 * et cette fonction n'écrit rien d'autre non plus.
 *
 * Déploiement et planification : voir `supabase/functions/README.md`.
 *
 * Elle n'invente jamais un prix. Un actif absent d'une réponse garde le sien,
 * daté par `price_updated_at` ; un fournisseur en panne ne fait pas tomber
 * l'autre.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { chunk, planUpdates, quoteRequests, type PricedTicker } from './plan.ts';
import { neededRates, parseYahooQuote, toUsd, type YahooQuote } from '../_shared/yahooParse.ts';

const COINGECKO = 'https://api.coingecko.com/api/v3';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** CoinGecko tolère mal les très longues listes d'identifiants. */
const COINGECKO_BATCH = 100;

/**
 * Yahoo n'a pas d'endpoint multi-symboles public fiable : une requête par
 * titre. Le club en compte une poignée, la dépense est négligeable — mais on
 * plafonne la concurrence pour ne pas se faire limiter.
 */
const YAHOO_CONCURRENCY = 4;

/** Yahoo renvoie 403 aux clients sans `User-Agent` crédible. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} a répondu ${response.status}`);
  return (await response.json()) as T;
}

/** Exécute `task` sur chaque entrée, `limit` en vol au plus. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(items, limit)) {
    out.push(...(await Promise.all(batch.map(task))));
  }
  return out;
}

// ---------------------------------------------------------------------------

async function fetchCoingecko(ids: string[], apiKey?: string): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const batch of chunk(ids, COINGECKO_BATCH)) {
    const params = new URLSearchParams({ ids: batch.join(','), vs_currencies: 'usd' });
    if (apiKey) params.set('x_cg_demo_api_key', apiKey);

    const payload = await getJson<Record<string, { usd?: number }>>(
      `${COINGECKO}/simple/price?${params}`,
    );

    for (const [id, quote] of Object.entries(payload)) {
      if (typeof quote?.usd === 'number' && Number.isFinite(quote.usd)) prices[id] = quote.usd;
    }
  }

  return prices;
}

function yahooUrl(symbol: string, range = '5d'): string {
  return `${YAHOO}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
}

/**
 * Cotations Yahoo, converties en dollars.
 *
 * Deux temps, parce qu'ils en dépendent : on lit d'abord les cotations pour
 * connaître leurs devises, puis on ne demande que les taux nécessaires. Une
 * place européenne cote en euros, Londres en pence — le club, lui, compte en
 * dollars.
 */
async function fetchYahoo(symbols: string[]): Promise<{
  prices: Record<string, number>;
  unconverted: string[];
}> {
  const quotes = new Map<string, YahooQuote>();

  await mapLimit(symbols, YAHOO_CONCURRENCY, async (symbol) => {
    try {
      quotes.set(
        symbol,
        parseYahooQuote(await getJson(yahooUrl(symbol), { 'user-agent': UA })),
      );
    } catch {
      // Un symbole inconnu ou retiré de la cote ne fait pas tomber les autres.
    }
  });

  const currencies = neededRates([...quotes.values()]);
  const rates: Record<string, number> = {};

  await mapLimit(currencies, YAHOO_CONCURRENCY, async (currency) => {
    try {
      const quote = parseYahooQuote(
        await getJson(yahooUrl(`${currency}USD=X`, '1d'), { 'user-agent': UA }),
      );
      rates[currency] = quote.price;
    } catch {
      // Sans taux, `toUsd` renverra null et le prix restera inchangé.
    }
  });

  const prices: Record<string, number> = {};
  const unconverted: string[] = [];

  for (const [symbol, quote] of quotes) {
    const usd = toUsd(quote, rates);
    if (usd === null) unconverted.push(symbol);
    else prices[symbol] = usd;
  }

  return { prices, unconverted };
}

// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  // La fonction écrit dans une table sous RLS : elle a besoin du rôle service,
  // jamais exposé au client.
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    return Response.json({ error: 'Environnement incomplet' }, { status: 500 });
  }

  // `REFRESH_SECRET` est **exigé**, pas facultatif. Tant qu'il l'était, une
  // installation qui ne l'avait pas posé exposait un point d'entrée qui écrit
  // en base et appelle deux API externes, joignable avec la clé anon — qui est
  // publiée dans le bundle. Sans secret, on refuse : c'est une configuration
  // inachevée, pas une permission.
  const secret = Deno.env.get('REFRESH_SECRET');
  if (!secret) {
    return Response.json(
      { error: 'REFRESH_SECRET absent — voir supabase/functions/README.md' },
      { status: 500 },
    );
  }
  if (request.headers.get('x-refresh-secret') !== secret) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await client
    .from('tickers')
    .select('id, coingecko_id, yahoo_symbol, current_price')
    .or('coingecko_id.not.is.null,yahoo_symbol.not.is.null')
    // Une position close a un prix de sortie, pas un cours (la base le
    // garantit aussi : `tickers_freeze_call`).
    .is('closed_on', null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as PricedTicker[];
  if (rows.length === 0) {
    return Response.json({ updated: 0, skipped: 0, note: 'aucun actif coté' });
  }

  const requests = quoteRequests(rows);

  // Les deux fournisseurs sont interrogés en parallèle et **indépendamment** :
  // une panne CoinGecko ne doit pas priver les actions de leur cours.
  const problems: string[] = [];

  const [coingeckoPrices, yahooResult] = await Promise.all([
    requests.coingecko.length === 0
      ? Promise.resolve<Record<string, number>>({})
      : fetchCoingecko(
          requests.coingecko,
          Deno.env.get('COINGECKO_API_KEY') ?? undefined,
        ).catch((cause) => {
          problems.push(`coingecko : ${cause instanceof Error ? cause.message : cause}`);
          return {} as Record<string, number>;
        }),
    requests.yahoo.length === 0
      ? Promise.resolve({ prices: {} as Record<string, number>, unconverted: [] as string[] })
      : fetchYahoo(requests.yahoo).catch((cause) => {
          problems.push(`yahoo : ${cause instanceof Error ? cause.message : cause}`);
          return { prices: {} as Record<string, number>, unconverted: [] as string[] };
        }),
  ]);

  if (yahooResult.unconverted.length > 0) {
    problems.push(`taux de change manquant : ${yahooResult.unconverted.join(', ')}`);
  }

  // Toute la décision d'écriture vit dans `./plan.ts`, testée à part : ici on
  // ne fait qu'exécuter le plan.
  const { updates, skipped } = planUpdates(rows, {
    coingecko: coingeckoPrices,
    yahoo: yahooResult.prices,
  });

  const now = new Date().toISOString();
  let updated = 0;
  const failures: string[] = [];

  for (const update of updates) {
    const { error: writeError } = await client
      .from('tickers')
      .update({ current_price: update.price, price_updated_at: now })
      .eq('id', update.id);

    if (writeError) failures.push(update.id);
    else updated += 1;
  }

  // 502 seulement si **tout** a échoué : un fournisseur en panne sur deux reste
  // un rafraîchissement partiel réussi, pas une erreur.
  const status = updated === 0 && problems.length > 0 ? 502 : 200;

  return Response.json(
    {
      updated,
      skipped,
      failures,
      problems,
      assets: { coingecko: requests.coingecko.length, yahoo: requests.yahoo.length },
      at: now,
    },
    { status },
  );
});
