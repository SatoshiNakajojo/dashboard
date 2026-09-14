-- ============================================================================
-- Satoshi Social Club — schéma initial
--
-- Club privé de 5 à 10 membres. Deux principes gouvernent tout le fichier :
--
--   1. « Membre » = avoir une ligne dans `profiles`. Il n'existe pas d'accès
--      anonyme : aucune table n'est lisible sans profil.
--   2. Lecture commune, écriture personnelle. Tout le monde voit tout ; on
--      n'écrit que ses propres lignes. Les deux exceptions — s'assigner une
--      ligne de potluck, voter sur le call d'un autre — sont explicitées par
--      des politiques dédiées, pas par un assouplissement général.
--
-- Idempotent : réexécutable sans erreur.
-- ============================================================================

-- `gen_random_uuid()` est natif depuis PG13 ; pgcrypto reste utile aux projets
-- qui chiffrent côté base. L'empreinte des prédictions utilise `md5()`, natif.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------

do $$ begin
  create type public.asset_class as enum ('BTC', 'ALT', 'ACTION', 'ETF', 'DEGEN');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vote_side as enum ('bull', 'bear');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- profiles — un membre du club
--
-- `color` et `initials` ne sont pas cosmétiques : la couleur d'un membre
-- l'identifie dans toute l'app (avatar, courbe de l'Oracle, pastille de
-- potluck). Elle est donc stockée, pas dérivée d'un hash du nom.
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text        not null check (length(btrim(display_name)) between 1 and 40),
  initials      text        not null check (initials ~ '^[A-ZÀ-Ý]{2}$'),
  color         text        not null check (color ~* '^#[0-9a-f]{6}$'),
  created_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Membres du club. Appartenir au club = avoir une ligne ici.';

-- ----------------------------------------------------------------------------
-- events — les « Crypto Nights »
-- ----------------------------------------------------------------------------

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null,
  theme       text        not null check (length(btrim(theme)) between 1 and 80),
  location    text        not null check (length(btrim(location)) between 1 and 80),
  tag         text        not null default 'Session' check (length(btrim(tag)) <= 24),
  created_by  uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists events_starts_at_idx on public.events (starts_at desc);

-- ----------------------------------------------------------------------------
-- event_attendees — le RSVP « JE VIENS »
-- ----------------------------------------------------------------------------

