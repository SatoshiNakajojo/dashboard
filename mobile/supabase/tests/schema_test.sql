-- ============================================================================
-- Tests du schéma — RLS, triggers et contraintes.
--
-- Exécution (voir docs/SETUP.md §« Vérifier le schéma ») : toutes les
-- migrations, dans l'ordre, puis ce fichier.
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
  edited timestamptz;
begin
  insert into public.tickers (id, user_id, symbol, asset_class, entry_price, current_price, thesis)
  values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          '$MSTR', 'ACTION', 412, 463.088, 'Levier propre sur BTC via le bilan.');

  select performance_percentage into perf from public.tickers
   where id = 'dddddddd-0000-4000-8000-000000000001';
  assert perf = 12.4000, format('perf générée attendue 12.4000, obtenue %s', perf);
  raise notice 'ok · tickers : performance_percentage générée (+12,4 %%)';

  -- Ce sur quoi on parie reste figé.
  failed := false;
  begin
    update public.tickers set symbol = '$COIN' where id = 'dddddddd-0000-4000-8000-000000000001';
  exception when check_violation then failed := true;
  end;
  assert failed, 'le titre d’un call ne doit pas changer';
  raise notice 'ok · tickers : le titre d’un call publié est figé';

  -- Le cours qui bouge n'est pas une modification.
  update public.tickers set current_price = 470
   where id = 'dddddddd-0000-4000-8000-000000000001';
  select edited_at into edited from public.tickers
   where id = 'dddddddd-0000-4000-8000-000000000001';
  assert edited is null, 'un nouveau cours ne marque pas le call comme modifié';
  raise notice 'ok · tickers : un nouveau cours ne marque pas le call comme modifié';

  -- La thèse et le prix se corrigent, et la correction est datée.
  update public.tickers set thesis = 'Levier propre sur BTC.', entry_price = 400,
         edited_at = '2000-01-01'
   where id = 'dddddddd-0000-4000-8000-000000000001';
  select edited_at into edited from public.tickers
   where id = 'dddddddd-0000-4000-8000-000000000001';
  assert edited = now(), 'la base date la modification, pas le client';
  raise notice 'ok · tickers : un call se corrige, et la correction est datée';
end $$;

-- --- Oracle : des paris, pas une saison ---------------------------------------
--
-- Le calendrier d'un pari est une frontière de sécurité : c'est la base qui le
-- fixe, et le client ne peut ni l'allonger ni le rouvrir.

do $$
declare
  semaine  uuid;
  dix_ans  uuid;
  autre    uuid;
  vide     uuid;
  opened   timestamptz;
  locks    timestamptz;
  resolves timestamptz;
  sealed   text;
  failed   boolean;
  affected integer;
