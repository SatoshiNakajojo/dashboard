-- ============================================================================
-- Les soirées en direct, et plusieurs thèmes par soirée
--
-- Le club organise des Crypto Nights, des Stock Nights et des Vibe Coding
-- Nights — et une même soirée peut être deux ou trois à la fois. Un seul
-- libellé ne suffisait plus.
--
-- `theme` portait le titre de la soirée (« Grillades & Halving Talk ») et
-- `tag` son étiquette (« Barbecue »). Les deux noms prêtaient à confusion dès
-- qu'on parlait de « thèmes » au pluriel : le titre devient `title`, et
-- `themes` prend la place du `tag`, au pluriel et sans liste fermée — le club
-- doit pouvoir inventer un thème sans migration.
-- ============================================================================

-- --- Renommages, idempotents -------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'theme'
  ) then
    alter table public.events rename column theme to title;
  end if;
end $$;

alter table public.events add column if not exists themes text[] not null default '{}';

-- L'ancienne étiquette devient le premier thème : aucune soirée ne se retrouve
-- sans rien, et le passé reste lisible.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'tag'
  ) then
    update public.events
       set themes = array[tag]
     where cardinality(themes) = 0 and btrim(coalesce(tag, '')) <> '';

    update public.events
       set themes = array['Crypto Night']
     where cardinality(themes) = 0;

    alter table public.events drop column tag;
  end if;
end $$;

-- --- Bornes ------------------------------------------------------------------
--
-- Au moins un thème, au plus cinq, et l'ensemble borné en longueur. Le détail
-- par entrée est du ressort de l'app : une contrainte `check` ne peut pas
-- contenir de sous-requête, et un thème vide se voit à l'écran.

alter table public.events drop constraint if exists events_themes_check;
alter table public.events add constraint events_themes_check check (
  cardinality(themes) between 1 and 5
  and length(array_to_string(themes, ',')) between 1 and 200
);

-- --- Temps réel ---------------------------------------------------------------
--
-- Une soirée proposée doit apparaître chez les six autres membres sans qu'ils
-- rechargent. `replica identity full` pour la même raison que le potluck : un
-- `old` partiel empêcherait le client de rapprocher la ligne modifiée.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events;
  end if;
exception when duplicate_object then
  null; -- déjà publiée
end $$;

alter table public.events replica identity full;
