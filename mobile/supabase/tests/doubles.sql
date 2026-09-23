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