begin
  -- 1. Ce que le client envoie dans le calendrier est ignoré.
  insert into public.predictions (user_id, horizon, path_data, opened_at, locked_at, resolves_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '1w', '[[0,110000],[7,125000]]'::jsonb,
          now() - interval '1 year', now() + interval '10 years', now() + interval '20 years')
  returning id, opened_at, locked_at, resolves_at into semaine, opened, locks, resolves;
  assert opened = now(), 'l’ouverture doit être l’instant du dépôt';
  assert locks = now() + interval '24 hours', 'un pari d’une semaine se révise 24 h';
  assert resolves = now() + interval '7 days', 'un pari d’une semaine se juge à J+7';
  raise notice 'ok · predictions : le calendrier vient de la base, pas du client';

  -- 2. Un pari en cours par horizon, mais plusieurs horizons en parallèle.
  failed := false;
  begin
    insert into public.predictions (user_id, horizon, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '1w', '[[0,110000],[7,90000]]'::jsonb);
  exception when unique_violation then failed := true;
  end;
  assert failed, 'un second pari d’une semaine en cours doit être refusé';

  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '10y', '[[0,110000],[3650,1200000]]'::jsonb)
  returning id into dix_ans;
  raise notice 'ok · predictions : un pari en cours par horizon, les horizons en parallèle';

  -- 3. Un tracé se stocke en prix : jour dans le pari, prix strictement positif.
  failed := false;
  begin
    insert into public.predictions (user_id, horizon, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '3m', '[[0,110000],[45,-5]]'::jsonb);
  exception when check_violation then failed := true;
  end;
  assert failed, 'un prix négatif doit être refusé';

  failed := false;
  begin
    insert into public.predictions (user_id, horizon, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '20y', '[[0,110000]]'::jsonb);
  exception when check_violation then failed := true;
  end;
  assert failed, 'un horizon inconnu doit être refusé';
  raise notice 'ok · predictions : un tracé hors bornes ou un horizon inconnu est refusé';

  -- 4. Le calendrier ne se réécrit pas.
  failed := false;
  begin
    update public.predictions set locked_at = now() + interval '1 year' where id = semaine;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne rallonge pas sa fenêtre de révision';
  raise notice 'ok · predictions : le calendrier d’un pari est immuable';

  -- 5. L'empreinte suit le tracé.
  select hash into sealed from public.predictions where id = semaine;
  assert sealed is not null and length(sealed) = 4,
    format('empreinte attendue sur 4 signes, obtenue %s', coalesce(sealed, 'NULL'));
  raise notice 'ok · predictions : empreinte calculée au dépôt (HASH %)', sealed;

  -- 6. Verrouillé, le tracé ne bouge plus. On avance l'horloge du pari en
  --    contournant le gardien — seule la base de test peut le faire.
  alter table public.predictions disable trigger predictions_guard_trigger;
  update public.predictions set locked_at = now() - interval '1 minute' where id = semaine;
  alter table public.predictions enable trigger predictions_guard_trigger;

  failed := false;
  begin
    update public.predictions set path_data = '[[0,110000],[7,200000]]'::jsonb where id = semaine;
  exception when check_violation then failed := true;
  end;
  assert failed, 'un tracé verrouillé ne doit plus changer';
  raise notice 'ok · predictions : le tracé est scellé après verrouillage';

  -- 7. Retrait : toujours tant que le pari est révisable ; verrouillé,
  --    seulement s'il ne lèse personne (`prediction_withdrawable`).
  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000002', '1w', '[[0,110000],[7,90000]]'::jsonb)
  returning id into autre;

  set local role authenticated;
  delete from public.predictions where id = dix_ans;
  get diagnostics affected = row_count;
  assert affected = 1, 'un pari encore révisable se retire';

  delete from public.predictions where id = semaine;
  get diagnostics affected = row_count;
  assert affected = 0, 'verrouillé, avec un autre pari en cours sur l’horizon : il reste';
  reset role;
  raise notice 'ok · predictions : un pari verrouillé reste si un autre membre a parié';

  -- Le pari d'Alex part : John est seul sur l'horizon, il peut débloquer.
  delete from public.predictions where id = autre;
  set local role authenticated;
  delete from public.predictions where id = semaine;
  get diagnostics affected = row_count;
  assert affected = 1, 'verrouillé mais seul sur l’horizon : il se débloque';
  reset role;
  raise notice 'ok · predictions : seul sur l’horizon, un pari verrouillé se débloque';

  -- Un pari verrouillé sans tracé se retire, même face à d'autres paris.
  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '6m', '[]'::jsonb)
  returning id into vide;
  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000002', '6m', '[[0,110000],[182,150000]]'::jsonb);
  alter table public.predictions disable trigger predictions_guard_trigger;
  update public.predictions set locked_at = now() - interval '1 minute' where id = vide;
  alter table public.predictions enable trigger predictions_guard_trigger;
  set local role authenticated;
  delete from public.predictions where id = vide;
  get diagnostics affected = row_count;
  assert affected = 1, 'un pari sans tracé ne bloque rien';
  reset role;
  raise notice 'ok · predictions : un pari verrouillé sans tracé se retire';
end $$;

-- --- Choisir sa couleur, pas celle d'un autre ---------------------------------

do $$
declare
  failed boolean;
  mine   text;
begin
  set local role authenticated;

  -- John prend une couleur libre : accepté.
  update public.profiles set color = '#C7788F' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select color into mine from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  assert mine = '#C7788F', 'une couleur libre se choisit';

  -- Puis celle d'Alex, écrite dans une autre casse : refusé.
  failed := false;
  begin
    update public.profiles set color = '#6e9a78' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  exception when unique_violation then failed := true;
  end;
  assert failed, 'la couleur d’un autre membre ne se prend pas';

  -- Changer de prénom sans toucher à la couleur reste possible.
  update public.profiles set display_name = 'Johnny' where id = 'aaaaaaaa-0000-4000-8000-000000000001';

  reset role;
  raise notice 'ok · profiles : on choisit sa couleur, pas celle d’un autre';
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
