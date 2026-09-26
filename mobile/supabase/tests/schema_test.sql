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

-- `auth.uid()` = John pour toute la suite, sauf quand un test se met dans la
-- peau d'un autre membre avec `set_config('test.uid', …, true)`.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('test.uid', true), ''),
                  'aaaaaaaa-0000-4000-8000-000000000001')::uuid
$$;

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

-- --- Calls : clôturer une position ------------------------------------------

do $$
declare
  t      public.tickers%rowtype;
  failed boolean;
begin
  -- Un call d'il y a un mois, prix d'entrée confirmé (v1.01 : un membre ne
  -- peut plus publier dans le passé, d'où l'insertion par la base).
  insert into public.tickers (id, user_id, symbol, asset_class, entry_price, current_price,
                              entry_btc_price, thesis, entered_on, entry_confirmed_at)
  values ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
          '$SMR', 'ACTION', 10, 11, 60000, 'Petits réacteurs.', current_date - 30,
          now() - interval '30 days');

  set local role authenticated;

  -- Clôturer : la perf devient réalisée, l'instant et le jour sont posés par la
  -- base — même si le client antidate —, et ce n'est pas une « modification ».
  update public.tickers
     set exit_price = 15, exit_btc_price = 66000, closed_on = current_date - 1,
         closed_at = '2000-01-01', current_price = 99
   where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.closed_at = now(), 'la base date la clôture';
  assert t.closed_on = (now() at time zone 'Pacific/Noumea')::date, 'on sort aujourd’hui, pas hier';
  assert t.exit_confirmed_at is null, 'le prix de sortie envoyé reste provisoire';
  assert t.current_price = 15 and t.performance_percentage = 50.0000,
    format('perf réalisée attendue +50 %%, obtenue %s', t.performance_percentage);
  assert t.edited_at is null, 'clôturer n’est pas corriger';
  raise notice 'ok · tickers : une clôture fige la perf réalisée (+50 %%), datée par la base';

  -- Un nouveau cours (refresh-prices) ne fait plus bouger une position close.
  reset role;
  update public.tickers set current_price = 20 where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.current_price = 15, 'le cours d’une position close ne bouge plus';
  set local role authenticated;

  -- v1.01 : une clôture est définitive pour un membre.
  failed := false;
  begin
    update public.tickers set exit_price = 18 where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre ne corrige plus sa sortie';
  failed := false;
  begin
    update public.tickers set exit_price = null, exit_btc_price = null, closed_on = null
     where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre ne rouvre plus un call';
  failed := false;
  begin
    update public.tickers set exit_confirmed_at = now() where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre ne confirme pas lui-même sa sortie';
  raise notice 'ok · tickers : une clôture est définitive (ni correction, ni réouverture)';

  -- Le relevé des prix confirme la sortie au cours du serveur, sans « modifié ».
  reset role;
  update public.tickers
     set exit_price = 15.5, exit_btc_price = 66100, exit_confirmed_at = now()
   where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.exit_price = 15.5 and t.current_price = 15.5 and t.exit_confirmed_at = now(),
    'sortie confirmée au cours du serveur';
  assert t.edited_at is null, 'une confirmation n’est pas une modification';
  raise notice 'ok · tickers : le serveur confirme le prix de sortie';

  -- Les garde-fous de la sortie tiennent aussi pour l'administration.
  failed := false;
  begin
    update public.tickers set closed_on = current_date - 31
     where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'une sortie ne précède pas l’entrée';
  failed := false;
  begin
    update public.tickers set closed_on = current_date + 2
     where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'une sortie n’est pas dans le futur';
  failed := false;
  begin
    update public.tickers set closed_on = null
     where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un prix de sortie sans jour est refusé';
  raise notice 'ok · tickers : une sortie incohérente est refusée';

  set local role authenticated;

  -- Un call se publie ouvert.
  failed := false;
  begin
    insert into public.tickers (user_id, symbol, asset_class, entry_price, thesis,
                                exit_price, closed_on)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '$OKLO', 'ACTION', 10, 'x', 12, current_date);
  exception when check_violation then failed := true;
  end;
  assert failed, 'un call ne se publie pas déjà clos';

  -- Le call d'un autre ne se clôture pas (RLS : 0 ligne).
  reset role;
  insert into public.tickers (id, user_id, symbol, asset_class, entry_price, thesis)
  values ('dddddddd-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002',
          '$NVDA', 'ACTION', 100, 'IA.');
  set local role authenticated;
  update public.tickers set exit_price = 150, closed_on = current_date
   where id = 'dddddddd-0000-4000-8000-000000000003';
  reset role;
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000003';
  assert t.closed_on is null, 'on ne clôture pas le call d’un autre';
  raise notice 'ok · tickers : on ne clôture que ses propres calls';
end $$;

-- --- Calls v1.01 : le prix d'entrée est le cours du marché --------------------

do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  call   uuid;
  t      public.tickers%rowtype;
  failed boolean;