create table if not exists public.event_attendees (
  event_id    uuid        not null references public.events (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ----------------------------------------------------------------------------
-- potluck_items — « qui amène quoi »
--
-- `assigned_user_id` nul = ligne libre. La course entre deux membres qui
-- tapent la même ligne se règle dans la politique RLS d'UPDATE (voir plus bas) :
-- le premier UPDATE gagne, le second est rejeté et le client déroule son
-- rollback optimiste.
-- ----------------------------------------------------------------------------

create table if not exists public.potluck_items (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid        not null references public.events (id) on delete cascade,
  item_name         text        not null check (length(btrim(item_name)) between 1 and 60),
  assigned_user_id  uuid        references public.profiles (id) on delete set null,
  position          integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists potluck_items_event_idx
  on public.potluck_items (event_id, position, created_at);

create index if not exists potluck_items_assignee_idx
  on public.potluck_items (assigned_user_id)
  where assigned_user_id is not null;

-- ----------------------------------------------------------------------------
-- tickers — les calls d'investissement du « Bag »
--
-- `performance_percentage` est une colonne générée : elle ne peut pas diverger
-- du couple (entry_price, current_price). La perf **vs ₿** reste calculée côté
-- client, car elle dépend du cours BTC courant qui n'est pas dans cette table.
-- ----------------------------------------------------------------------------

create table if not exists public.tickers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid          not null references public.profiles (id) on delete cascade,
  symbol           text          not null check (symbol ~ '^\$[A-Z0-9.\-]{1,10}$'),
  asset_class      public.asset_class not null default 'ALT',
  entry_price      numeric(20, 8) not null check (entry_price > 0),
  current_price    numeric(20, 8) check (current_price >= 0),
  -- Cours du BTC à la date d'entrée : fige le référentiel de la perf vs ₿.
  entry_btc_price  numeric(20, 8) check (entry_btc_price > 0),
  size_usd         numeric(20, 2) check (size_usd >= 0),
  thesis           text          not null check (length(thesis) <= 140),
  coingecko_id     text,
  price_updated_at timestamptz,
  created_at       timestamptz   not null default now(),

  performance_percentage numeric(20, 4)
    generated always as (
      case
        when current_price is null then null
        else round(((current_price - entry_price) / entry_price) * 100, 4)
      end
    ) stored
);

create index if not exists tickers_user_idx on public.tickers (user_id, created_at desc);
create index if not exists tickers_created_idx on public.tickers (created_at desc);

comment on column public.tickers.thesis is
  'Thèse du call, 140 signes maximum — la limite est aussi appliquée à la saisie.';

-- ----------------------------------------------------------------------------
-- ticker_votes — bull / bear, un vote par membre et par call
-- ----------------------------------------------------------------------------

create table if not exists public.ticker_votes (
  ticker_id   uuid        not null references public.tickers (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  side        public.vote_side not null,
  created_at  timestamptz not null default now(),
  primary key (ticker_id, user_id)
);

-- ----------------------------------------------------------------------------
-- predictions — l'Oracle
--
-- `path_data` stocke les points **dans le repère logique 360 × 285**, jamais en
-- pixels d'écran : une prédiction tracée sur un petit téléphone doit se
-- superposer à celle d'une tablette.
-- ----------------------------------------------------------------------------

-- Validation de forme d'un tracé : tableau de couples [x, y] numériques, dans
-- les bornes du repère logique. Immuable, donc utilisable dans un CHECK.
create or replace function public.is_valid_path(path jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(path) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(path) as point
       where jsonb_typeof(point) <> 'array'
          or jsonb_array_length(point) <> 2
          or jsonb_typeof(point -> 0) <> 'number'
          or jsonb_typeof(point -> 1) <> 'number'
          or (point ->> 0)::numeric not between 0 and 360
          or (point ->> 1)::numeric not between 0 and 285
     );
$$;

create table if not exists public.predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  season      text        not null,
  path_data   jsonb       not null default '[]'::jsonb,
  locked_at   timestamptz,
  hash        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Une prédiction par membre et par saison.
  unique (user_id, season),

  -- `path_data` doit être un tableau de couples [x, y] numériques.
  -- Un CHECK n'accepte pas de sous-requête : la validation passe par une
  -- fonction immuable, déclarée juste au-dessus.
  constraint predictions_path_shape check (public.is_valid_path(path_data))
);

create index if not exists predictions_season_idx on public.predictions (season, user_id);

-- ============================================================================
-- Déclencheurs
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists potluck_items_touch on public.potluck_items;
create trigger potluck_items_touch
  before update on public.potluck_items
  for each row execute function public.touch_updated_at();

drop trigger if exists predictions_touch on public.predictions;
create trigger predictions_touch
  before update on public.predictions
  for each row execute function public.touch_updated_at();

-- « Non modifiable après publication » : un call publié est un engagement.
-- Seuls le prix courant et son horodatage bougent — mis à jour par le job de
-- rafraîchissement, jamais par le membre.
create or replace function public.tickers_freeze_call()
returns trigger
language plpgsql
as $$
begin
  if new.symbol           is distinct from old.symbol
  or new.asset_class      is distinct from old.asset_class
  or new.entry_price      is distinct from old.entry_price
  or new.entry_btc_price  is distinct from old.entry_btc_price
  or new.thesis           is distinct from old.thesis
  or new.user_id          is distinct from old.user_id then
    raise exception 'Un call publié n''est plus modifiable (seul current_price évolue)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tickers_freeze on public.tickers;
create trigger tickers_freeze
  before update on public.tickers
  for each row execute function public.tickers_freeze_call();

-- Le verrouillage d'une prédiction est irréversible, et scelle le tracé.
create or replace function public.predictions_seal()
returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null and old.locked_at <= now() then
    if new.path_data is distinct from old.path_data then
      raise exception 'Prédiction verrouillée : le tracé ne peut plus changer'
        using errcode = 'check_violation';
    end if;
    if new.locked_at is distinct from old.locked_at then
      raise exception 'Le verrouillage d''une prédiction est définitif'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Empreinte courte affichée « HASH 8F2A », calculée au moment du scellement.
  if new.locked_at is not null and old.locked_at is null then
    new.hash := upper(substring(md5(new.path_data::text) from 1 for 4));
  end if;

  return new;
end;
$$;

drop trigger if exists predictions_seal_trigger on public.predictions;
create trigger predictions_seal_trigger
  before update on public.predictions
  for each row execute function public.predictions_seal();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Appartenance au club. `security definer` + `search_path` figé : la fonction
-- est appelée depuis les politiques et ne doit pas être détournable.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

alter table public.profiles        enable row level security;
alter table public.events          enable row level security;
alter table public.event_attendees enable row level security;
alter table public.potluck_items   enable row level security;
alter table public.tickers         enable row level security;
alter table public.ticker_votes    enable row level security;
alter table public.predictions     enable row level security;

-- --- profiles ---------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_member());

-- Auto-inscription : on ne crée que son propre profil, lié à sa propre session.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- events -----------------------------------------------------------------

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (public.is_member());

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

drop policy if exists events_update_own on public.events;
create policy events_update_own on public.events
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists events_delete_own on public.events;
create policy events_delete_own on public.events
  for delete to authenticated
  using (created_by = auth.uid());

-- --- event_attendees --------------------------------------------------------

drop policy if exists attendees_select on public.event_attendees;
create policy attendees_select on public.event_attendees
  for select to authenticated
  using (public.is_member());

-- On ne s'inscrit que soi-même, et on ne désinscrit que soi-même.
drop policy if exists attendees_insert_self on public.event_attendees;
create policy attendees_insert_self on public.event_attendees
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

drop policy if exists attendees_delete_self on public.event_attendees;
create policy attendees_delete_self on public.event_attendees
  for delete to authenticated
  using (user_id = auth.uid());

-- --- potluck_items ----------------------------------------------------------

drop policy if exists potluck_select on public.potluck_items;
create policy potluck_select on public.potluck_items
  for select to authenticated
  using (public.is_member());

drop policy if exists potluck_insert on public.potluck_items;
create policy potluck_insert on public.potluck_items
  for insert to authenticated
  with check (public.is_member());

-- LA politique qui porte la règle métier du potluck.
--
--   USING       : on ne peut toucher qu'une ligne **libre** ou **la sienne**.
--                 Une ligne prise par un autre est invisible à l'UPDATE.
--   WITH CHECK  : après écriture, la ligne est soit libre, soit à soi.
--                 Impossible d'assigner un besoin à quelqu'un d'autre.
--
-- Deux membres qui tapent « Glaçons » en même temps : le premier UPDATE passe,
-- le second ne trouve plus de ligne éligible et renvoie 0 ligne affectée. Le
-- client détecte ce zéro et déroule son rollback.
drop policy if exists potluck_claim on public.potluck_items;
create policy potluck_claim on public.potluck_items
  for update to authenticated
  using (
    public.is_member()
    and (assigned_user_id is null or assigned_user_id = auth.uid())
  )
  with check (
    assigned_user_id is null or assigned_user_id = auth.uid()
  );

drop policy if exists potluck_delete on public.potluck_items;
create policy potluck_delete on public.potluck_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = potluck_items.event_id and e.created_by = auth.uid()
    )
  );

