-- ============================================================================
-- Doublures des objets que la plateforme Supabase fournit d'office.
--
-- Hors plateforme, un PostgreSQL nu n'a ni `auth`, ni `storage`, ni les rôles
-- `authenticated` et `anon` : les migrations y font référence et échoueraient
-- dès la première politique. Ces doublures n'en reproduisent que la forme
-- nécessaire — elles ne servent qu'à `schema_test.sql`, jamais en production.
--
-- Rejouable.
-- ============================================================================

do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select null::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- La publication du temps réel : les migrations y inscrivent leurs tables.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- Le rôle des fonctions Edge et des scripts d'administration.
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

-- Le coffre-fort (Vault) : la forme de ce que lit `notify_tick()` et de ce
-- qu'écrit `set_notify_config()`. En clair ici — ce n'est qu'une doublure.
create schema if not exists vault;
create table if not exists vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  secret      text,
  description text
);
create or replace view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret, description from vault.secrets;
create or replace function vault.create_secret(
  new_secret text, new_name text default null, new_description text default ''
) returns uuid language sql as $$
  insert into vault.secrets (name, secret, description)
  values (new_name, new_secret, new_description) returning id
$$;
create or replace function vault.update_secret(
  secret_id uuid, new_secret text default null, new_name text default null,
  new_description text default null, new_key_id uuid default null
) returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id
$$;

-- pg_net : l'appel HTTP est consigné au lieu d'être émis.
create schema if not exists net;
create table if not exists net.calls (
  id bigserial primary key, url text, body jsonb, headers jsonb
);
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.calls (url, body, headers) values (url, body, headers) returning id
$$;
