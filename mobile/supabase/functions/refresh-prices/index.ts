/**
 * Rafraîchissement des prix — Edge Function Supabase (Deno).
 *
 * Met à jour `tickers.current_price` pour tous les actifs cotés chez
 * CoinGecko. C'est le seul écrivain légitime de cette colonne : le déclencheur
 * `tickers_freeze` interdit au membre de toucher à quoi que ce soit d'autre,
 * et cette fonction n'écrit rien d'autre non plus.
 *
 * Déploiement et planification : voir `supabase/functions/README.md`.
 *
 * Ce qu'elle ne fait pas, volontairement :
 *   • les actions et ETF (`$MSTR`, `$NVDA`, `$IBIT`, `$GME`) ne sont pas chez
 *     CoinGecko — ils n'ont pas de `coingecko_id` et sont ignorés, en attendant
 *     l'arbitrage sur le second fournisseur ;
 *   • elle n'invente jamais un prix : un actif absent de la réponse garde le
 *     sien, daté par `price_updated_at`.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { chunk, planUpdates, type PricedTicker } from './plan.ts';

const COINGECKO = 'https://api.coingecko.com/api/v3';

/** CoinGecko tolère mal les très longues listes d'identifiants. */
const BATCH_SIZE = 100;

async function fetchPrices(ids: string[], apiKey?: string): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const params = new URLSearchParams({ ids: batch.join(','), vs_currencies: 'usd' });
    if (apiKey) params.set('x_cg_demo_api_key', apiKey);

    const response = await fetch(`${COINGECKO}/simple/price?${params}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko a répondu ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, { usd?: number }>;
    for (const [id, quote] of Object.entries(payload)) {
      if (typeof quote?.usd === 'number' && Number.isFinite(quote.usd)) {
        prices[id] = quote.usd;
      }
    }
  }

  return prices;
}

Deno.serve(async (request) => {
  // La fonction écrit dans une table sous RLS : elle a besoin du rôle service,
  // jamais exposé au client. Elle n'est appelable que par le planificateur.
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    return Response.json({ error: 'Environnement incomplet' }, { status: 500 });
  }

  const secret = Deno.env.get('REFRESH_SECRET');
  if (secret && request.headers.get('x-refresh-secret') !== secret) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await client
    .from('tickers')
    .select('id, coingecko_id, current_price')
    .not('coingecko_id', 'is', null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PricedTicker[];
  if (rows.length === 0) {
    return Response.json({ updated: 0, skipped: 0, note: 'aucun actif coté' });
  }

  const { ids } = planUpdates(rows, {});

  let prices: Record<string, number>;
  try {
    prices = await fetchPrices(ids, Deno.env.get('COINGECKO_API_KEY') ?? undefined);
  } catch (cause) {
    // Un échec CoinGecko laisse les prix en place : mieux vaut un cours daté
    // qu'un cours effacé. Le prochain passage rattrapera.
    return Response.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 502 },
    );
  }

  // Toute la décision d'écriture vit dans `./plan.ts`, testée à part : ici on
  // ne fait qu'exécuter le plan.
  const { updates, skipped } = planUpdates(rows, prices);

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

  return Response.json({
    updated,
    skipped,
    failures,
    assets: ids.length,
    at: now,
  });
});