-- --- tickers ----------------------------------------------------------------

drop policy if exists tickers_select on public.tickers;
create policy tickers_select on public.tickers
  for select to authenticated
  using (public.is_member());

drop policy if exists tickers_insert_own on public.tickers;
create policy tickers_insert_own on public.tickers
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

-- Le membre peut « toucher » sa ligne ; le trigger `tickers_freeze` restreint
-- ensuite ce qui a réellement le droit de changer.
drop policy if exists tickers_update_own on public.tickers;
create policy tickers_update_own on public.tickers
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tickers_delete_own on public.tickers;
create policy tickers_delete_own on public.tickers
  for delete to authenticated
  using (user_id = auth.uid());

-- --- ticker_votes -----------------------------------------------------------

drop policy if exists votes_select on public.ticker_votes;
create policy votes_select on public.ticker_votes
  for select to authenticated
  using (public.is_member());

drop policy if exists votes_insert_own on public.ticker_votes;
create policy votes_insert_own on public.ticker_votes
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

drop policy if exists votes_update_own on public.ticker_votes;
create policy votes_update_own on public.ticker_votes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists votes_delete_own on public.ticker_votes;
create policy votes_delete_own on public.ticker_votes
  for delete to authenticated
  using (user_id = auth.uid());

-- --- predictions ------------------------------------------------------------

drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions
  for select to authenticated
  using (public.is_member());

drop policy if exists predictions_insert_own on public.predictions;
create policy predictions_insert_own on public.predictions
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

-- On ne modifie que sa prédiction, et seulement tant que le time-lock court.
drop policy if exists predictions_update_own on public.predictions;
create policy predictions_update_own on public.predictions
  for update to authenticated
  using (user_id = auth.uid() and (locked_at is null or locked_at > now()))
  with check (user_id = auth.uid());

-- ============================================================================
-- Realtime
--
-- Seules les tables réellement observées sont publiées : chaque table ajoutée
-- ici coûte de la bande passante à tous les clients connectés.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.potluck_items;
    alter publication supabase_realtime add table public.event_attendees;
    alter publication supabase_realtime add table public.ticker_votes;
    alter publication supabase_realtime add table public.tickers;
  end if;
exception when duplicate_object then
  null; -- déjà publiées
end $$;

-- Realtime filtre les UPDATE sur l'identité de la ligne : sans REPLICA
-- IDENTITY FULL, un `old` partiel empêche le client de savoir qui libère
-- une ligne de potluck.
alter table public.potluck_items replica identity full;
alter table public.event_attendees replica identity full;
alter table public.ticker_votes replica identity full;
