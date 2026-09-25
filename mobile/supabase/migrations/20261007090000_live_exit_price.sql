-- ----------------------------------------------------------------------------
-- Calls (v1.01) : la sortie aussi se fait au cours du marché
--
-- La même faille qu'à l'entrée : un membre clôturait au prix et au jour qu'il
-- voulait. Il suffisait d'attendre le repli pour déclarer être sorti au plus
-- haut, la semaine d'avant. Désormais, comme à l'entrée :
--
--   • un membre clôture **aujourd'hui, maintenant** : la base pose le jour de
--     sortie (Nouméa), quoi que le client envoie ;
--   • le prix envoyé par l'app — le cours live qu'elle affiche — est
--     **provisoire**. Au relevé suivant, `refresh-prices` le remplace par le
--     cours lu par le serveur, avec le bitcoin du même instant, et pose
--     `exit_confirmed_at` ;
--   • une clôture est **définitive** pour un membre : il ne corrige plus sa
--     sortie et ne rouvre plus le call. Sinon, rouvrir après un rebond et
--     reclôturer plus haut referait la faille par un autre chemin.
--
-- Les calls clôturés avant la v1.01 gardent leur sortie : ils sont marqués
-- confirmés une fois pour toutes.
--
-- Remplace `tickers_live_entry` de `20261002090000_live_entry_price`, qui
-- garde ses règles d'entrée. Rejouable.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tickers' and column_name = 'exit_confirmed_at'
  ) then
    alter table public.tickers add column exit_confirmed_at timestamptz;
    alter table public.tickers disable trigger user;
    update public.tickers
       set exit_confirmed_at = coalesce(closed_at, now())
     where closed_on is not null;
    alter table public.tickers enable trigger user;
  end if;
end
$$;

comment on column public.tickers.exit_confirmed_at is
  'Quand le serveur a confirmé le prix de sortie au cours du marché (refresh-prices). null : provisoire, ou call en cours.';

create or replace function public.tickers_live_entry()
returns trigger
language plpgsql
as $$
declare
  today date := (now() at time zone 'Pacific/Noumea')::date;
begin
  -- Le relevé des prix (rôle service), les migrations, l'administration :
  -- ils écrivent les prix confirmés. Seul un membre est tenu.
  if current_user <> 'authenticated' then
    if tg_op = 'UPDATE'
       and ((old.entry_confirmed_at is null and new.entry_confirmed_at is not null)
         or (old.exit_confirmed_at is null and new.exit_confirmed_at is not null)) then
      -- Confirmer un prix n'est pas « modifier le call ».
      new.edited_at := old.edited_at;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.entered_on := today;
    new.entry_confirmed_at := null;
    new.exit_confirmed_at := null;
    return new;
  end if;

  -- L'entrée : celle du marché à la publication.
  if new.entry_price        is distinct from old.entry_price
  or new.entry_btc_price    is distinct from old.entry_btc_price
  or new.entered_on         is distinct from old.entered_on
  or new.entry_confirmed_at is distinct from old.entry_confirmed_at then
    raise exception 'Le prix et le jour d''entrée d''un call sont ceux du marché à sa publication : ils ne se modifient pas'
      using errcode = 'check_violation';
  end if;

  -- Une clôture est définitive : ni correction, ni réouverture.
  if old.closed_on is not null then
    if new.closed_on         is distinct from old.closed_on
    or new.exit_price        is distinct from old.exit_price
    or new.exit_btc_price    is distinct from old.exit_btc_price
    or new.exit_confirmed_at is distinct from old.exit_confirmed_at then
      raise exception 'Une clôture est définitive : elle s''est faite au cours du marché'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.closed_on is not null then
    if old.entry_confirmed_at is null
       and (old.coingecko_id is not null or old.yahoo_symbol is not null) then
      raise exception 'Le prix d''entrée de ce call attend encore sa confirmation au cours du marché (quelques minutes)'
        using errcode = 'check_violation';
    end if;
    -- Aujourd'hui, maintenant ; le prix envoyé reste provisoire.
    new.closed_on := today;
    new.exit_confirmed_at := null;
  elsif new.exit_confirmed_at is not null then
    raise exception 'Seul le relevé des prix confirme une sortie'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
