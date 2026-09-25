-- ----------------------------------------------------------------------------
-- Oracle (v1.01) : deux semaines et un mois arrivent, cinq et dix ans partent
--
-- Le club parie court. Deux horizons s'ajoutent — « 2w » (14 jours, 36 h pour
-- redessiner) et « 1m » (30 jours, 48 h). Cinq et dix ans sont **retirés** :
-- on n'y ouvre plus de pari, mais ceux qui courent encore gardent leur
-- calendrier et vont à leur terme. Les rayer de la base rendrait ces lignes
-- invalides.
--
-- Miroir de `src/lib/horizons.ts`, comparé par
-- `scripts/__tests__/horizons-sql.test.mjs`.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

create or replace function public.horizon_duration(h text)
returns interval
language sql
immutable
as $$
  select case h
    when '1w'  then interval '7 days'
    when '2w'  then interval '14 days'
    when '1m'  then interval '30 days'
    when '3m'  then interval '90 days'
    when '6m'  then interval '182 days'
    when '12m' then interval '365 days'
    when '5y'  then interval '1825 days'
    when '10y' then interval '3650 days'
  end;
$$;

create or replace function public.horizon_editing(h text)
returns interval
language sql
immutable
as $$
  select case h
    when '1w'  then interval '24 hours'
    when '2w'  then interval '36 hours'
    when '1m'  then interval '48 hours'
    when '3m'  then interval '72 hours'
    when '6m'  then interval '120 hours'
    when '12m' then interval '168 hours'
    when '5y'  then interval '336 hours'
    when '10y' then interval '336 hours'
  end;
$$;

-- Les horizons où l'on peut encore ouvrir un pari.
create or replace function public.horizon_open(h text)
returns boolean
language sql
immutable
as $$
  select h in ('1w', '2w', '1m', '3m', '6m', '12m');
$$;

alter table public.predictions drop constraint if exists predictions_horizon_check;
alter table public.predictions
  add constraint predictions_horizon_check
  check (horizon in ('1w', '2w', '1m', '3m', '6m', '12m', '5y', '10y'));

-- --- Le gardien : refuser un nouveau pari sur un horizon retiré -------------
--
-- Identique à celui de `20260923090000_prediction_horizons`, plus ce refus.

create or replace function public.predictions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.horizon_duration(new.horizon) is null then
      raise exception 'Horizon inconnu : %', new.horizon using errcode = 'check_violation';
    end if;
    if not public.horizon_open(new.horizon) then
      raise exception 'Horizon retiré : on n''ouvre plus de pari à %', new.horizon
        using errcode = 'check_violation';
    end if;

    -- Le calendrier vient d'ici, jamais de l'app. Ce que le client envoie dans
    -- ces colonnes est ignoré — sans quoi un membre pourrait s'offrir une
    -- fenêtre de révision plus longue que celle des autres.
    new.opened_at   := now();
    new.locked_at   := now() + public.horizon_editing(new.horizon);
    new.resolves_at := now() + public.horizon_duration(new.horizon);

    -- Un seul pari en cours par horizon et par membre. Le verrou consultatif
    -- sérialise deux insertions simultanées, qui passeraient sinon toutes les
    -- deux le test ci-dessous.
    perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.horizon));
    if exists (
      select 1 from public.predictions
      where user_id = new.user_id
        and horizon = new.horizon
        and resolves_at > now()
    ) then
      raise exception 'Un pari % est déjà en cours', new.horizon
        using errcode = 'unique_violation';
    end if;

  elsif tg_op = 'UPDATE' then
    if new.user_id     is distinct from old.user_id
       or new.horizon     is distinct from old.horizon
       or new.opened_at   is distinct from old.opened_at
       or new.locked_at   is distinct from old.locked_at
       or new.resolves_at is distinct from old.resolves_at then
      raise exception 'Le calendrier d''un pari ne se modifie pas'
        using errcode = 'check_violation';
    end if;

    if old.locked_at <= now() and new.path_data is distinct from old.path_data then
      raise exception 'Pari verrouillé : le tracé ne peut plus changer'
        using errcode = 'check_violation';
    end if;
  end if;

  -- L'empreinte suit le tracé. Une fois verrouillé, le tracé ne bouge plus, donc
  -- l'empreinte non plus.
  new.hash := upper(substring(md5(new.path_data::text) from 1 for 4));
  return new;
end;
$$;