begin
  set local role authenticated;

  -- Publié « il y a deux semaines », au prix d'alors : la base remet à
  -- aujourd'hui, maintenant, et le prix reste provisoire.
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis,
                              entered_on, created_at, coingecko_id, entry_confirmed_at)
  values (john, '$SOL', 'ALT', 90, 90, 'Le retour.', current_date - 14,
          now() - interval '14 days', 'solana', now() - interval '14 days')
  returning * into t;
  call := t.id;
  assert t.entered_on = (now() at time zone 'Pacific/Noumea')::date, 'entrée : aujourd’hui à Nouméa';
  assert t.created_at = now(), 'publication : maintenant';
  assert t.entry_confirmed_at is null, 'le prix envoyé reste provisoire';
  assert t.votes_close_at = now() + interval '72 hours', 'la fenêtre de vote part de maintenant';
  raise notice 'ok · calls v1.01 : un call se publie aujourd’hui, prix provisoire';

  -- Le membre ne corrige ni le prix, ni le jour, ni la confirmation.
  failed := false;
  begin
    update public.tickers set entry_price = 50 where id = call;
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre ne change pas son prix d’entrée';
  failed := false;
  begin
    update public.tickers set entry_confirmed_at = now() where id = call;
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre ne confirme pas lui-même son prix';
  failed := false;
  begin
    update public.tickers set entered_on = current_date - 3 where id = call;
  exception when check_violation then failed := true;
  end;
  assert failed, 'un membre n’antidate pas son entrée';
  -- La thèse, si.
  update public.tickers set thesis = 'Le grand retour.' where id = call;
  raise notice 'ok · calls v1.01 : le prix et le jour d’entrée ne se modifient pas';

  -- Pas de clôture avant la confirmation.
  failed := false;
  begin
    update public.tickers set exit_price = 120, closed_on = (now() at time zone 'Pacific/Noumea')::date where id = call;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne clôture pas un call au prix d’entrée provisoire';
  reset role;

  -- Le relevé des prix confirme au cours du serveur — sans marquer « modifié ».
  update public.tickers
     set entry_price = 101.5, current_price = 101.5, entry_btc_price = 111000,
         entry_confirmed_at = now()
   where id = call;
  select * into t from public.tickers where id = call;
  assert t.entry_price = 101.5 and t.entry_confirmed_at = now(), 'prix confirmé par le serveur';

  -- Sur un call jamais retouché, la confirmation ne le marque pas « modifié ».
  set local role authenticated;
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis,
                              yahoo_symbol)
  values (john, '$NVDA', 'ACTION', 130, 130, 'Les puces.', 'NVDA')
  returning * into t;
  reset role;
  update public.tickers
     set entry_price = 131.2, current_price = 131.2, entry_btc_price = 111000,
         entry_confirmed_at = now()
   where id = t.id;
  select * into t from public.tickers where id = t.id;
  assert t.entry_price = 131.2 and t.edited_at is null, 'une confirmation n’est pas une modification';
  delete from public.tickers where id = t.id;
  raise notice 'ok · calls v1.01 : le serveur confirme le prix d’entrée';

  -- Confirmé : la clôture redevient possible.
  set local role authenticated;
  update public.tickers set exit_price = 120, closed_on = (now() at time zone 'Pacific/Noumea')::date where id = call;
  reset role;
  select * into t from public.tickers where id = call;
  assert t.closed_on = (now() at time zone 'Pacific/Noumea')::date, 'clôturé une fois le prix confirmé';
  raise notice 'ok · calls v1.01 : un call confirmé se clôture';
  delete from public.tickers where id = call;
end $$;

-- --- Calls : des votes argumentés, dans une fenêtre -----------------------------

do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  call   uuid;
  closes timestamptz;
  v      public.ticker_votes%rowtype;
  failed boolean;
  n      integer;
begin
  -- Un call d'Alex, publié par la base : la fenêtre est la sienne, pas celle du client.
  insert into public.tickers (user_id, symbol, asset_class, entry_price, thesis, votes_close_at)
  values (alex, '$RKLB', 'ACTION', 20, 'Fusées.', now() + interval '10 years')
  returning id, votes_close_at into call, closes;
  assert closes = now() + interval '72 hours', format('fenêtre attendue à 72 h, obtenue %s', closes);
  update public.tickers set votes_close_at = now() + interval '10 years' where id = call;
  select votes_close_at into closes from public.tickers where id = call;
  assert closes = now() + interval '72 hours', 'la fenêtre ne se déplace pas';
  raise notice 'ok · votes : la fenêtre de 72 h est posée par la base, et ne bouge pas';

  set local role authenticated;

  -- Sans phrase : refusé. Avec : accepté, et l'heure vient de la base.
  failed := false;
  begin
    insert into public.ticker_votes (ticker_id, user_id, side) values (call, john, 'bull');
  exception when check_violation then failed := true;
  end;
  assert failed, 'un vote sans phrase est refusé';
  insert into public.ticker_votes (ticker_id, user_id, side, reason, created_at)
  values (call, john, 'bull', '  Le carnet de commandes double.  ', '2000-01-01');
  select * into v from public.ticker_votes where ticker_id = call and user_id = john;
  assert v.reason = 'Le carnet de commandes double.' and v.created_at = now(), 'vote argumenté';

  -- Changer de camp, dans la fenêtre : permis, avec une nouvelle phrase.
  update public.ticker_votes set side = 'bear', reason = 'Valorisation délirante.'
   where ticker_id = call and user_id = john;
  select * into v from public.ticker_votes where ticker_id = call and user_id = john;
  assert v.side = 'bear', 'on change d’avis dans la fenêtre';

  -- Le chemin de l'app : un upsert (PostgREST, `onConflict: 'ticker_id,user_id'`).
  -- Même camp : on retouche la phrase (le camp, lui, a déjà changé une fois).
  insert into public.ticker_votes (ticker_id, user_id, side, reason)
  values (call, john, 'bear', 'Valorisation délirante, et dette qui monte.')
  on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  select * into v from public.ticker_votes where ticker_id = call and user_id = john;
  assert v.side = 'bear' and v.reason = 'Valorisation délirante, et dette qui monte.',
    'l’upsert de l’app retouche la phrase';
  raise notice 'ok · votes : une phrase obligatoire, un avis qui peut changer dans la fenêtre';

  -- Voter sur son propre call : refusé.
  reset role;
  perform set_config('test.uid', alex::text, true);
  set local role authenticated;
  failed := false;
  begin
    insert into public.ticker_votes (ticker_id, user_id, side, reason)
    values (call, alex, 'bull', 'Mon propre call.');
  exception when check_violation then failed := true;
  end;
  assert failed, 'pas de vote sur son propre call';
  reset role;
  perform set_config('test.uid', john::text, true);
  raise notice 'ok · votes : pas de vote sur son propre call';

  -- La fenêtre fermée : ni vote, ni retrait.
  alter table public.tickers disable trigger tickers_votes_window;
  update public.tickers set votes_close_at = now() - interval '1 minute' where id = call;
  alter table public.tickers enable trigger tickers_votes_window;
  set local role authenticated;
  failed := false;
  begin
    delete from public.ticker_votes where ticker_id = call and user_id = john;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne retire pas un vote après la fenêtre';
  failed := false;
  begin
    update public.ticker_votes set side = 'bull', reason = 'Finalement si.'
     where ticker_id = call and user_id = john;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne change pas de camp après la fenêtre';
  failed := false;
  begin
    insert into public.ticker_votes (ticker_id, user_id, side, reason)
    values (call, john, 'bear', 'Trop tard.')
    on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  exception when check_violation then failed := true;
  end;
  assert failed, 'l’upsert de l’app est refusé après la fenêtre : le vote est verrouillé';
  reset role;
  raise notice 'ok · votes : fenêtre fermée, votes figés';

  -- Un call supprimé emporte ses votes, fenêtre fermée ou non.
  delete from public.tickers where id = call;
  select count(*) into n from public.ticker_votes where ticker_id = call;
  assert n = 0, 'la suppression en cascade passe';
  raise notice 'ok · votes : un call supprimé emporte ses votes';
