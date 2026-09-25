-- ----------------------------------------------------------------------------
-- Contre-propositions (v1.01) : la majorité des participants, et l'organisateur
--
-- La majorité absolue du club (4 sur 7) ne convenait pas : une soirée peut
-- n'avoir que deux ou trois participants. Désormais :
--
--   • votent les **participants** de la soirée : ceux qui ont dit « Je viens »,
--     plus l'organisateur, plus l'auteur de la proposition (il veut venir,
--     c'est tout l'objet de sa proposition). Un autre membre dit d'abord
--     « Je viens » ;
--   • la proposition est adoptée dès que les **pour** atteignent la majorité
--     de ces participants — 2 sur 3, 3 sur 5 —, rejetée dès que les **contre**
--     l'atteignent ;
--   • si l'**organisateur** vote pour, elle est adoptée **aussitôt** : c'est
--     chez lui, ou de son fait, que la soirée se tenait ;
--   • les participants changent — quelqu'un dit « Je viens » ou se retire — :
--     le décompte est refait, car la majorité change avec eux. Un vote reste
--     enregistré, mais ne compte que tant que son auteur participe.
--
-- Remplace le dépouillement de `20261003090000_event_proposals`. Rejouable.
-- ----------------------------------------------------------------------------

-- Les participants d'une proposition : présents, organisateur, auteur.
create or replace function public.proposal_electorate(pid uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.user_id
    from public.event_proposals p
    join public.event_attendees a on a.event_id = p.event_id
   where p.id = pid
  union
  select e.created_by
    from public.event_proposals p
    join public.events e on e.id = p.event_id
   where p.id = pid
  union
  select p.user_id from public.event_proposals p where p.id = pid;
$$;

-- Tranche une proposition ouverte, d'après les votes de ses participants.
create or replace function public.event_proposal_settle(pid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prop      public.event_proposals%rowtype;
  organizer uuid;
  voters    integer;
  pour      integer;
  contre    integer;
  host_for  boolean;
  majority  integer;
begin
  select * into prop from public.event_proposals where id = pid for update;
  if not found or prop.status <> 'open' then
    return;
  end if;
  select created_by into organizer from public.events where id = prop.event_id;

  select count(*) into voters from public.proposal_electorate(pid);
  majority := voters / 2 + 1;

  select count(*) filter (where v.choice = 'for'),
         count(*) filter (where v.choice = 'against'),
         coalesce(bool_or(v.user_id = organizer and v.choice = 'for'), false)
    into pour, contre, host_for
    from public.event_proposal_votes v
   where v.proposal_id = pid
     and v.user_id in (select user_id from public.proposal_electorate(pid));

  if host_for or pour >= majority then
    update public.event_proposals
       set status = 'adopted', decided_at = now()
     where id = pid;
    update public.event_proposals
       set status = 'rejected', decided_at = now()
     where event_id = prop.event_id and id <> pid and status = 'open';
    update public.events set location = prop.location where id = prop.event_id;
  elsif contre >= majority then
    update public.event_proposals
       set status = 'rejected', decided_at = now()
     where id = pid;
  end if;
end;
$$;

create or replace function public.event_proposals_tally()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.event_proposal_settle(coalesce(new.proposal_id, old.proposal_id));
  return null;
end;
$$;

-- Les présences changent : chaque proposition ouverte de la soirée se recompte.
create or replace function public.event_attendees_resettle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pid uuid;
begin
  -- Soirée supprimée : ses présences partent en cascade, rien à recompter.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return null;
  end if;
  for pid in
    select id from public.event_proposals
     where event_id = coalesce(new.event_id, old.event_id) and status = 'open'
  loop
    perform public.event_proposal_settle(pid);
  end loop;
  return null;
end;
$$;

drop trigger if exists event_attendees_resettle on public.event_attendees;
create trigger event_attendees_resettle
  after insert or delete on public.event_attendees
  for each row execute function public.event_attendees_resettle();

-- --- Le garde des votes : seuls les participants votent ------------------------

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

  if not exists (
    select 1 from public.proposal_electorate(prop.id) e where e.user_id = new.user_id
  ) then
    raise exception 'Seuls les participants votent : dites d''abord « Je viens »'
      using errcode = 'check_violation';
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
