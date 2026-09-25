-- ----------------------------------------------------------------------------
-- Oracle (v1.01) : cinq et dix ans disparaissent pour de bon
--
-- `20261001090000_oracle_short_horizons` les avait seulement fermés aux
-- nouveaux paris : ceux qui couraient encore gardaient leur onglet. Le club
-- n'en veut plus du tout. Les paris à cinq et dix ans sont **archivés** dans
-- `predictions_retired` — rien n'est perdu, rien ne s'affiche —, puis retirés
-- de `predictions`, et la base ne connaît plus ces horizons.
--
-- Miroir de `src/lib/horizons.ts`, comparé par
-- `scripts/__tests__/horizons-sql.test.mjs`.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

create table if not exists public.predictions_retired
  (like public.predictions including defaults);

comment on table public.predictions_retired is
  'Paris à cinq et dix ans, archivés quand ces horizons ont été retirés (v1.01). Hors de l''app.';

-- Archive fermée : ni les membres, ni l'app ne la lisent.
alter table public.predictions_retired enable row level security;
revoke all on public.predictions_retired from anon, authenticated;

insert into public.predictions_retired
select p.* from public.predictions p
 where p.horizon in ('5y', '10y')
   and not exists (select 1 from public.predictions_retired r where r.id = p.id);

delete from public.predictions where horizon in ('5y', '10y');

alter table public.predictions drop constraint if exists predictions_horizon_check;
alter table public.predictions
  add constraint predictions_horizon_check
  check (horizon in ('1w', '2w', '1m', '3m', '6m', '12m'));

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
  end;
$$;

create or replace function public.horizon_open(h text)
returns boolean
language sql
immutable
as $$
  select h in ('1w', '2w', '1m', '3m', '6m', '12m');
$$;