end $$;

-- --- Soirées : modifier après publication ------------------------------------

do $$
declare
  john  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  night uuid;
  e     public.events%rowtype;
  n     integer;
begin
  insert into public.events (starts_at, title, location, themes, created_by)
  values (now() + interval '5 days', 'Grillades', 'Rooftop', array['Crypto Night'], john)
  returning id into night;

  set local role authenticated;

  -- Le créateur modifie : l'heure bouge, la base le note.
  update public.events
     set starts_at = now() + interval '6 days', location = 'Plage de l’Anse Vata',
         created_by = alex, created_at = '2000-01-01', edited_at = '2000-01-01'
   where id = night;
  select * into e from public.events where id = night;
  assert e.location = 'Plage de l’Anse Vata' and e.edited_at = now(), 'la modification est datée';
  assert e.created_by = john and e.created_at > '2001-01-01', 'ni l’auteur ni la création ne se réécrivent';

  -- Un autre membre ne la modifie pas.
  perform set_config('test.uid', alex::text, true);
  update public.events set title = 'Détournée' where id = night;
  get diagnostics n = row_count;
  assert n = 0, 'on ne modifie que ses propres soirées';
  perform set_config('test.uid', john::text, true);
  raise notice 'ok · soirées : le créateur modifie, la base date la modification';

  reset role;
  delete from public.events where id = night;
end $$;

-- --- Calls : un seul changement d'avis par call ------------------------------

do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  first  uuid;
  second uuid;
  v      public.ticker_votes%rowtype;
  failed boolean;
  n      integer;
begin
  insert into public.tickers (user_id, symbol, asset_class, entry_price, thesis)
  values (alex, '$ONE', 'ACTION', 10, 'Un.') returning id into first;
  insert into public.tickers (user_id, symbol, asset_class, entry_price, thesis)
  values (alex, '$TWO', 'ACTION', 10, 'Deux.') returning id into second;

  set local role authenticated;

  -- Le chemin de l'app : un upsert. Premier vote, puis un changement de camp.
  insert into public.ticker_votes (ticker_id, user_id, side, reason, changed_at)
  values (first, john, 'bull', 'J’y crois.', '2000-01-01')
  on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  select * into v from public.ticker_votes where ticker_id = first and user_id = john;
  assert v.changed_at is null, 'un premier vote n’est pas un changement (et le client ne le pose pas)';

  insert into public.ticker_votes (ticker_id, user_id, side, reason)
  values (first, john, 'bear', 'Finalement non.')
  on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  select * into v from public.ticker_votes where ticker_id = first and user_id = john;
  assert v.side = 'bear' and v.changed_at = now(), 'le changement de camp est noté';

  -- Un second changement : refusé.
  failed := false;
  begin
    insert into public.ticker_votes (ticker_id, user_id, side, reason)
    values (first, john, 'bull', 'Encore un revirement.')
    on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  exception when check_violation then failed := true;
  end;
  assert failed, 'un seul changement de camp par call';

  -- La phrase, elle, se retouche : même camp, le changement reste celui d'avant.
  insert into public.ticker_votes (ticker_id, user_id, side, reason)
  values (first, john, 'bear', 'Finalement non : la valorisation.')
  on conflict (ticker_id, user_id) do update set side = excluded.side, reason = excluded.reason;
  select * into v from public.ticker_votes where ticker_id = first and user_id = john;
  assert v.reason = 'Finalement non : la valorisation.' and v.changed_at = now(), 'la phrase se retouche';

  -- Ni retrait après un changement, ni changement falsifié.
  failed := false;
  begin
    delete from public.ticker_votes where ticker_id = first and user_id = john;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne retire pas un vote qui a déjà changé de camp';
  update public.ticker_votes set changed_at = null where ticker_id = first and user_id = john;
  select * into v from public.ticker_votes where ticker_id = first and user_id = john;
  assert v.changed_at is not null, 'le client n’efface pas son changement';
  raise notice 'ok · votes : un seul changement de camp, la phrase reste libre';

  -- Retirer son vote : c'est le changement, et il est définitif.
  insert into public.ticker_votes (ticker_id, user_id, side, reason)
  values (second, john, 'bull', 'Deux fois plus.');
  delete from public.ticker_votes where ticker_id = second and user_id = john;
  select count(*) into n from public.ticker_vote_withdrawals where ticker_id = second and user_id = john;
  assert n = 1, 'le retrait est noté, et lisible par les membres';
  failed := false;
  begin
    insert into public.ticker_votes (ticker_id, user_id, side, reason)
    values (second, john, 'bear', 'Je reviens par l’autre côté.');
  exception when check_violation then failed := true;
  end;
  assert failed, 'un vote retiré ne revient pas';
  failed := false;
  begin
    delete from public.ticker_vote_withdrawals where ticker_id = second and user_id = john;
    get diagnostics n = row_count;
    failed := n = 0;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'un membre n’efface pas son retrait';
  raise notice 'ok · votes : retirer son vote est définitif';

  reset role;
  -- Le call supprimé emporte ses votes et ses retraits.
  delete from public.tickers where id in (first, second);
  select count(*) into n from public.ticker_vote_withdrawals where ticker_id in (first, second);
  assert n = 0, 'les retraits partent avec le call';
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
  values ('aaaaaaaa-0000-4000-8000-000000000001', '1m', '[[0,110000],[30,120000]]'::jsonb)
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

-- --- Oracle v1.01 : 2 semaines et 1 mois arrivent, 5 et 10 ans partent -------

do $$
declare
  failed   boolean;
  opened   timestamptz;
  locks    timestamptz;
  resolves timestamptz;
  ancien   uuid;
