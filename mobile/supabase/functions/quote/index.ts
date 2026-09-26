/**
 * Cotation d'un titre — Edge Function Supabase (Deno).
 *
 * ## Pourquoi cette fonction existe
 *
 * Yahoo Finance ne pose pas d'en-tête CORS. Depuis une application native, ça
 * n'a aucune importance ; depuis la PWA, le navigateur refuse la réponse.
 *
 * Le dashboard JCGI contourne le problème avec `api.allorigins.win` et
 * `corsproxy.io` — des proxys publics et anonymes dans le chemin des données.
 * Ici on passe par Supabase, qu'on a déjà : pas de tiers, pas de quota
 * inconnu, et une seule autorité à faire confiance.
 *
 * Elle ne sert **que** la pré-saisie du composer. Les cours affichés sur les
 * cartes viennent de la base, écrits par `refresh-prices`.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { neededRates, parseYahooQuote, toUsd } from '../_shared/yahooParse.ts';
import { isSeriesInterval, parseYahooSeries, SERIES_RANGES } from '../_shared/yahooSeries.ts';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Yahoo renvoie 403 aux clients sans `User-Agent` crédible. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Forme d'un symbole Yahoo acceptable. Refuser ici évite d'être un proxy ouvert. */
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,19}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

/** 60 s de cache CDN : un composer ouvert par trois membres ne fait qu'un appel. */
const CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

/** Une série bouge moins vite qu'un cours : cinq minutes de cache suffisent. */
const SERIES_CACHE_CONTROL = 'public, max-age=300, s-maxage=300';

function json(body: unknown, status = 200, cacheControl = CACHE_CONTROL): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cacheControl, ...CORS },
  });
}

async function fetchChart(symbol: string, range: string) {
  const response = await fetch(
    `${YAHOO}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
    {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw new Error(`Yahoo a répondu ${response.status}`);
  return parseYahooQuote(await response.json());
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  // `series=1h|1d` : la série de clôtures, pour l'historique du bitcoin de
  // l'Oracle quand CoinGecko refuse l'app (quota de son API publique).
  const series = params.get('series');
  if (!SYMBOL_RE.test(symbol)) {
    return json({ error: 'Symbole invalide' }, 400);
  }

  // Réservé aux membres : la fonction relaie un appel sortant, elle ne doit pas
  // devenir un proxy ouvert. Le jeton du client suffit — pas besoin du rôle
  // service, on ne lit ni n'écrit aucune table.
  //
  // La garde est **inconditionnelle**. Elle était auparavant conditionnée à la
  // présence des variables d'environnement : un projet où `SUPABASE_ANON_KEY`
  // n'est pas injecté — les nouvelles clés nommées portent un autre nom — la
  // sautait en silence, et la fonction relayait Yahoo pour qui trouvait l'URL.
  // Un environnement incomplet doit refuser, jamais laisser passer.
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!url || !anonKey) {
    return json({ error: 'Environnement incomplet : impossible de vérifier l’appelant' }, 500);
  }
  if (!authorization) return json({ error: 'Réservé aux membres' }, 401);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  if (!data.user) return json({ error: 'Réservé aux membres' }, 401);

  if (isSeriesInterval(series)) {
    try {
      const response = await fetch(
        `${YAHOO}/${encodeURIComponent(symbol)}?interval=${series}&range=${SERIES_RANGES[series]}`,
        {
          headers: { accept: 'application/json', 'user-agent': UA },
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) throw new Error(`Yahoo a répondu ${response.status}`);
      const points = parseYahooSeries(await response.json());
      if (points.length === 0) throw new Error('Série vide');
      return json({ symbol, interval: series, points }, 200, SERIES_CACHE_CONTROL);
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : String(cause) }, 502);
    }
  }

  try {
    const quote = await fetchChart(symbol, '5d');

    // Conversion en dollars si la place ne cote pas dans cette devise.
    const rates: Record<string, number> = {};
    for (const currency of neededRates([quote])) {
      try {
        rates[currency] = (await fetchChart(`${currency}USD=X`, '1d')).price;
      } catch {
        // Sans taux, `usd` vaudra null — l'app saura qu'elle ne peut pas proposer.
      }
    }

    return json({
      symbol: quote.symbol ?? symbol,
      price: quote.price,
      currency: quote.currency,
      changePercent: quote.changePercent,
      usd: toUsd(quote, rates),
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : String(cause) }, 502);
  }
});
