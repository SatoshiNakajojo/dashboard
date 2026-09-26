-- ----------------------------------------------------------------------------
-- Soirées (v1.01) : « Viens pas »
--
-- On savait qui venait, pas qui avait vu la soirée. Un membre silencieux
-- pouvait ne pas pouvoir venir, ou ne pas l'avoir vue du tout. Désormais :
--
--   • `event_declines` : « je ne viens pas » à cette soirée, un par membre ;
--   • « Je viens » et « Viens pas » s'excluent. Choisir l'un retire l'autre,
--     dans la base (déclencheur), pour que deux appareils ne puissent pas
--     laisser les deux ;
--   • qui n'est ni dans l'un ni dans l'autre n'a pas encore répondu.
--
-- Se décommander d'un « Je viens » en passant à « Viens pas » change les
-- participants : les propositions d'autre lieu ouvertes se recomptent,
-- comme quand on retire son « Je viens » (`20261005090000`). Rejouable.
-- ----------------------------------------------------------------------------

create table if not exists public.event_declines (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_declines is
  '« Viens pas » : le membre a vu la soirée et ne viendra pas. Exclusif de event_attendees.';

alter table public.event_declines enable row level security;

drop policy if exists declines_select on public.event_declines;
create policy declines_select on public.event_declines
  for select to authenticated
  using (public.is_member());

-- Comme pour « Je viens » : on ne répond que pour soi.
drop policy if exists declines_insert_self on public.event_declines;
create policy declines_insert_self on public.event_declines
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

drop policy if exists declines_delete_self on public.event_declines;
create policy declines_delete_self on public.event_declines
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.event_declines to authenticated;

-- --- L'un retire l'autre ------------------------------------------------------

create or replace function public.event_rsvp_exclusive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pid     uuid;
  removed integer;
begin
  if tg_table_name = 'event_declines' then
    delete from public.event_attendees
     where event_id = new.event_id and user_id = new.user_id;
    get diagnostics removed = row_count;
    -- Un participant de moins : la majorité des propositions ouvertes change.
    -- (Le recompte ordinaire ignore les suppressions en cascade, dont celle-ci.)
    if removed > 0 then
      for pid in
        select id from public.event_proposals
         where event_id = new.event_id and status = 'open'
      loop
        perform public.event_proposal_settle(pid);
      end loop;
    end if;
  else
    delete from public.event_declines
     where event_id = new.event_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists event_declines_exclusive on public.event_declines;
create trigger event_declines_exclusive
  after insert on public.event_declines
  for each row execute function public.event_rsvp_exclusive();

drop trigger if exists event_attendees_exclusive on public.event_attendees;
create trigger event_attendees_exclusive
  after insert on public.event_attendees
  for each row execute function public.event_rsvp_exclusive();

-- --- Temps réel -------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.event_declines;
  end if;
exception when duplicate_object then
  null; -- déjà publiée
end $$;

alter table public.event_declines replica identity full;
