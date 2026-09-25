-- ----------------------------------------------------------------------------
-- Qui amène quoi (v1.01) : un membre ajoute ce qu'il apporte en plus
--
-- La liste était celle de l'organisateur. Un membre qui voulait apporter
-- autre chose — un dessert, une bouteille — n'avait pas de ligne à cocher.
-- Désormais :
--
--   • tout membre ajoute une ligne **à son nom** : ce qu'il apporte. Il ne
--     l'inscrit pas au nom d'un autre (la politique d'insertion le refuse,
--     comme celle de mise à jour le refusait déjà) ;
--   • la ligne garde son auteur (`added_by`). S'il n'apporte plus la chose,
--     il la retire : personne ne l'avait demandée, elle n'a pas à rester
--     « à prendre ». L'organisateur, lui, retire toujours les lignes libres ;
--   • les lignes de l'organisateur — les besoins de la soirée — n'ont pas
--     d'auteur : prises puis rendues, elles restent sur la liste.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

alter table public.potluck_items
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

comment on column public.potluck_items.added_by is
  'Le membre qui a ajouté la ligne pour l''apporter lui-même. null : un besoin posé par l''organisateur.';

-- L'auteur se déduit, il ne se déclare pas : ni à l'insertion, ni après.
create or replace function public.potluck_items_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Une ligne ajoutée déjà prise : son auteur l'apporte. Libre : c'est un besoin.
    new.added_by := case when new.assigned_user_id is not null then auth.uid() end;
  else
    new.added_by := old.added_by;
  end if;
  return new;
end;
$$;

drop trigger if exists potluck_items_author on public.potluck_items;
create trigger potluck_items_author
  before insert or update on public.potluck_items
  for each row execute function public.potluck_items_author();

-- Ajouter une ligne : libre, ou à son propre nom — jamais à celui d'un autre.
drop policy if exists potluck_insert on public.potluck_items;
create policy potluck_insert on public.potluck_items
  for insert to authenticated
  with check (
    public.is_member()
    and (assigned_user_id is null or assigned_user_id = auth.uid())
  );

-- Retirer une ligne : l'organisateur de la soirée, ou l'auteur de la ligne
-- tant qu'elle est libre ou à lui.
drop policy if exists potluck_delete on public.potluck_items;
create policy potluck_delete on public.potluck_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = potluck_items.event_id and e.created_by = auth.uid()
    )
    or (
      added_by = auth.uid()
      and (assigned_user_id is null or assigned_user_id = auth.uid())
    )
  );
