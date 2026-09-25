-- ----------------------------------------------------------------------------
-- Modifier une soirée après sa publication
--
-- La RLS le permettait déjà à son créateur (`events_update_own`) ; l'app ne le
-- proposait pas. Ce qui s'ajoute ici, c'est la trace :
--
--   • `edited_at` — posé par la base quand la date, le titre, le lieu ou les
--     thèmes changent. La carte affiche « modifiée » : un membre qui avait noté
--     19 h 30 doit voir que l'heure a bougé ;
--   • le créateur et la date de création ne se réécrivent pas : une soirée ne
--     change pas d'auteur, et « créée le » ne ment pas.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

alter table public.events add column if not exists edited_at timestamptz;

comment on column public.events.edited_at is
  'Dernière modification de la date, du titre, du lieu ou des thèmes. Posée par la base.';

create or replace function public.events_track_edit()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.starts_at is distinct from old.starts_at
     or new.title is distinct from old.title
     or new.location is distinct from old.location
     or new.themes is distinct from old.themes then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists events_track_edit on public.events;
create trigger events_track_edit
  before update on public.events
  for each row execute function public.events_track_edit();