begin
  delete from public.predictions;

  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '2w', '[[0,110000],[14,118000]]'::jsonb)
  returning opened_at, locked_at, resolves_at into opened, locks, resolves;
  assert locks = opened + interval '36 hours', 'deux semaines : 36 h pour redessiner';
  assert resolves = opened + interval '14 days', 'deux semaines : jugé à J+14';

  insert into public.predictions (user_id, horizon, path_data)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '1m', '[[0,110000],[30,125000]]'::jsonb)
  returning opened_at, locked_at, resolves_at into opened, locks, resolves;
  assert locks = opened + interval '48 hours', 'un mois : 48 h pour redessiner';
  assert resolves = opened + interval '30 days', 'un mois : jugé à J+30';
  raise notice 'ok · oracle v1.01 : deux semaines et un mois ont leur calendrier';

  failed := false;
  begin
    insert into public.predictions (user_id, horizon, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '5y', '[[0,110000],[1825,400000]]'::jsonb);
  exception when check_violation then failed := true;
  end;
  assert failed, 'on n’ouvre plus de pari à cinq ans';
  failed := false;
  begin
    insert into public.predictions (user_id, horizon, path_data)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '10y', '[[0,110000],[3650,1200000]]'::jsonb);
  exception when check_violation then failed := true;
  end;
  assert failed, 'on n’ouvre plus de pari à dix ans';
  raise notice 'ok · oracle v1.01 : cinq et dix ans refusés aux nouveaux paris';

  -- Les anciens paris à cinq et dix ans sont archivés, hors de portée de l'app.
  assert to_regclass('public.predictions_retired') is not null, 'l’archive existe';
  -- RLS sans aucune politique : aucune ligne pour un membre, quels que soient
  -- les droits accordés sur la table.
  assert (select relrowsecurity from pg_class where oid = 'public.predictions_retired'::regclass)
     and not exists (select 1 from pg_policies where tablename = 'predictions_retired'),
    'l’archive n’est pas lisible par les membres';
  raise notice 'ok · oracle v1.01 : cinq et dix ans archivés, hors de l’app';
  delete from public.predictions;
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

-- --- Notifications push -------------------------------------------------------
--
-- Un fait entre dans la file dans la transaction qui le cause, par un
-- déclencheur `security definer` : le membre n'a, lui, aucun droit sur la file.

do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  key87  constant text := repeat('B', 87);
  auth22 constant text := repeat('a', 22);
  n       integer;
  r       public.notification_outbox%rowtype;
  failed  boolean;
  owner   uuid;
  ev      uuid;
  past_ev uuid;
  call    uuid;
  bet     uuid;
  d       date := (now() at time zone 'Pacific/Noumea')::date + 10;
  tick    text;
