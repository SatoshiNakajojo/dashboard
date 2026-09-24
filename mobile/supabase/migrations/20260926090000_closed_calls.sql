-- ----------------------------------------------------------------------------
-- Un call se clôture
--
-- Une position vendue restait « en cours » : son cours continuait de bouger
-- après la vente, ou il fallait la supprimer — et le call disparaissait des
-- classements comme s'il n'avait jamais existé.
--
-- Clôturer, c'est inscrire un prix et un jour de sortie. La perf est alors
-- **réalisée** : elle ne bouge plus, et le référentiel vs ₿ s'arrête le même
-- jour (`exit_btc_price`, le cours du bitcoin ce jour-là).
--
-- `current_price` prend la valeur du prix de sortie : la colonne générée
-- `performance_percentage` donne ainsi la perf réalisée sans changer de
-- définition, et `refresh-prices` ne touche plus ces lignes.
--
-- Qui écrit quoi :
--   • le membre : `exit_price`, `exit_btc_price`, `closed_on` — ou les trois à
--     `null` pour rouvrir ;
--   • la base : `closed_at` (l'instant de la clôture), `current_price` d'une
--     position close, et `edited_at` quand une sortie est corrigée ou annulée.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

alter table public.tickers add column if not exists exit_price     numeric(20, 8);
alter table public.tickers add column if not exists exit_btc_price numeric(20, 8);
alter table public.tickers add column if not exists closed_on      date;
alter table public.tickers add column if not exists closed_at      timestamptz;

comment on column public.tickers.exit_price is
  'Prix de sortie. Posé avec closed_on : la perf devient réalisée.';
comment on column public.tickers.exit_btc_price is
  'Cours du BTC le jour de la sortie — fin du référentiel vs ₿.';
comment on column public.tickers.closed_on is
  'Jour de la sortie (heure de Nouméa). null : position en cours.';
comment on column public.tickers.closed_at is
  'Instant de la clôture. Posé par la base, jamais par l''app.';

alter table public.tickers drop constraint if exists tickers_exit_price_positive;
alter table public.tickers add constraint tickers_exit_price_positive
  check (exit_price is null or exit_price > 0);

alter table public.tickers drop constraint if exists tickers_exit_btc_positive;
alter table public.tickers add constraint tickers_exit_btc_positive
  check (exit_btc_price is null or exit_btc_price > 0);

-- Un prix de sortie sans jour, ou un jour sans prix, n'est pas une clôture.
alter table public.tickers drop constraint if exists tickers_exit_complete;
alter table public.tickers add constraint tickers_exit_complete
  check ((exit_price is null) = (closed_on is null)
     and (exit_btc_price is null or exit_price is not null));

create index if not exists tickers_open_idx on public.tickers (created_at desc)
  where closed_on is null;

-- ----------------------------------------------------------------------------
-- Le garde-fou des mises à jour, étendu à la sortie
--
-- Remplace la version de `20260924100000_editable_calls.sql` : même règles pour
-- l'entrée, plus celles de la sortie. Un seul déclencheur écrit `edited_at`,
-- sans quoi l'ordre alphabétique des déclencheurs déciderait lequel gagne.
-- ----------------------------------------------------------------------------

create or replace function public.tickers_freeze_call()
returns trigger
language plpgsql
as $$
declare
  entry_day date;
  today     date := (now() at time zone 'Pacific/Noumea')::date;
  was_closed boolean := old.closed_on is not null;
  is_closed  boolean := new.closed_on is not null;
begin
  -- Ce sur quoi on parie ne change pas.
  if new.symbol      is distinct from old.symbol
  or new.asset_class is distinct from old.asset_class
  or new.user_id     is distinct from old.user_id
  or new.created_at  is distinct from old.created_at then
    raise exception 'Le titre, la classe et l''auteur d''un call ne se modifient pas'
      using errcode = 'check_violation';
  end if;

  -- Les horodatages n'appartiennent qu'à la base.
  new.edited_at := old.edited_at;
  new.closed_at := old.closed_at;

  if new.entry_price     is distinct from old.entry_price
  or new.entry_btc_price is distinct from old.entry_btc_price
  or new.entered_on      is distinct from old.entered_on
  or new.thesis          is distinct from old.thesis
  or new.size_usd        is distinct from old.size_usd then
    new.edited_at := now();
  end if;

  if is_closed then
    entry_day := coalesce(new.entered_on, (new.created_at at time zone 'Pacific/Noumea')::date);
    if new.closed_on < entry_day then
      raise exception 'La sortie ne peut pas précéder l''entrée'
        using errcode = 'check_violation';
    end if;
    if new.closed_on > today then
      raise exception 'La date de sortie ne peut pas être dans le futur'
        using errcode = 'check_violation';
    end if;

    -- Un call BTC est son propre référentiel, à la sortie comme à l'entrée.
    if new.asset_class = 'BTC' then
      new.exit_btc_price := new.exit_price;
    end if;

    if not was_closed then
      new.closed_at := now();
    elsif new.exit_price     is distinct from old.exit_price
       or new.exit_btc_price is distinct from old.exit_btc_price
       or new.closed_on      is distinct from old.closed_on then
      -- Corriger une sortie déplace le classement : ça se voit.
      new.edited_at := now();
    end if;

    -- La perf d'une position close est réalisée : son cours ne bouge plus,
    -- qui que soit l'écrivain (y compris `refresh-prices`).
    new.current_price := new.exit_price;
  else
    new.closed_at := null;
    if was_closed then
      -- Rouvrir annule un résultat affiché : ça se voit aussi.
      new.edited_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- Un call se publie ouvert : la clôture passe par une mise à jour, datée.
create or replace function public.tickers_open_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.closed_on is not null or new.exit_price is not null or new.exit_btc_price is not null then
    raise exception 'Un call se publie en cours ; la clôture vient ensuite'
      using errcode = 'check_violation';
  end if;
  new.closed_at := null;
  return new;
end;
$$;

drop trigger if exists tickers_open_on_insert on public.tickers;
create trigger tickers_open_on_insert
  before insert on public.tickers
  for each row execute function public.tickers_open_on_insert();
