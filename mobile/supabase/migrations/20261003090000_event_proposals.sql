-- ----------------------------------------------------------------------------
-- Soirées (v1.01) : contre-propositions de lieu, votées par le club
--
-- « Je ne peux pas venir chez John, je garde mes enfants : on peut le faire
-- chez moi ? » Un membre — pas celui qui a proposé la soirée, qui la modifie
-- directement — propose un autre lieu, avec une phrase qui l'explique. Le club
-- vote : pour le nouveau lieu, ou contre (on garde l'actuel).
--
-- La règle, écrite ici et nulle part ailleurs :
--
--   • l'auteur de la proposition vote **pour** d'office ;
--   • chaque membre a une voix par proposition, qu'il peut changer tant
--     qu'elle est ouverte ;
--   • dès que les **pour** atteignent la majorité absolue du club (4 sur 7),
--     la soirée **change de lieu** : la base réécrit `events.location`, la
--     carte affiche « modifiée », et les autres propositions ouvertes de la
--     soirée tombent ;
--   • dès que les **contre** l'atteignent, la proposition est rejetée.
--
-- Une majorité absolue plutôt que « plus de pour que de contre » à l'instant :
-- sinon la première voix pour, à 2 contre 1, déplacerait la soirée pendant que
-- le reste du club dort. À la majorité, « plus de votants pour » est garanti,
-- et personne n'attend d'échéance.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

create table if not exists public.event_proposals (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events (id) on delete cascade,
  user_id     uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  location    text        not null check (char_length(btrim(location)) between 1 and 80),
  comment     text        not null check (char_length(btrim(comment)) between 3 and 280),
  status      text        not null default 'open' check (status in ('open', 'adopted', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

comment on table public.event_proposals is
  'Contre-propositions de lieu pour une soirée. Adoptées à la majorité absolue du club (event_proposal_votes).';

create index if not exists event_proposals_event_idx on public.event_proposals (event_id, created_at);

-- Une proposition ouverte par membre et par soirée.
create unique index if not exists event_proposals_one_open
  on public.event_proposals (event_id, user_id) where status = 'open';

create table if not exists public.event_proposal_votes (
  proposal_id uuid        not null references public.event_proposals (id) on delete cascade,
  user_id     uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Recopié de la proposition : de quoi filtrer le temps réel par soirée.
  event_id    uuid        not null references public.events (id) on delete cascade,
  choice      text        not null check (choice in ('for', 'against')),
  created_at  timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create index if not exists event_proposal_votes_event_idx on public.event_proposal_votes (event_id);

-- --- Accès ----------------------------------------------------------------------

alter table public.event_proposals      enable row level security;
alter table public.event_proposal_votes enable row level security;

drop policy if exists event_proposals_select on public.event_proposals;
create policy event_proposals_select on public.event_proposals
  for select to authenticated using (public.is_member());

drop policy if exists event_proposals_insert on public.event_proposals;
create policy event_proposals_insert on public.event_proposals
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

-- Retirer sa proposition tant qu'elle est ouverte.
drop policy if exists event_proposals_delete_own on public.event_proposals;
create policy event_proposals_delete_own on public.event_proposals
  for delete to authenticated
  using (user_id = auth.uid() and status = 'open');

drop policy if exists event_proposal_votes_select on public.event_proposal_votes;
create policy event_proposal_votes_select on public.event_proposal_votes
  for select to authenticated using (public.is_member());

drop policy if exists event_proposal_votes_insert on public.event_proposal_votes;
create policy event_proposal_votes_insert on public.event_proposal_votes
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

drop policy if exists event_proposal_votes_update on public.event_proposal_votes;
create policy event_proposal_votes_update on public.event_proposal_votes
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists event_proposal_votes_delete on public.event_proposal_votes;
create policy event_proposal_votes_delete on public.event_proposal_votes
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.event_proposals to authenticated;
grant select, insert, update, delete on public.event_proposal_votes to authenticated;

-- --- Le garde des propositions ---------------------------------------------------

create or replace function public.event_proposals_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ev public.events%rowtype;
begin
  select * into ev from public.events where id = new.event_id;
  if not found then
    return new; -- la clé étrangère refusera
  end if;

  if tg_op = 'INSERT' then
    if ev.created_by = new.user_id then
      raise exception 'Vous avez proposé cette soirée : modifiez-la directement'
        using errcode = 'check_violation';
    end if;
    if ev.starts_at <= now() then
      raise exception 'Cette soirée a commencé : trop tard pour changer de lieu'
        using errcode = 'check_violation';
    end if;
    if lower(btrim(new.location)) = lower(btrim(ev.location)) then
      raise exception 'C''est déjà le lieu de la soirée'
        using errcode = 'check_violation';
    end if;
    new.location   := btrim(new.location);
    new.comment    := btrim(new.comment);
    new.status     := 'open';
    new.created_at := now();
    new.decided_at := null;
  else
    -- Seule la base tranche : un membre ne réécrit pas une proposition.
    if new.event_id is distinct from old.event_id
       or new.user_id is distinct from old.user_id
       or new.location is distinct from old.location
       or new.comment is distinct from old.comment
       or new.created_at is distinct from old.created_at then
      raise exception 'Une proposition ne se modifie pas'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_proposals_guard on public.event_proposals;
create trigger event_proposals_guard
  before insert or update on public.event_proposals
  for each row execute function public.event_proposals_guard();

-- L'auteur vote pour sa proposition, d'office.
create or replace function public.event_proposals_author_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.event_proposal_votes (proposal_id, user_id, event_id, choice)
  values (new.id, new.user_id, new.event_id, 'for')
  on conflict (proposal_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists event_proposals_author_vote on public.event_proposals;
create trigger event_proposals_author_vote
  after insert on public.event_proposals
  for each row execute function public.event_proposals_author_vote();

-- --- Le garde des votes, et le dépouillement -------------------------------------

create or replace function public.event_proposal_votes_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prop public.event_proposals%rowtype;
begin
  -- Suppression en cascade (proposition ou soirée supprimée) : rien à défendre.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into prop from public.event_proposals
   where id = coalesce(new.proposal_id, old.proposal_id);
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if prop.status <> 'open' then
    raise exception 'Le vote sur cette proposition est clos'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    if old.user_id = prop.user_id then
      raise exception 'Vous soutenez votre propre proposition : retirez-la plutôt'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.user_id = prop.user_id and new.choice <> 'for' then
    raise exception 'On ne vote pas contre sa propre proposition : retirez-la plutôt'
      using errcode = 'check_violation';
  end if;
  new.event_id := prop.event_id;
  if tg_op = 'UPDATE' then
    if new.proposal_id is distinct from old.proposal_id or new.user_id is distinct from old.user_id then
      raise exception 'Un vote ne change ni de proposition ni d''auteur'
        using errcode = 'check_violation';
    end if;
  else
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists event_proposal_votes_guard on public.event_proposal_votes;
create trigger event_proposal_votes_guard
  before insert or update or delete on public.event_proposal_votes
  for each row execute function public.event_proposal_votes_guard();

-- La majorité absolue du club : 4 sur 7.
create or replace function public.club_majority()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (count(*) / 2 + 1)::integer from public.profiles;
$$;

create or replace function public.event_proposals_tally()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pid      uuid := coalesce(new.proposal_id, old.proposal_id);
  prop     public.event_proposals%rowtype;
  pour     integer;
  contre   integer;
  majority integer := public.club_majority();
begin
  select * into prop from public.event_proposals where id = pid for update;
  if not found or prop.status <> 'open' then
    return null;
  end if;

  select count(*) filter (where choice = 'for'), count(*) filter (where choice = 'against')
    into pour, contre
    from public.event_proposal_votes where proposal_id = pid;

  if pour >= majority then
    update public.event_proposals
       set status = 'adopted', decided_at = now()
     where id = pid;
    -- Les autres propositions ouvertes de la soirée tombent : le lieu vient
    -- de changer, elles répondaient à l'ancien.
    update public.event_proposals
       set status = 'rejected', decided_at = now()
     where event_id = prop.event_id and id <> pid and status = 'open';
    update public.events set location = prop.location where id = prop.event_id;
  elsif contre >= majority then
    update public.event_proposals
       set status = 'rejected', decided_at = now()
     where id = pid;
  end if;

  return null;
end;
$$;

drop trigger if exists event_proposals_tally on public.event_proposal_votes;
create trigger event_proposals_tally
  after insert or update or delete on public.event_proposal_votes
  for each row execute function public.event_proposals_tally();

-- --- Temps réel -------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_proposals'
    ) then
      alter publication supabase_realtime add table public.event_proposals;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_proposal_votes'
    ) then
      alter publication supabase_realtime add table public.event_proposal_votes;
    end if;
  end if;
end
$$;

alter table public.event_proposals      replica identity full;
alter table public.event_proposal_votes replica identity full;
