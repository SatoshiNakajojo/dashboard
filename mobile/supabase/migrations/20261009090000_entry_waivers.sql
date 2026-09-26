-- ----------------------------------------------------------------------------
-- Calls (v1.01) : une exception au cours live, accordée par le club
--
-- Un call se publie au cours du marché, maintenant (`20261002090000`,
-- `20261007090000`). Le jour où Tim voulait publier son call sur $VIAV, l'app
-- était en panne ; le cours a monté depuis. Le club l'autorise, pour ce call
-- seulement, à le publier au prix et au jour où il est réellement entré.
--
--   • `entry_waivers` : une exception = un membre, un titre, une fois. Seul
--     l'administrateur en accorde (SQL Editor, ou une migration comme
--     celle-ci) ; un membre ne lit que les siennes ;
--   • à la publication, si le membre a une exception ouverte sur ce titre, la
--     base garde le prix, le jour d'entrée (au plus `max_days_back` jours en
--     arrière) et le bitcoin de référence envoyés par l'app, marque le prix
--     confirmé — le relevé ne le remplacera pas — et consomme l'exception ;
--   • sans exception, rien ne change : cours live, aujourd'hui.
--
-- Remplace `tickers_live_entry` de `20261007090000_live_exit_price`, dont il
-- garde toutes les règles. Rejouable.
-- ----------------------------------------------------------------------------

create table if not exists public.entry_waivers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- Tel que le call l'écrira : `$VIAV`.
  symbol        text not null check (symbol ~ '^\$[A-Z0-9.\-]{1,10}$'),
  reason        text not null default '',
  max_days_back integer not null default 7 check (max_days_back between 0 and 31),
  granted_at    timestamptz not null default now(),
  used_at       timestamptz,
  -- Le call publié grâce à elle (sans clé étrangère : il n'existe pas encore
  -- quand l'exception est consommée, dans le déclencheur d'insertion).
  ticker_id     uuid
);

comment on table public.entry_waivers is
  'Exceptions au cours live, accordées par le club : un membre, un titre, une publication.';

alter table public.entry_waivers enable row level security;

drop policy if exists entry_waivers_select_own on public.entry_waivers;
create policy entry_waivers_select_own on public.entry_waivers
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.entry_waivers to authenticated;

-- Consommer une exception : réservé au déclencheur de publication. Appelée
-- directement (RPC), elle refuse — on ne brûle pas une exception sans call.
create or replace function public.consume_entry_waiver(sym text, ticker uuid)
returns public.entry_waivers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  waiver public.entry_waivers%rowtype;
begin
  if pg_trigger_depth() < 1 then
    raise exception 'Une exception se consomme en publiant le call'
      using errcode = 'insufficient_privilege';
  end if;
  select * into waiver
    from public.entry_waivers
   where user_id = auth.uid() and upper(symbol) = upper(sym) and used_at is null
   order by granted_at
   limit 1
   for update;
  if not found then
    return null;
  end if;
  update public.entry_waivers set used_at = now(), ticker_id = ticker where id = waiver.id;
  return waiver;
end;
$$;

revoke all on function public.consume_entry_waiver(text, uuid) from public;
grant execute on function public.consume_entry_waiver(text, uuid) to authenticated;

create or replace function public.tickers_live_entry()
returns trigger
language plpgsql
as $$
declare
  today  date := (now() at time zone 'Pacific/Noumea')::date;
  waiver public.entry_waivers%rowtype;
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
    new.exit_confirmed_at := null;

    -- Une exception du club, sur ce titre : le prix et le jour du membre.
    waiver := public.consume_entry_waiver(new.symbol, new.id);
    if waiver.id is not null then
      if new.entered_on is null
         or new.entered_on > today
         or new.entered_on < today - waiver.max_days_back then
        raise exception 'Jour d''entrée hors de l''exception : entre le % et aujourd''hui',
          to_char(today - waiver.max_days_back, 'DD/MM/YYYY')
          using errcode = 'check_violation';
      end if;
      if new.entry_price is null or new.entry_price <= 0 then
        raise exception 'Prix d''entrée manquant' using errcode = 'check_violation';
      end if;
      -- Confirmé d'office : le relevé ne remplacera pas ce prix par le cours.
      new.entry_confirmed_at := now();
      return new;
    end if;

    new.entered_on := today;
    new.entry_confirmed_at := null;
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

-- --- L'exception accordée : Tim, $VIAV -------------------------------------

do $$
declare
  found_ids uuid[];
begin
  select array_agg(id) into found_ids
    from public.profiles
   where lower(btrim(display_name)) = 'tim';

  if coalesce(array_length(found_ids, 1), 0) <> 1 then
    raise notice 'Exception $VIAV non accordée : % profil(s) nommé(s) « Tim ». À accorder à la main (voir README).',
      coalesce(array_length(found_ids, 1), 0);
    return;
  end if;

  insert into public.entry_waivers (user_id, symbol, reason)
  select found_ids[1], '$VIAV',
         'L''app était en panne le jour où Tim voulait publier ce call (septembre 2026).'
   where not exists (
     select 1 from public.entry_waivers where user_id = found_ids[1] and symbol = '$VIAV'
   );
end
$$;
