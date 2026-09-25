-- ----------------------------------------------------------------------------
-- Calls (v1.01) : le prix d'entrée est le cours du marché, pas une saisie
--
-- Un call se publiait avec le prix et le jour qu'on voulait. Rien n'empêchait
-- d'attendre de voir un actif monter, puis de publier le call « d'il y a deux
-- semaines », au prix d'il y a deux semaines, et d'encaisser les points.
--
-- Désormais :
--
--   • un membre publie **aujourd'hui, maintenant** : la base pose le jour
--     d'entrée (Nouméa) et l'heure de publication, quoi que le client envoie ;
--   • le prix envoyé par l'app — le cours live qu'elle affiche — n'est que
--     **provisoire**. Au relevé suivant (toutes les 15 min), `refresh-prices`
--     le remplace par le cours que le **serveur** lit chez CoinGecko ou Yahoo,
--     avec le cours du bitcoin du même instant, et pose `entry_confirmed_at`.
--     Une app bricolée peut envoyer n'importe quel prix : il ne tiendra pas ;
--   • un membre ne modifie plus jamais le prix, le jour ni la confirmation
--     d'entrée. Seul le relevé des prix — rôle service — les écrit ;
--   • on ne clôture pas un call dont le prix d'entrée n'est pas encore
--     confirmé (quelques minutes), sauf s'il n'a aucune source de cours.
--
-- Les calls publiés avant la v1.01 gardent leur prix : ils sont marqués
-- confirmés une fois pour toutes.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tickers' and column_name = 'entry_confirmed_at'
  ) then
    alter table public.tickers add column entry_confirmed_at timestamptz;
    -- Une seule fois, à l'ajout de la colonne : rejouer la migration ne doit
    -- pas confirmer d'office les calls publiés entre-temps.
    alter table public.tickers disable trigger user;
    update public.tickers set entry_confirmed_at = coalesce(edited_at, created_at);
    alter table public.tickers enable trigger user;
  end if;
end
$$;

comment on column public.tickers.entry_confirmed_at is
  'Quand le serveur a confirmé le prix d''entrée au cours du marché (refresh-prices). null : provisoire.';

create or replace function public.tickers_live_entry()
returns trigger
language plpgsql
as $$
begin
  -- Le relevé des prix (rôle service), les migrations, l'administration :
  -- ils écrivent l'entrée confirmée. Seul un membre est tenu.
  if current_user <> 'authenticated' then
    if tg_op = 'UPDATE'
       and old.entry_confirmed_at is null
       and new.entry_confirmed_at is not null then
      -- Confirmer le prix n'est pas « modifier le call » : la carte ne doit
      -- pas afficher « modifié » pour un relevé de cours.
      new.edited_at := old.edited_at;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.entered_on := (now() at time zone 'Pacific/Noumea')::date;
    new.entry_confirmed_at := null;
    return new;
  end if;

  if new.entry_price        is distinct from old.entry_price
  or new.entry_btc_price    is distinct from old.entry_btc_price
  or new.entered_on         is distinct from old.entered_on
  or new.entry_confirmed_at is distinct from old.entry_confirmed_at then
    raise exception 'Le prix et le jour d''entrée d''un call sont ceux du marché à sa publication : ils ne se modifient pas'
      using errcode = 'check_violation';
  end if;

  if old.closed_on is null
     and new.closed_on is not null
     and old.entry_confirmed_at is null
     and (old.coingecko_id is not null or old.yahoo_symbol is not null) then
    raise exception 'Le prix d''entrée de ce call attend encore sa confirmation au cours du marché (quelques minutes)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tickers_live_entry on public.tickers;
create trigger tickers_live_entry
  before insert or update on public.tickers
  for each row execute function public.tickers_live_entry();
