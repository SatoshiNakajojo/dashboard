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
  set local role authenticated;

  insert into public.tickers (id, user_id, symbol, asset_class, entry_price, current_price,
                              entry_btc_price, thesis, entered_on)
  values ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
          '$SMR', 'ACTION', 10, 11, 60000, 'Petits réacteurs.', current_date - 30);

  -- Clôturer : la perf devient réalisée, l'instant est posé par la base, et ce
  -- n'est pas une « modification ».
  update public.tickers
     set exit_price = 15, exit_btc_price = 66000, closed_on = current_date - 1,
         closed_at = '2000-01-01', current_price = 99
   where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.closed_at = now(), 'la base date la clôture';
  assert t.current_price = 15 and t.performance_percentage = 50.0000,
    format('perf réalisée attendue +50 %%, obtenue %s', t.performance_percentage);
  assert t.edited_at is null, 'clôturer n’est pas corriger';
  raise notice 'ok · tickers : une clôture fige la perf réalisée (+50 %%)';

  -- Un nouveau cours (refresh-prices) ne fait plus bouger une position close.
  reset role;
  update public.tickers set current_price = 20 where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.current_price = 15, 'le cours d’une position close ne bouge plus';
  set local role authenticated;

  -- Corriger la sortie est daté, sans changer l'instant de clôture.
  update public.tickers set exit_price = 14 where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.edited_at = now() and t.closed_at = now() and t.current_price = 14,
    'une sortie corrigée est datée';
  raise notice 'ok · tickers : une sortie corrigée est datée, le cours reste figé';

  -- Une sortie avant l'entrée, ou dans le futur : refusées.
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

  -- Un prix sans jour n'est pas une clôture.
  failed := false;
  begin
    update public.tickers set closed_on = null
     where id = 'dddddddd-0000-4000-8000-000000000002';
  exception when check_violation then failed := true;
  end;
  assert failed, 'un prix de sortie sans jour est refusé';
  raise notice 'ok · tickers : une sortie incohérente est refusée';

  -- Rouvrir efface la sortie et se voit.
  update public.tickers set exit_price = null, exit_btc_price = null, closed_on = null
   where id = 'dddddddd-0000-4000-8000-000000000002';
  select * into t from public.tickers where id = 'dddddddd-0000-4000-8000-000000000002';
  assert t.closed_at is null and t.exit_price is null, 'rouvert';
  raise notice 'ok · tickers : un call se rouvre';

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
  reset role;
  raise notice 'ok · votes : fenêtre fermée, votes figés';

  -- Un call supprimé emporte ses votes, fenêtre fermée ou non.
  delete from public.tickers where id = call;
  select count(*) into n from public.ticker_votes where ticker_id = call;
  assert n = 0, 'la suppression en cascade passe';
  raise notice 'ok · votes : un call supprimé emporte ses votes';
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
  update public.tickers set exit_price = 30, closed_on = current_date - 1 where id = call;
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

rollback;

\echo 'Tous les tests de schéma sont passés.'
