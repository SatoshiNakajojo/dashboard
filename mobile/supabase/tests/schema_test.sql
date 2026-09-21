-- ============================================================================
-- Tests du schéma — RLS, triggers et contraintes.
--
-- Exécution (voir docs/SETUP.md §« Vérifier le schéma ») :
--   psql -d <base> -v ON_ERROR_STOP=1 -f supabase/migrations/*_init.sql
--   psql -d <base> -f supabase/tests/schema_test.sql
--
-- Chaque cas affiche `ok` ou lève. Un test qui doit échouer est enveloppé dans
-- un bloc qui capture l'exception : c'est l'absence d'exception qui est un bug.
-- ============================================================================

\set QUIET on
\set ON_ERROR_STOP on

begin;

-- --- Doublures Supabase (hors plateforme) -----------------------------------
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- --- Fixtures ---------------------------------------------------------------
insert into auth.users (id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000002');

insert into public.profiles (id, display_name, initials, color) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'John', 'JD', '#E8A33D'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Alex', 'AX', '#6E9A78');

insert into public.events (id, starts_at, title, location, themes, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001', now(), 'Test', 'Ici', array['Crypto Night'],
   'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.potluck_items (id, event_id, item_name, assigned_user_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Libre', null),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'Prise',
   'aaaaaaaa-0000-4000-8000-000000000002');

-- `auth.uid()` = John pour toute la suite.
create or replace function auth.uid() returns uuid language sql stable
  as $$ select 'aaaaaaaa-0000-4000-8000-000000000001'::uuid $$;

\set QUIET off

do $$
declare
  affected integer;
  failed   boolean;
begin
  set local role authenticated;

  -- 1. Prendre une ligne libre.
  update public.potluck_items set assigned_user_id = auth.uid()
   where id = 'cccccccc-0000-4000-8000-000000000001' and assigned_user_id is null;
  get diagnostics affected = row_count;
  assert affected = 1, 'une ligne libre doit pouvoir être prise';
  raise notice 'ok · potluck : une ligne libre se prend';

  -- 2. La ligne d'un autre est invisible à l'UPDATE : 0 ligne, pas d'erreur.
  update public.potluck_items set assigned_user_id = auth.uid()
   where id = 'cccccccc-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  assert affected = 0, 'la ligne d''un autre membre doit être verrouillée';
  raise notice 'ok · potluck : la ligne d''un autre est verrouillée (0 ligne, rollback client)';

  -- 3. Assigner une ligne à quelqu'un d'autre est refusé par le WITH CHECK.
  failed := false;
  begin
    update public.potluck_items
       set assigned_user_id = 'aaaaaaaa-0000-4000-8000-000000000002'
     where id = 'cccccccc-0000-4000-8000-000000000001';
  exception when insufficient_privilege or check_violation then failed := true;
  end;
  assert failed, 'assigner un besoin à un autre membre doit être refusé';
  raise notice 'ok · potluck : impossible d''assigner un besoin à un autre membre';

  -- 4. Se libérer.
  update public.potluck_items set assigned_user_id = null
   where id = 'cccccccc-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  assert affected = 1, 'on doit pouvoir se libérer';
  raise notice 'ok · potluck : on se libère de sa propre ligne';

  reset role;
end $$;

do $$
declare
  perf   numeric;
  failed boolean;
begin
  insert into public.tickers (id, user_id, symbol, asset_class, entry_price, current_price, thesis)
  values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          '$MSTR', 'ACTION', 412, 463.088, 'Levier propre sur BTC via le bilan.');

  select performance_percentage into perf from public.tickers
   where id = 'dddddddd-0000-4000-8000-000000000001';
  assert perf = 12.4000, format('perf générée attendue 12.4000, obtenue %s', perf);
  raise notice 'ok · tickers : performance_percentage générée (+12,4 %%)';

  failed := false;
  begin
    update public.tickers set thesis = 'autre' where id = 'dddddddd-0000-4000-8000-000000000001';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un call publié ne doit plus être modifiable';
  raise notice 'ok · tickers : un call publié est figé';

  update public.tickers set current_price = 470
   where id = 'dddddddd-0000-4000-8000-000000000001';
  raise notice 'ok · tickers : seul current_price évolue';
end $$;

do $$
declare
  sealed text;
  failed boolean;
begin
  insert into public.predictions (id, user_id, season, path_data)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          '2026-S3', '[[34,168],[78,150],[352,44]]'::jsonb);

  failed := false;
  begin
    insert into public.predictions (user_id, season, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '2026-S3', '[[34,168],[999,150]]'::jsonb);
  exception when check_violation then failed := true;
  end;
  assert failed, 'un point hors repère doit être refusé';
  raise notice 'ok · predictions : un tracé hors du repère 360×285 est refusé';

  update public.predictions set locked_at = now()
   where id = 'eeeeeeee-0000-4000-8000-000000000001';
  select hash into sealed from public.predictions
   where id = 'eeeeeeee-0000-4000-8000-000000000001';
  assert sealed is not null and length(sealed) = 4,
    format('empreinte attendue sur 4 signes, obtenue %s', coalesce(sealed, 'NULL'));
  raise notice 'ok · predictions : empreinte calculée au verrouillage (HASH %)', sealed;

  failed := false;
  begin
    update public.predictions set path_data = '[[34,10],[350,20]]'::jsonb
     where id = 'eeeeeeee-0000-4000-8000-000000000001';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un tracé verrouillé ne doit plus changer';
  raise notice 'ok · predictions : le tracé est scellé après verrouillage';

  failed := false;
  begin
    update public.predictions set locked_at = null
     where id = 'eeeeeeee-0000-4000-8000-000000000001';
  exception when check_violation then failed := true;
  end;
  assert failed, 'le verrouillage doit être définitif';
  raise notice 'ok · predictions : le verrouillage est définitif';
end $$;

-- ============================================================================
-- Couleurs de membres — le cas qui avait échappé aux tests
--
-- Un membre crée son profil **avant** d'être membre. `profiles_select` exige
-- `is_member()`, donc la RLS lui refuse toute ligne, la palette se croit
-- vierge, et les sept membres du club sortaient de la même couleur. La
-- fonction `taken_profile_colors()` doit répondre là où le `select` ne peut
-- pas.
--
-- On se met dans la peau de ce nouveau venu : un identifiant sans profil.
-- ============================================================================

do $$ begin create role anon; exception when duplicate_object then null; end $$;

create or replace function auth.uid() returns uuid language sql stable
  as $$ select '99999999-9999-4999-8999-999999999999'::uuid $$;

do $$
begin
  assert not public.is_member(), 'le témoin ne doit justement pas être membre';

  set local role authenticated;
  assert (select count(*) from public.profiles) = 0,
    'la RLS doit bien lui refuser toute ligne — c’est l’origine du défaut';
  assert array_length(public.taken_profile_colors(), 1) >= 2,
    'les couleurs prises doivent rester visibles à qui n’est pas encore membre';
  reset role;
  raise notice 'ok · profiles : les couleurs sont lisibles avant l’adhésion';

  assert not has_function_privilege('anon', 'public.taken_profile_colors()', 'execute'),
    'un visiteur anonyme n’a rien à demander à cette fonction';
  assert has_function_privilege('authenticated', 'public.taken_profile_colors()', 'execute'),
    'un membre connecté doit pouvoir l’appeler';
  raise notice 'ok · profiles : la fonction reste fermée aux visiteurs';
end $$;

rollback;

\echo 'Tous les tests de schéma sont passés.'
