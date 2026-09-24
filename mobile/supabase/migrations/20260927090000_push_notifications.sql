-- ----------------------------------------------------------------------------
-- Notifications push
--
-- Quatre occasions de prévenir le club, sans qu'il ait à ouvrir l'app :
--
--   • une soirée est proposée            → `night_new`       (réglage « nights »)
--   • c'est ce soir                       → `night_reminder`  (réglage « reminders »)
--   • un call est publié, ou clôturé      → `call_new`, `call_closed` (« calls »)
--   • un de mes paris est résolu          → `oracle_resolved` (« oracle »)
--
-- Le chemin d'une notification :
--
--   1. un déclencheur (ou le planificateur, pour ce qui dépend de l'heure)
--      range un **fait** dans `notification_outbox`, dans la même transaction
--      que ce qui l'a causé : une soirée annulée par un rollback n'est jamais
--      annoncée ;
--   2. chaque minute, `notify_tick()` — appelé par pg_cron — ajoute les rappels
--      dus et, s'il y a quelque chose à envoyer, appelle la fonction Edge
--      `notify` (pg_net) ;
--   3. `notify` réclame les faits en attente (`claim_notifications`), rédige
--      le message, le chiffre pour chaque appareil abonné et l'envoie.
--
-- Les abonnements (`push_subscriptions`) ne s'écrivent que par deux fonctions
-- — s'abonner, se désabonner — et ne se lisent que par leur titulaire. La file
-- n'est lisible par aucun client.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Abonnements : un par appareil
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  -- L'adresse que le service de push (Apple, Google, Mozilla) a donnée au
  -- navigateur. Unique : un appareil n'a qu'un titulaire à la fois.
  endpoint    text        not null unique,
  -- Clé publique de l'appareil (65 octets) et secret d'authentification (16),
  -- en base64url : de quoi chiffrer pour lui seul.
  p256dh      text        not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth        text        not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  user_agent  text        check (length(user_agent) <= 300),
  created_at  timestamptz not null default now(),

  -- Seuls les services de push connus : sans ce filtre, un membre pourrait
  -- faire envoyer au serveur des requêtes vers l'adresse de son choix.
  constraint push_subscriptions_known_service check (
    endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'
    and length(endpoint) <= 1024
  )
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (user_id = auth.uid());

-- Aucune écriture directe : les deux fonctions ci-dessous sont les seules portes.
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Réservé aux membres' using errcode = 'insufficient_privilege';
  end if;

  -- Un téléphone prêté, ou un changement de compte : l'abonnement suit le
  -- membre connecté, il n'est pas dupliqué.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Réglages : ce que chacun veut recevoir. Pas de ligne = tout.
-- ----------------------------------------------------------------------------

create table if not exists public.notification_prefs (
  user_id    uuid        primary key references public.profiles (id) on delete cascade,
  nights     boolean     not null default true,
  reminders  boolean     not null default true,
  calls      boolean     not null default true,
  oracle     boolean     not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists notification_prefs_select_own on public.notification_prefs;
create policy notification_prefs_select_own on public.notification_prefs
  for select using (user_id = auth.uid());

drop policy if exists notification_prefs_insert_own on public.notification_prefs;
create policy notification_prefs_insert_own on public.notification_prefs
  for insert with check (user_id = auth.uid() and public.is_member());

drop policy if exists notification_prefs_update_own on public.notification_prefs;
create policy notification_prefs_update_own on public.notification_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists notification_prefs_touch on public.notification_prefs;
create trigger notification_prefs_touch
  before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- La file : des faits, pas des messages
--
-- Le texte se rédige à l'envoi (`_shared/notifyMessages.ts`) : la base garde
-- ce qui s'est passé, et une correction de formulation vaut pour les envois
-- suivants sans migration.
-- ----------------------------------------------------------------------------

create table if not exists public.notification_outbox (
  id          bigserial   primary key,
  kind        text        not null check (kind in (
                'night_new', 'night_reminder', 'call_new', 'call_closed', 'oracle_resolved')),
  -- Le membre à l'origine : il n'est pas prévenu de son propre geste.
  actor       uuid        references public.profiles (id) on delete set null,
  -- `null` : tout le club (sauf l'auteur). Sinon, ces membres seulement.
  recipients  uuid[],
  payload     jsonb       not null default '{}'::jsonb,
  -- Un même fait n'entre qu'une fois, même si le planificateur repasse.
  dedupe_key  text        unique,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  attempts    integer     not null default 0,
  sent_at     timestamptz,
  report      text
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (id) where sent_at is null;

alter table public.notification_outbox enable row level security;
-- Aucune politique : ni lecture ni écriture depuis un client.
revoke all on public.notification_outbox from anon, authenticated;
revoke all on sequence public.notification_outbox_id_seq from anon, authenticated;

/**
 * Range un fait dans la file. Ne lève jamais : une notification ratée ne
 * doit pas faire échouer la soirée ou le call qui l'a causée.
 */
create or replace function public.enqueue_notification(
  p_kind       text,
  p_actor      uuid,
  p_recipients uuid[],
  p_payload    jsonb,
  p_dedupe     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_outbox (kind, actor, recipients, payload, dedupe_key)
  values (p_kind, p_actor, p_recipients, p_payload, p_dedupe)
  on conflict (dedupe_key) do nothing;
exception when others then
  raise warning 'notification % non mise en file : %', p_kind, sqlerrm;
end;
$$;

revoke all on function public.enqueue_notification(text, uuid, uuid[], jsonb, text)
  from public, anon, authenticated;

-- --- Une soirée est proposée ---------------------------------------------------

create or replace function public.notify_night_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Une soirée passée qu'on consigne après coup n'est pas une invitation.
  if new.starts_at <= now() then
    return null;
  end if;
  perform public.enqueue_notification(
    'night_new',
    new.created_by,
    null,
    jsonb_build_object(
      'event_id',  new.id,
      'title',     new.title,
      'location',  new.location,
      'starts_at', new.starts_at,
      'themes',    to_jsonb(new.themes)
    ),
    'night_new:' || new.id
  );
  return null;
end;
$$;

drop trigger if exists events_notify on public.events;
create trigger events_notify
  after insert on public.events
  for each row execute function public.notify_night_created();

-- --- Un call est publié, ou clôturé --------------------------------------------

create or replace function public.notify_call_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_notification(
      'call_new',
      new.user_id,
      null,
      jsonb_build_object(
        'ticker_id',   new.id,
        'symbol',      new.symbol,
        'asset_class', new.asset_class,
        'thesis',      new.thesis
      ),
      'call_new:' || new.id
    );
  elsif new.closed_on is not null and old.closed_on is null then
    perform public.enqueue_notification(
      'call_closed',
      new.user_id,
      null,
      jsonb_build_object(
        'ticker_id',   new.id,
        'symbol',      new.symbol,
        'performance', new.performance_percentage,
        'exit_price',  new.exit_price
      ),
      -- Rouvrir puis reclôturer est une nouvelle clôture, donc une nouvelle nouvelle.
      'call_closed:' || new.id || ':' || floor(extract(epoch from new.closed_at))::bigint
    );
  end if;
  return null;
end;
$$;

drop trigger if exists tickers_notify on public.tickers;
create trigger tickers_notify
  after insert or update of closed_on on public.tickers
  for each row execute function public.notify_call_changed();

-- --- Ce qui dépend de l'heure ---------------------------------------------------

/**
 * Les rappels dus à `p_now` :
 *
 *   • les soirées du jour, à partir de 9 h à Nouméa, tant qu'elles n'ont pas
 *     commencé — sauf celles proposées après 9 h : leur annonce vient de
 *     partir, un rappel dans la foulée serait du bruit ;
 *   • les paris résolus depuis moins de deux jours. Au-delà, la nouvelle est
 *     vieille — et le premier passage ne réveille pas tout l'historique.
 *
 * Renvoie le nombre de faits ajoutés à la file.
 */
create or replace function public.enqueue_due_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_now timestamp   := p_now at time zone 'Pacific/Noumea';
  morning   timestamptz := (local_now::date + time '09:00') at time zone 'Pacific/Noumea';
  added     integer     := 0;
  batch     integer;
begin
  if p_now >= morning then
    insert into public.notification_outbox (kind, payload, dedupe_key)
    select 'night_reminder',
           jsonb_build_object(
             'event_id',  e.id,
             'title',     e.title,
             'location',  e.location,
             'starts_at', e.starts_at,
             'attendees', (select count(*) from public.event_attendees a where a.event_id = e.id)
           ),
           'night_reminder:' || e.id
      from public.events e
     where (e.starts_at at time zone 'Pacific/Noumea')::date = local_now::date
       and e.starts_at > p_now
       and e.created_at < morning
    on conflict (dedupe_key) do nothing;
    get diagnostics batch = row_count;
    added := added + batch;
  end if;

  insert into public.notification_outbox (kind, recipients, payload, dedupe_key)
  select 'oracle_resolved',
         array[p.user_id],
         jsonb_build_object(
           'prediction_id', p.id,
           'horizon',       p.horizon,
           -- Ce que visait le tracé : le prix de son dernier point.
           'target',        (p.path_data -> -1 ->> 1)::numeric
         ),
         'oracle_resolved:' || p.id
    from public.predictions p
   where p.resolves_at <= p_now
     and p.resolves_at > p_now - interval '2 days'
     and jsonb_array_length(p.path_data) >= 2
  on conflict (dedupe_key) do nothing;
  get diagnostics batch = row_count;
  added := added + batch;

  return added;
end;
$$;

revoke all on function public.enqueue_due_notifications(timestamptz) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Côté fonction Edge
-- ----------------------------------------------------------------------------

/**
 * Réclame des faits à envoyer. `skip locked` : deux passages simultanés ne
 * prennent jamais le même fait. Un fait réclamé depuis plus de deux minutes
 * sans être marqué envoyé est considéré comme abandonné (fonction interrompue)
 * et se réclame à nouveau — cinq tentatives au plus.
 */
create or replace function public.claim_notifications(p_limit integer default 20)
returns setof public.notification_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notification_outbox o
     set claimed_at = now(),
         attempts   = o.attempts + 1
   where o.id in (
     select id
       from public.notification_outbox
      where sent_at is null
        and attempts < 5
        and (claimed_at is null or claimed_at < now() - interval '2 minutes')
      order by id
      limit p_limit
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Le battement : chaque minute, via pg_cron
-- ----------------------------------------------------------------------------

/**
 * Ajoute les rappels dus, puis appelle la fonction `notify` s'il y a quelque
 * chose à envoyer — et seulement alors : une minute sans nouvelle ne coûte
 * qu'une requête, pas un appel de fonction.
 *
 * L'adresse de la fonction et son secret d'appel vivent dans le coffre-fort
 * (Vault), jamais en clair dans `cron.job`, lisible par qui accède au schéma.
 * `npm run push:setup` les y range.
 *
 * Renvoie ce qu'elle a fait, pour qu'un `select public.notify_tick()` dans le
 * SQL Editor serve de diagnostic.
 */
create or replace function public.notify_tick()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fn_url text;
  secret text;
begin
  perform public.enqueue_due_notifications();

  if not exists (
    select 1 from public.notification_outbox where sent_at is null and attempts < 5
  ) then
    return 'rien à envoyer';
  end if;

  begin
    select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'ssc_notify_url';
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'ssc_notify_secret';
  exception when others then
    return 'coffre-fort illisible : ' || sqlerrm;
  end;
  if fn_url is null or secret is null then
    return 'non configuré — voir npm run push:setup';
  end if;

  begin
    perform net.http_post(
      url     := fn_url,
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-notify-secret', secret
      )
    );
  exception when others then
    return 'pg_net indisponible : ' || sqlerrm;
  end;
  return 'appel envoyé';
end;
$$;

revoke all on function public.notify_tick() from public, anon, authenticated;

/**
 * Range l'adresse de `notify` et son secret dans le coffre-fort. Appelée une
 * fois par `npm run push:setup`, avec la clé de service.
 */
create or replace function public.set_notify_config(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing uuid;
begin
  if p_url !~ '^https://[^/]+/functions/v1/notify$' then
    raise exception 'Adresse de fonction inattendue : %', p_url;
  end if;
  if length(coalesce(p_secret, '')) < 32 then
    raise exception 'Secret d''appel trop court';
  end if;

  select id into existing from vault.secrets where name = 'ssc_notify_url';
  if existing is null then
    perform vault.create_secret(p_url, 'ssc_notify_url', 'Adresse de la fonction notify');
  else
    perform vault.update_secret(existing, p_url);
  end if;

  select id into existing from vault.secrets where name = 'ssc_notify_secret';
  if existing is null then
    perform vault.create_secret(p_secret, 'ssc_notify_secret', 'Secret d''appel de notify');
  else
    perform vault.update_secret(existing, p_secret);
  end if;
end;
$$;

revoke all on function public.set_notify_config(text, text) from public, anon, authenticated;

/**
 * Pose le battement : pg_net pour appeler, pg_cron pour la minute. Rejouable —
 * `cron.schedule` remplace une tâche de même nom. Ne lève pas : renvoie ce
 * qui s'est passé, pour que `push:setup` puisse le dire.
 */
create or replace function public.schedule_notifications()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('ssc-notify', '* * * * *', 'select public.notify_tick()');
  return 'planifié';
exception when others then
  return 'échec : ' || sqlerrm;
end;
$$;

/** Où en est la mise en place : de quoi faire un diagnostic sans SQL Editor. */
create or replace function public.notify_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  scheduled  boolean := false;
  configured boolean := false;
begin
  begin
    select exists (select 1 from cron.job where jobname = 'ssc-notify' and active)
      into scheduled;
  exception when others then
    scheduled := false;
  end;
  begin
    select count(*) = 2 into configured
      from vault.decrypted_secrets
     where name in ('ssc_notify_url', 'ssc_notify_secret') and decrypted_secret is not null;
  exception when others then
    configured := false;
  end;

  return jsonb_build_object(
    'scheduled',     scheduled,
    'configured',    configured,
    'pending',       (select count(*) from public.notification_outbox
                       where sent_at is null and attempts < 5),
    'abandoned',     (select count(*) from public.notification_outbox
                       where sent_at is null and attempts >= 5),
    'subscriptions', (select count(*) from public.push_subscriptions),
    'last_sent',     (select max(sent_at) from public.notification_outbox)
  );
end;
$$;

revoke all on function public.schedule_notifications() from public, anon, authenticated;
revoke all on function public.notify_status() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_notifications(integer) to service_role;
    grant execute on function public.set_notify_config(text, text) to service_role;
    grant execute on function public.schedule_notifications() to service_role;
    grant execute on function public.notify_status() to service_role;
  end if;
end
$$;

-- La planification, dès la migration. Sur la plateforme, pg_cron et pg_net
-- sont disponibles ; hors plateforme (tests), on passe. Et si l'activation
-- échoue, la migration ne tombe pas pour autant : `npm run push:setup`
-- réessaie et dit ce qui bloque.
do $$
declare
  outcome text;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    outcome := public.schedule_notifications();
    if outcome <> 'planifié' then
      raise warning 'planification des notifications : %', outcome;
    end if;
  end if;
end
$$;