begin
  -- 1. S'abonner : par la fonction, vers un service de push connu.
  set local role authenticated;
  perform public.register_push_subscription('https://web.push.apple.com/abc', key87, auth22, 'iPhone');
  select count(*) into n from public.push_subscriptions;
  assert n = 1, 'son abonnement se lit';

  failed := false;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (john, 'https://fcm.googleapis.com/fcm/send/x', key87, auth22);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'pas d’écriture directe';

  failed := false;
  begin
    perform public.register_push_subscription('https://evil.example.com/push.apple.com/x', key87, auth22);
  exception when check_violation then failed := true;
  end;
  assert failed, 'un service inconnu est refusé';

  -- Le même appareil, connecté par Alex : l'abonnement change de titulaire.
  perform set_config('test.uid', alex::text, true);
  perform public.register_push_subscription('https://web.push.apple.com/abc', key87, auth22, 'iPhone');
  select count(*) into n from public.push_subscriptions;
  assert n = 1, 'Alex voit l’abonnement qui est désormais le sien';
  perform set_config('test.uid', john::text, true);
  select count(*) into n from public.push_subscriptions;
  assert n = 0, 'John ne voit plus celui d’Alex';
  reset role;
  select user_id into owner from public.push_subscriptions where endpoint = 'https://web.push.apple.com/abc';
  assert owner = alex, 'un appareil, un titulaire';
  raise notice 'ok · push : abonnement par la fonction, vers un service connu, un titulaire par appareil';

  -- 2. Réglages : les siens seulement.
  set local role authenticated;
  insert into public.notification_prefs (user_id, calls) values (john, false);
  failed := false;
  begin
    insert into public.notification_prefs (user_id) values (alex);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'on ne règle pas les notifications d’un autre';
  reset role;
  raise notice 'ok · push : chacun ses réglages';

  -- 3. Une soirée à venir est annoncée, par qui la propose ; une soirée
  --    passée, consignée après coup, ne l'est pas.
  set local role authenticated;
  insert into public.events (starts_at, title, location, themes, created_by)
  values (now() + interval '3 days', 'Grillades', 'Rooftop', array['Crypto Night'], john)
  returning id into ev;
  insert into public.events (starts_at, title, location, themes, created_by)
  values (now() - interval '1 day', 'Passée', 'Ici', array['Crypto Night'], john)
  returning id into past_ev;
  select count(*) into n from public.notification_outbox;
  assert n = 0, 'la file reste invisible au membre';
  reset role;
  select * into r from public.notification_outbox where dedupe_key = 'night_new:' || ev;
  assert r.kind = 'night_new' and r.actor = john and r.payload ->> 'title' = 'Grillades'
     and r.payload -> 'themes' = '["Crypto Night"]'::jsonb, 'soirée annoncée';
  assert not exists (select 1 from public.notification_outbox where dedupe_key = 'night_new:' || past_ev),
    'pas d’annonce pour une soirée passée';
  raise notice 'ok · notifications : une soirée à venir est annoncée, pas une soirée passée';

  -- 4. Un call publié, puis clôturé.
  set local role authenticated;
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis, entered_on)
  values (john, '$OKLO', 'ACTION', 20, 20, 'Réacteurs.', current_date - 10)
  returning id into call;
  update public.tickers set exit_price = 30, closed_on = (now() at time zone 'Pacific/Noumea')::date where id = call;
  reset role;
  select * into r from public.notification_outbox where dedupe_key = 'call_new:' || call;
  assert r.kind = 'call_new' and r.payload ->> 'symbol' = '$OKLO', 'call annoncé';
  select * into r from public.notification_outbox where kind = 'call_closed' and payload ->> 'ticker_id' = call::text;
  assert (r.payload ->> 'performance')::numeric = 50 and (r.payload ->> 'exit_price')::numeric = 30,
    format('clôture annoncée avec sa perf réalisée, obtenu %s', r.payload);
  raise notice 'ok · notifications : un call publié puis clôturé est annoncé, perf comprise';

  -- 5. Rappel du jour J : à partir de 9 h à Nouméa, pour les soirées
  --    annoncées avant 9 h, et pas pour celles du lendemain.
  insert into public.events (starts_at, title, location, themes, created_by, created_at) values
    ((d + time '19:30') at time zone 'Pacific/Noumea', 'Ce soir', 'Loft', array['Stock Night'], john,
     (d - 1 + time '12:00') at time zone 'Pacific/Noumea'),
    ((d + time '20:00') at time zone 'Pacific/Noumea', 'Tardive', 'Loft', array['Stock Night'], john,
     (d + time '09:30') at time zone 'Pacific/Noumea'),
    ((d + 1 + time '19:30') at time zone 'Pacific/Noumea', 'Demain', 'Loft', array['Stock Night'], john,
     (d - 1 + time '12:00') at time zone 'Pacific/Noumea');
  perform public.enqueue_due_notifications((d + time '08:00') at time zone 'Pacific/Noumea');
  assert not exists (select 1 from public.notification_outbox where kind = 'night_reminder'),
    'pas de rappel avant 9 h';
  perform public.enqueue_due_notifications((d + time '10:00') at time zone 'Pacific/Noumea');
  perform public.enqueue_due_notifications((d + time '11:00') at time zone 'Pacific/Noumea');
  select count(*) into n from public.notification_outbox where kind = 'night_reminder';
  assert n = 1, format('un seul rappel, celui de « Ce soir », obtenu %s', n);
  assert exists (select 1 from public.notification_outbox where kind = 'night_reminder' and payload ->> 'title' = 'Ce soir');
  raise notice 'ok · notifications : rappel le jour J à 9 h, une fois, pour les soirées annoncées avant';

  -- 6. Un pari résolu prévient son auteur, avec sa cible — pas au-delà de deux jours.
  insert into public.predictions (user_id, horizon, path_data)
  values (alex, '12m', '[[0,110000],[365,150000]]'::jsonb)
  returning id into bet;
  perform public.enqueue_due_notifications(now() + interval '373 days');
  assert not exists (select 1 from public.notification_outbox where dedupe_key = 'oracle_resolved:' || bet),
    'un pari résolu il y a plus de deux jours ne réveille personne';
  perform public.enqueue_due_notifications(now() + interval '365 days 1 hour');
  select * into r from public.notification_outbox where dedupe_key = 'oracle_resolved:' || bet;
  assert r.recipients = array[alex] and (r.payload ->> 'target')::numeric = 150000
     and r.payload ->> 'horizon' = '12m', 'pari résolu : son auteur seul, avec sa cible';
  raise notice 'ok · notifications : un pari résolu prévient son auteur, avec sa cible';

  -- 7. La fonction Edge réclame ; deux passages ne prennent pas le même fait.
  select count(*) into n from public.claim_notifications(100);
  assert n > 0, 'des faits à réclamer';
  select count(*) into n from public.claim_notifications(100);
  assert n = 0, 'un fait réclamé ne se réclame pas deux fois de suite';
  assert not has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'execute')
     and not has_function_privilege('authenticated', 'public.notify_tick()', 'execute')
     and not has_function_privilege('authenticated', 'public.set_notify_config(text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.enqueue_notification(text, uuid, uuid[], jsonb, text)', 'execute'),
    'rien de la file n’est ouvert aux membres';
  assert not has_function_privilege('authenticated', 'public.schedule_notifications()', 'execute')
     and not has_function_privilege('authenticated', 'public.notify_status()', 'execute'),
    'ni la planification ni le diagnostic';
  assert has_function_privilege('service_role', 'public.claim_notifications(integer)', 'execute')
     and has_function_privilege('service_role', 'public.set_notify_config(text, text)', 'execute')
     and has_function_privilege('service_role', 'public.notify_status()', 'execute'),
    'la fonction Edge et le script de mise en place, si';
  raise notice 'ok · notifications : réclamation exclusive, file fermée aux membres';

  -- 8. Le battement : sans configuration il le dit ; configuré, il appelle
  --    la fonction avec son secret, lu dans le coffre-fort.
  tick := public.notify_tick();
  assert tick like 'non configuré%', format('battement non configuré, obtenu « %s »', tick);
  failed := false;
  begin
    perform public.set_notify_config('https://ailleurs.example.com/x', repeat('s', 40));
  exception when others then failed := true;
  end;
  assert failed, 'une adresse qui n’est pas celle de notify est refusée';
  perform public.set_notify_config('https://abc.supabase.co/functions/v1/notify', repeat('s', 40));
  perform public.set_notify_config('https://abc.supabase.co/functions/v1/notify', repeat('t', 40));
  tick := public.notify_tick();
  assert tick = 'appel envoyé', format('battement configuré, obtenu « %s »', tick);
  assert (select count(*) from net.calls) = 1
     and (select headers ->> 'x-notify-secret' from net.calls) = repeat('t', 40)
     and (select url from net.calls) = 'https://abc.supabase.co/functions/v1/notify',
    'un appel, avec le dernier secret rangé';
  raise notice 'ok · notifications : le battement appelle notify avec le secret du coffre-fort';

  -- 9. Le diagnostic dit ce qui manque — ici, pg_cron, absent hors plateforme.
  assert (public.notify_status() ->> 'configured')::boolean
     and not (public.notify_status() ->> 'scheduled')::boolean
     and (public.notify_status() ->> 'subscriptions')::int = 1,
    format('diagnostic inattendu : %s', public.notify_status());
  assert public.schedule_notifications() like 'échec : %',
    'sans pg_cron, la planification le dit au lieu de lever';
  raise notice 'ok · notifications : le diagnostic dit ce qui manque';
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

-- --- Soirées v1.01 : contre-propositions de lieu, votées -----------------------

-- Le bloc précédent a figé `auth.uid()` sur un visiteur : on rend la main à
-- `test.uid`, comme en tête de fichier.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('test.uid', true), ''),
                  'aaaaaaaa-0000-4000-8000-000000000001')::uuid
$$;

do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  lea    constant uuid := 'aaaaaaaa-0000-4000-8000-000000000011';
  marco  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000012';
  sofia  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000013';
  rayan  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000014';
  toi    constant uuid := 'aaaaaaaa-0000-4000-8000-000000000015';
  ev     uuid;
  ev2    uuid;
  prop   uuid;
  autre  uuid;
  p      public.event_proposals%rowtype;
  e      public.events%rowtype;
  failed boolean;
  n      integer;
