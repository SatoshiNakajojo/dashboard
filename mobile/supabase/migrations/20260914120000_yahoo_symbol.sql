-- ============================================================================
-- Cotation des actions et ETF — Yahoo Finance
--
-- CoinGecko ne cote pas les titres. Le dashboard JCGI interroge déjà Yahoo pour
-- les siens (`app.jsx`, `fetchYahoo`) ; on reprend la même source, et la même
-- convention de symbole.
--
-- `coingecko_id` et `yahoo_symbol` sont mutuellement exclusifs : un actif a un
-- fournisseur, pas deux. La contrainte le dit, plutôt que de laisser deux
-- rafraîchisseurs se disputer la même ligne.
-- ============================================================================

alter table public.tickers
  add column if not exists yahoo_symbol text;

comment on column public.tickers.yahoo_symbol is
  'Symbole Yahoo Finance — sans le « $ » du club, avec le suffixe de place pour '
  'les titres non américains (AI.PA, AVIO.MI). Null pour une crypto.';

-- Un seul fournisseur par actif.
do $$ begin
  alter table public.tickers
    add constraint tickers_one_quote_source
    check (coingecko_id is null or yahoo_symbol is null);
exception when duplicate_object then null;
end $$;

-- Le symbole Yahoo ne porte jamais le « $ » du club, et n'est jamais vide.
do $$ begin
  alter table public.tickers
    add constraint tickers_yahoo_symbol_shape
    check (yahoo_symbol is null or yahoo_symbol ~ '^[A-Z0-9][A-Z0-9.\-=^]{0,19}$');
exception when duplicate_object then null;
end $$;

create index if not exists tickers_yahoo_symbol_idx
  on public.tickers (yahoo_symbol)
  where yahoo_symbol is not null;

-- ----------------------------------------------------------------------------
-- Reprise des lignes existantes
--
-- Les actions et ETF déjà publiés n'avaient aucun fournisseur : leur prix était
-- figé depuis la publication. On leur donne leur symbole Yahoo, déduit du
-- ticker du club. Les titres non américains devront être corrigés à la main —
-- Yahoo veut `AI.PA`, pas `AI`.
-- ----------------------------------------------------------------------------

update public.tickers
   set yahoo_symbol = upper(ltrim(symbol, '$'))
 where asset_class in ('ACTION', 'ETF')
   and yahoo_symbol is null
   and coingecko_id is null
   and upper(ltrim(symbol, '$')) ~ '^[A-Z0-9][A-Z0-9.\-]{0,19}$';

-- ----------------------------------------------------------------------------
-- `price_updated_at` devient lisible par l'app
--
-- Un cours d'action se périme : les marchés ferment le week-end, et Yahoo peut
-- tomber. L'écran doit pouvoir dire « au 12 septembre » plutôt que de laisser
-- croire à un prix de l'instant.
-- ----------------------------------------------------------------------------

comment on column public.tickers.price_updated_at is
  'Horodatage du dernier rafraîchissement réussi. Écrit par la fonction Edge '
  'refresh-prices, jamais par un membre.';
