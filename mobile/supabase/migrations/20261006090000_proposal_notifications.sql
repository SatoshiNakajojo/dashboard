-- ----------------------------------------------------------------------------
-- Notifications (v1.01) : une contre-proposition, un lieu qui change
--
--   • un membre propose un autre lieu        → `night_proposal` (réglage « nights »)
--     tout le club est prévenu, sauf l'auteur : un participant doit voter, un
--     autre peut décider de venir si le lieu lui convient mieux ;
--   • la soirée change de lieu par vote       → `night_moved` (« nights »)
--     tout le club, auteur compris : le dernier vote a pu tomber pendant qu'il
--     n'avait pas l'app ouverte.
--
-- Le texte se rédige à l'envoi (`_shared/notifyMessages.ts`). Rejouable.
-- ----------------------------------------------------------------------------

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox
  add constraint notification_outbox_kind_check
  check (kind in (
    'night_new', 'night_reminder', 'call_new', 'call_closed', 'oracle_resolved',
    'night_proposal', 'night_moved'));

create or replace function public.notify_event_proposal()
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
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_notification(
      'night_proposal',
      new.user_id,
      null,
      jsonb_build_object(
        'proposal_id', new.id,
        'event_id',    ev.id,
        'title',       ev.title,
        'current',     ev.location,
        'location',    new.location,
        'comment',     new.comment,
        'starts_at',   ev.starts_at
      ),
      'night_proposal:' || new.id
    );
  elsif new.status = 'adopted' and old.status is distinct from 'adopted' then
    perform public.enqueue_notification(
      'night_moved',
      null,
      null,
      jsonb_build_object(
        'proposal_id', new.id,
        'event_id',    ev.id,
        'title',       ev.title,
        'location',    new.location,
        'proposer',    new.user_id,
        'starts_at',   ev.starts_at
      ),
      'night_moved:' || new.id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists event_proposals_notify on public.event_proposals;
create trigger event_proposals_notify
  after insert or update of status on public.event_proposals
  for each row execute function public.notify_event_proposal();