begin
  -- Le club au complet ; ce sont les participants de chaque soirée qui votent.
  insert into auth.users (id) values (lea), (marco), (sofia), (rayan), (toi) on conflict do nothing;
  insert into public.profiles (id, display_name, initials, color) values
    (lea, 'Léa', 'LE', '#C9A227'), (marco, 'Marco', 'MC', '#8E7CC3'),
    (sofia, 'Sofia', 'SF', '#C0504D'), (rayan, 'Rayan', 'RY', '#4F81BD'),
    (toi, 'Toi', 'TU', '#EEE8DA');

  -- Grillades chez John ; Léa, Marco et Sofia viennent.
  insert into public.events (starts_at, title, location, themes, created_by)
  values (now() + interval '3 days', 'Grillades', 'Chez John', array['Crypto Night'], john)
  returning id into ev;
  insert into public.event_attendees (event_id, user_id) values (ev, lea), (ev, marco), (ev, sofia);

  set local role authenticated;

  -- Alex ne peut pas venir chez John : il propose chez lui, et vote pour d'office.
  perform set_config('test.uid', alex::text, true);
  insert into public.event_proposals (event_id, location, comment)
  values (ev, '  Chez Alex — Anse Vata ', 'Je garde mes enfants : on peut le faire chez moi ?')
  returning * into p;
  prop := p.id;
  assert p.user_id = alex and p.status = 'open' and p.location = 'Chez Alex — Anse Vata', 'proposition ouverte';
  select count(*) into n from public.event_proposal_votes where proposal_id = prop and choice = 'for';
  assert n = 1, 'l’auteur vote pour d’office';

  failed := false;
  begin
    insert into public.event_proposals (event_id, location, comment) values (ev, 'Ailleurs', 'Encore une idée.');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'une proposition ouverte par membre et par soirée';

  failed := false;
  begin
    update public.event_proposal_votes set choice = 'against' where proposal_id = prop and user_id = alex;
  exception when check_violation then failed := true;
  end;
  assert failed, 'on ne vote pas contre sa propre proposition';

  perform set_config('test.uid', john::text, true);
  failed := false;
  begin
    insert into public.event_proposals (event_id, location, comment) values (ev, 'Chez moi', 'Pour voir.');
  exception when check_violation then failed := true;
  end;
  assert failed, 'le créateur ne contre-propose pas sa propre soirée';

  perform set_config('test.uid', lea::text, true);
  failed := false;
  begin
    insert into public.event_proposals (event_id, location, comment) values (ev, 'chez john', 'Pareil.');
  exception when check_violation then failed := true;
  end;
  assert failed, 'proposer le lieu actuel est refusé';
  raise notice 'ok · contre-propositions : une par membre, pas le créateur, pas le même lieu';

  -- Rayan ne vient pas : il ne vote pas.
  perform set_config('test.uid', rayan::text, true);
  failed := false;
  begin
    insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev, 'for');
  exception when check_violation then failed := true;
  end;
  assert failed, 'seuls les participants votent';
  raise notice 'ok · contre-propositions : seuls les participants votent';

  -- Participants : John, Alex, Léa, Marco, Sofia → majorité à 3.
  -- Marco propose autre chose en parallèle, et vote contre celle d'Alex.
  perform set_config('test.uid', marco::text, true);
  insert into public.event_proposals (event_id, location, comment)
  values (ev, 'Chez Marco', 'J’ai une terrasse.') returning id into autre;
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev, 'against');

  -- Rayan dit « Je viens » : six participants, la majorité passe à 4.
  perform set_config('test.uid', rayan::text, true);
  insert into public.event_attendees (event_id, user_id) values (ev, rayan);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev, 'for');
  perform set_config('test.uid', lea::text, true);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev, 'for');
  select * into e from public.events where id = ev;
  assert e.location = 'Chez John', 'trois pour sur six participants : le lieu ne bouge pas';

  -- Rayan ne vient plus : cinq participants, majorité à 3, et Alex + Léa pour
  -- font 2. Sofia vote pour : 3 sur 5, la soirée change de lieu.
  perform set_config('test.uid', rayan::text, true);
  delete from public.event_attendees where event_id = ev and user_id = rayan;
  select * into e from public.events where id = ev;
  assert e.location = 'Chez John', 'la voix de Rayan ne compte plus, 2 pour sur 5';
  perform set_config('test.uid', sofia::text, true);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev, 'for');
  reset role;
  select * into e from public.events where id = ev;
  select * into p from public.event_proposals where id = prop;
  assert e.location = 'Chez Alex — Anse Vata', format('la soirée change de lieu, obtenu %s', e.location);
  assert e.edited_at = now(), 'la carte dira « modifiée »';
  assert e.created_by = john, 'la soirée reste celle de John';
  assert p.status = 'adopted' and p.decided_at = now(), 'proposition adoptée';
  select * into p from public.event_proposals where id = autre;
  assert p.status = 'rejected', 'les autres propositions ouvertes tombent';
  raise notice 'ok · contre-propositions : à la majorité des participants, la soirée change de lieu';

  -- Le club est prévenu de la proposition, puis du changement de lieu.
  assert exists (
    select 1 from public.notification_outbox
     where dedupe_key = 'night_proposal:' || prop and kind = 'night_proposal' and actor = alex
       and payload ->> 'current' = 'Chez John' and payload ->> 'location' = 'Chez Alex — Anse Vata'
  ), 'contre-proposition annoncée au club';
  assert exists (
    select 1 from public.notification_outbox
     where dedupe_key = 'night_moved:' || prop and kind = 'night_moved' and actor is null
  ), 'changement de lieu annoncé à tout le club';
  assert not exists (
    select 1 from public.notification_outbox where dedupe_key = 'night_moved:' || autre
  ), 'une proposition tombée n’est pas annoncée comme un déménagement';
  raise notice 'ok · notifications : contre-proposition et changement de lieu annoncés';

  set local role authenticated;
  perform set_config('test.uid', lea::text, true);
  failed := false;
  begin
    update public.event_proposal_votes set choice = 'against' where proposal_id = prop and user_id = lea;
  exception when check_violation then failed := true;
  end;
  assert failed, 'le vote est clos une fois la proposition tranchée';

  -- L'organisateur est d'accord : adoptée aussitôt, même seul.
  reset role;
  insert into public.events (starts_at, title, location, themes, created_by)
  values (now() + interval '5 days', 'Trading', 'Loft Sofia', array['Stock Night'], sofia)
  returning id into ev2;
  insert into public.event_attendees (event_id, user_id) values (ev2, lea), (ev2, marco), (ev2, john);
  set local role authenticated;
  perform set_config('test.uid', alex::text, true);
  insert into public.event_proposals (event_id, location, comment)
  values (ev2, 'Plage', 'Il fera beau.') returning id into prop;
  perform set_config('test.uid', sofia::text, true);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev2, 'for');
  reset role;
  select * into p from public.event_proposals where id = prop;
  select * into e from public.events where id = ev2;
  assert p.status = 'adopted' and e.location = 'Plage', 'l’organisateur pour : adoptée aussitôt';
  raise notice 'ok · contre-propositions : l’accord de l’organisateur suffit';

  -- Une soirée à trois : deux contre, la proposition tombe.
  update public.events set location = 'Loft Sofia' where id = ev2;
  delete from public.event_attendees where event_id = ev2 and user_id in (marco, john);
  set local role authenticated;
  perform set_config('test.uid', alex::text, true);
  insert into public.event_proposals (event_id, location, comment)
  values (ev2, 'Chez Alex', 'Plus près.') returning id into prop;
  -- Participants : Sofia, Léa, Alex → majorité à 2.
  perform set_config('test.uid', lea::text, true);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev2, 'against');
  perform set_config('test.uid', sofia::text, true);
  insert into public.event_proposal_votes (proposal_id, event_id, choice) values (prop, ev2, 'against');
  reset role;
  select * into p from public.event_proposals where id = prop;
  select * into e from public.events where id = ev2;
  assert p.status = 'rejected' and e.location = 'Loft Sofia', 'deux contre sur trois : rejetée, le lieu reste';
  raise notice 'ok · contre-propositions : à la majorité des contre, la proposition est rejetée';

  -- Retirer sa proposition ouverte ; pas celle d'un autre.
  set local role authenticated;
  perform set_config('test.uid', lea::text, true);
  insert into public.event_proposals (event_id, location, comment)
  values (ev2, 'Chez Léa', 'Un jardin.') returning id into prop;
  perform set_config('test.uid', alex::text, true);
  delete from public.event_proposals where id = prop;
  get diagnostics n = row_count;
  assert n = 0, 'on ne retire pas la proposition d’un autre';
  perform set_config('test.uid', lea::text, true);
  delete from public.event_proposals where id = prop;
  get diagnostics n = row_count;
  assert n = 1, 'on retire sa proposition ouverte';
  raise notice 'ok · contre-propositions : on retire la sienne, pas celle des autres';

  -- Supprimer une soirée : seulement la sienne, et tout part avec elle.
  perform set_config('test.uid', alex::text, true);
  delete from public.events where id = ev;
  get diagnostics n = row_count;
  assert n = 0, 'on ne supprime pas la soirée d’un autre';
  perform set_config('test.uid', john::text, true);
  delete from public.events where id = ev;
  get diagnostics n = row_count;
  assert n = 1, 'le créateur supprime sa soirée';
  reset role;
  select count(*) into n from public.event_proposals where event_id = ev;
  assert n = 0, 'ses propositions partent avec elle';
  raise notice 'ok · soirées : le créateur supprime sa soirée, propositions comprises';

  perform set_config('test.uid', '', true);
  delete from public.events where id = ev2;
  delete from public.profiles where id in (lea, marco, sofia, rayan, toi);
