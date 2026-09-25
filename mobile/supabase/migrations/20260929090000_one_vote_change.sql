-- ----------------------------------------------------------------------------
-- Un seul changement d'avis par call
--
-- Dans la fenêtre de 72 h, un vote se modifiait autant qu'on voulait : on
-- pouvait attendre la 71ᵉ heure et basculer du côté qui gagne. Désormais :
--
--   • **un seul changement de camp** par membre et par call. `changed_at`
--     note quand il a eu lieu ; un second est refusé ;
--   • **retirer son vote compte comme ce changement, et il est définitif** :
--     sinon, retirer puis revoter contournerait la règle. Le retrait est noté
--     dans `ticker_vote_withdrawals`, et un vote retiré ne revient pas. On ne
--     retire pas non plus un vote qui a déjà changé de camp ;
--   • **la phrase**, elle, se retouche librement dans la fenêtre : elle
--     n'engage aucun point.
--
-- Les suppressions en cascade (call supprimé, membre retiré) passent toujours,
-- sans rien noter.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

alter table public.ticker_votes add column if not exists changed_at timestamptz;

comment on column public.ticker_votes.changed_at is
  'Quand le membre a changé de camp — une seule fois par call. null : jamais. Posé par la base.';

create table if not exists public.ticker_vote_withdrawals (
  ticker_id    uuid        not null references public.tickers (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  withdrawn_at timestamptz not null default now(),
  primary key (ticker_id, user_id)
);

comment on table public.ticker_vote_withdrawals is
  'Les votes retirés : un retrait est définitif, on ne revote pas sur ce call. Écrite par ticker_votes_guard.';

alter table public.ticker_vote_withdrawals enable row level security;

-- Lecture pour les membres ; aucune écriture directe : seul le garde des votes
-- (security definer) y inscrit un retrait.
drop policy if exists vote_withdrawals_select on public.ticker_vote_withdrawals;
create policy vote_withdrawals_select on public.ticker_vote_withdrawals
  for select to authenticated
  using (public.is_member());

grant select on public.ticker_vote_withdrawals to authenticated;

-- --- Le garde des votes, avec la nouvelle règle ---------------------------------

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
    -- Retirer son vote, c'est son unique changement d'avis — et c'est final.
    if old.changed_at is not null then
      raise exception 'Vous avez déjà changé d''avis sur ce call : votre vote est définitif'
        using errcode = 'check_violation';
    end if;
    insert into public.ticker_vote_withdrawals (ticker_id, user_id)
    values (old.ticker_id, old.user_id)
    on conflict do nothing;
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
    if new.side is distinct from old.side then
      if old.changed_at is not null then
        raise exception 'Un seul changement d''avis par call : votre vote est définitif'
          using errcode = 'check_violation';
      end if;
      new.changed_at := now();
      -- L'heure du vote est celle du choix de camp.
      new.created_at := now();
    else
      -- Retoucher la phrase ne déplace ni l'heure du vote, ni son changement.
      new.changed_at := old.changed_at;
      new.created_at := old.created_at;
    end if;
  else
    if exists (
      select 1 from public.ticker_vote_withdrawals w
       where w.ticker_id = new.ticker_id and w.user_id = new.user_id
    ) then
      raise exception 'Vous avez retiré votre vote sur ce call : ce retrait est définitif'
        using errcode = 'check_violation';
    end if;
    new.changed_at := null;
    new.created_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists ticker_votes_guard on public.ticker_votes;
create trigger ticker_votes_guard
  before insert or update or delete on public.ticker_votes
  for each row execute function public.ticker_votes_guard();
