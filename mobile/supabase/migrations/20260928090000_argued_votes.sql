-- ----------------------------------------------------------------------------
-- Des votes argumentés, dans une fenêtre
--
-- Un vote bull ou bear s'accompagne désormais d'une phrase : pourquoi on y
-- croit, ou pas. Et comme les votes rapportent (ou coûtent) des points quand le
-- call se révèle bon ou mauvais, trois règles le rendent honnête :
--
--   • **une fenêtre de vote** — 72 heures après la publication. Sans elle, on
--     voterait bull sur un call déjà à +50 % pour ramasser des points sans
--     avoir rien prédit. `votes_close_at` est posé par la base ;
--   • **pas de vote sur son propre call** — l'auteur est déjà noté comme
--     auteur, il ne se note pas deux fois ;
--   • **un call clos ne se vote plus** — son résultat est connu.
--
-- Hors fenêtre, un vote ne se retire pas non plus : on ne quitte pas un pari
-- perdant après coup. Les suppressions en cascade (call supprimé, membre
-- retiré) restent possibles.
--
-- Les votes d'avant cette migration n'ont pas de phrase : ils restent valables.
-- Les calls déjà publiés reçoivent une fenêtre de 72 h à partir d'aujourd'hui,
-- pour que personne ne soit privé de vote par l'arrivée de la règle.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

alter table public.ticker_votes add column if not exists reason text;

comment on column public.ticker_votes.reason is
  'Pourquoi ce vote, en une phrase (3 à 140 signes). null pour les votes d''avant la règle.';

alter table public.ticker_votes drop constraint if exists ticker_votes_reason_length;
alter table public.ticker_votes add constraint ticker_votes_reason_length
  check (reason is null or length(btrim(reason)) between 3 and 140);

-- --- La fenêtre de vote ---------------------------------------------------------

alter table public.tickers add column if not exists votes_close_at timestamptz;

comment on column public.tickers.votes_close_at is
  'Fin de la fenêtre de vote : publication + 72 h. Posée par la base, immuable.';

update public.tickers
   set votes_close_at = greatest(created_at, now()) + interval '72 hours'
 where votes_close_at is null;

alter table public.tickers alter column votes_close_at set not null;

/**
 * La fenêtre appartient à la base : posée à la publication, jamais déplacée.
 * Un déclencheur à part plutôt qu'une ligne de plus dans `tickers_freeze_call` :
 * celui-ci n'a qu'une règle, et se lit d'un coup d'œil.
 */
create or replace function public.tickers_votes_window()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.votes_close_at := new.created_at + interval '72 hours';
  else
    new.votes_close_at := old.votes_close_at;
  end if;
  return new;
end;
$$;

drop trigger if exists tickers_votes_window on public.tickers;
create trigger tickers_votes_window
  before insert or update on public.tickers
  for each row execute function public.tickers_votes_window();

-- --- Le garde des votes --------------------------------------------------------

create or replace function public.ticker_votes_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  call public.tickers%rowtype;
begin
  -- Une suppression en cascade (call supprimé, membre retiré) arrive par le
  -- déclencheur de clé étrangère, un niveau plus bas : rien à défendre.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into call from public.tickers where id = coalesce(new.ticker_id, old.ticker_id);
  if not found then
    -- La clé étrangère se chargera d'un insert orphelin.
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if call.closed_on is not null then
    raise exception 'Ce call est clôturé : les votes sont figés'
      using errcode = 'check_violation';
  end if;
  if now() > call.votes_close_at then
    raise exception 'Les votes sur ce call sont clos (72 h après sa publication)'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.user_id = call.user_id then
    raise exception 'On ne vote pas sur son propre call'
      using errcode = 'check_violation';
  end if;
  if new.reason is null or length(btrim(new.reason)) < 3 then
    raise exception 'Un vote s''accompagne d''une phrase qui l''explique'
      using errcode = 'check_violation';
  end if;
  new.reason := btrim(new.reason);

  if tg_op = 'UPDATE' then
    if new.ticker_id <> old.ticker_id or new.user_id <> old.user_id then
      raise exception 'Un vote ne change ni de call ni d''auteur'
        using errcode = 'check_violation';
    end if;
    -- L'heure du vote est celle du choix de camp ; retoucher la phrase ne la
    -- déplace pas.
    new.created_at := case when new.side is distinct from old.side then now() else old.created_at end;
  else
    new.created_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists ticker_votes_guard on public.ticker_votes;
create trigger ticker_votes_guard
  before insert or update or delete on public.ticker_votes
  for each row execute function public.ticker_votes_guard();