end $$;

-- --- Qui amène quoi : un membre ajoute ce qu'il apporte (v1.01) -------------
do $$
declare
  ev     constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  zoe    constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000f1';
  line   uuid;
  who    uuid;
  n      integer;
  failed boolean;
begin
  insert into auth.users (id) values (zoe);
  insert into public.profiles (id, display_name, initials, color) values (zoe, 'Zoé', 'ZO', '#7A6FB0');

  set local role authenticated;
  perform set_config('test.uid', alex::text, true);

  -- Alex apporte un dessert que l'organisateur n'avait pas demandé.
  insert into public.potluck_items (event_id, item_name, assigned_user_id, position)
  values (ev, 'Dessert', alex, 90)
  returning id, added_by into line, who;
  assert who = alex, 'la ligne ajoutée à son nom a son auteur';
  raise notice 'ok · potluck : un membre ajoute ce qu''il apporte, à son nom';

  -- Pas au nom d'un autre.
  failed := false;
  begin
    insert into public.potluck_items (event_id, item_name, assigned_user_id, position)
    values (ev, 'Vin', john, 91);
  exception when insufficient_privilege or check_violation then failed := true;
  end;
  assert failed, 'ajouter une ligne au nom d''un autre doit être refusé';

  -- L'auteur se déduit : une ligne libre n'en a pas, et il ne se réécrit pas.
  insert into public.potluck_items (event_id, item_name, assigned_user_id, added_by, position)
  values (ev, 'Glaçons', null, alex, 92)
  returning added_by into who;
  assert who is null, 'une ligne libre est un besoin, sans auteur';
  update public.potluck_items set added_by = null where id = line;
  select added_by into who from public.potluck_items where id = line;
  assert who = alex, 'l''auteur d''une ligne ne se réécrit pas';
  raise notice 'ok · potluck : ni au nom d''un autre, ni d''auteur déclaré à la main';

  -- Un autre membre ne retire pas la ligne d'Alex ; Alex, si.
  perform set_config('test.uid', zoe::text, true);
  delete from public.potluck_items where id = line;
  get diagnostics n = row_count;
  assert n = 0, 'on ne retire pas la ligne d''un autre';
  perform set_config('test.uid', alex::text, true);
  delete from public.potluck_items where id = line;
  get diagnostics n = row_count;
  assert n = 1, 'l''auteur retire sa ligne';

  -- Rendue puis prise par Zoé : elle ne disparaît plus sous ses yeux.
  insert into public.potluck_items (event_id, item_name, assigned_user_id, position)
  values (ev, 'Guitare', alex, 93)
  returning id into line;
  update public.potluck_items set assigned_user_id = null where id = line;
  perform set_config('test.uid', zoe::text, true);
  update public.potluck_items set assigned_user_id = zoe where id = line and assigned_user_id is null;
  perform set_config('test.uid', alex::text, true);
  delete from public.potluck_items where id = line;
  get diagnostics n = row_count;
  assert n = 0, 'une ligne prise par un autre reste';
  raise notice 'ok · potluck : l''auteur retire sa ligne, tant que personne d''autre ne l''a prise';

  -- L'organisateur retire toujours une ligne libre.
  perform set_config('test.uid', john::text, true);
  delete from public.potluck_items where event_id = ev and item_name = 'Glaçons';
  get diagnostics n = row_count;
  assert n = 1, 'l''organisateur retire une ligne libre';
  raise notice 'ok · potluck : l''organisateur retire toujours les lignes libres';

  reset role;
  perform set_config('test.uid', '', true);
  delete from public.potluck_items where event_id = ev and item_name = 'Guitare';
  delete from public.profiles where id = zoe;
end $$;

-- --- Exception au cours live, accordée par le club (v1.01) ------------------
do $$
declare
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  today  date := (now() at time zone 'Pacific/Noumea')::date;
  t      public.tickers%rowtype;
  w      public.entry_waivers%rowtype;
  n      integer;
  failed boolean;
begin
  insert into public.entry_waivers (user_id, symbol, reason) values (alex, '$VIAV', 'test');

  set local role authenticated;

  -- Un membre ne lit que ses exceptions.
  perform set_config('test.uid', john::text, true);
  select count(*) into n from public.entry_waivers;
  assert n = 0, 'on ne lit pas les exceptions des autres';

  -- Sans exception : cours live, aujourd'hui, quoi qu'envoie l'app.
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis, entered_on, yahoo_symbol)
  values (john, '$VIAV', 'ACTION', 9, 12, 'Sans exception.', today - 1, 'VIAV')
  returning * into t;
  assert t.entered_on = today and t.entry_confirmed_at is null, 'sans exception, le jour est imposé';

  -- Consommer une exception sans publier : refusé.
  perform set_config('test.uid', alex::text, true);
  failed := false;
  begin
    perform public.consume_entry_waiver('$VIAV', gen_random_uuid());
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'une exception ne se consomme qu''en publiant';

  -- Avec l'exception : le prix et le jour d'Alex, confirmés, et l'exception consommée.
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, entry_btc_price, thesis, entered_on, yahoo_symbol)
  values (alex, '$VIAV', 'ACTION', 9.5, 12, 84500, 'Entré hier, l''app était en panne.', today - 1, 'VIAV')
  returning * into t;
  assert t.entered_on = today - 1 and t.entry_price = 9.5 and t.entry_btc_price = 84500,
    'l''exception garde le prix et le jour du membre';
  assert t.entry_confirmed_at is not null, 'le prix est confirmé d''office';
  reset role;
  select * into w from public.entry_waivers where user_id = alex and symbol = '$VIAV';
  assert w.used_at is not null and w.ticker_id = t.id, 'l''exception est consommée par ce call';
  raise notice 'ok · exception : un membre publie ce call-là au prix et au jour où il est entré';

  -- Une seule fois : le call suivant reprend la règle.
  set local role authenticated;
  perform set_config('test.uid', alex::text, true);
  insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis, entered_on, yahoo_symbol)
  values (alex, '$VIAV', 'ACTION', 9.5, 12, 'Une deuxième fois.', today - 1, 'VIAV')
  returning * into t;
  assert t.entered_on = today and t.entry_confirmed_at is null, 'une exception ne sert qu''une fois';
  raise notice 'ok · exception : une seule fois, et pas pour les autres membres';

  -- Pas plus loin que ce que l'exception permet.
  reset role;
  insert into public.entry_waivers (user_id, symbol, reason, max_days_back) values (alex, '$ABC', 'test', 7);
  set local role authenticated;
  perform set_config('test.uid', alex::text, true);
  failed := false;
  begin
    insert into public.tickers (user_id, symbol, asset_class, entry_price, current_price, thesis, entered_on, yahoo_symbol)
    values (alex, '$ABC', 'ACTION', 5, 5, 'Trop loin.', today - 10, 'ABC');
  exception when check_violation then failed := true;
  end;
  assert failed, 'une entrée plus ancienne que l''exception est refusée';
  reset role;
  select used_at into w.used_at from public.entry_waivers where user_id = alex and symbol = '$ABC';
  assert w.used_at is null, 'un refus ne consomme pas l''exception';
  raise notice 'ok · exception : bornée dans le temps, et intacte après un refus';

  perform set_config('test.uid', '', true);
  delete from public.tickers where symbol = '$VIAV';
  delete from public.entry_waivers where user_id = alex;
end $$;

-- --- « Viens pas » (v1.01) ---------------------------------------------------
do $$
declare
  ev     constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  john   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  alex   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  n      integer;
  failed boolean;
begin
  set local role authenticated;
  perform set_config('test.uid', alex::text, true);

  -- Alex vient, puis ne vient plus : « Viens pas » retire « Je viens ».
  insert into public.event_attendees (event_id, user_id) values (ev, alex);
  insert into public.event_declines (event_id, user_id) values (ev, alex);
  select count(*) into n from public.event_attendees where event_id = ev and user_id = alex;
  assert n = 0, '« Viens pas » retire « Je viens »';

  -- Puis revient : « Je viens » retire « Viens pas ».
  insert into public.event_attendees (event_id, user_id) values (ev, alex);
  select count(*) into n from public.event_declines where event_id = ev and user_id = alex;
  assert n = 0, '« Je viens » retire « Viens pas »';
  raise notice 'ok · soirées : « Je viens » et « Viens pas » s''excluent';

  -- On ne répond que pour soi, et tout le club voit les réponses.
  failed := false;
  begin
    insert into public.event_declines (event_id, user_id) values (ev, john);
  exception when insufficient_privilege or check_violation then failed := true;
  end;
  assert failed, 'on ne décline pas pour un autre';
  insert into public.event_declines (event_id, user_id) values (ev, alex);
  perform set_config('test.uid', john::text, true);
  select count(*) into n from public.event_declines where event_id = ev;
  assert n = 1, 'le club voit qui ne vient pas';
  delete from public.event_declines where event_id = ev and user_id = alex;
  get diagnostics n = row_count;
  assert n = 0, 'on ne retire pas la réponse d''un autre';
  raise notice 'ok · soirées : on répond pour soi, le club voit les « Viens pas »';

  reset role;
  perform set_config('test.uid', '', true);
  delete from public.event_declines where event_id = ev;
  delete from public.event_attendees where event_id = ev and user_id = alex;
end $$;

rollback;

\echo 'Tous les tests de schéma sont passés.'
