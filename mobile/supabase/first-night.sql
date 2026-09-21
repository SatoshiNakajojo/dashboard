-- ============================================================================
-- Première Crypto Night — à coller dans le SQL Editor de Supabase
--
-- L'app sait rejoindre une soirée et prendre une ligne de potluck, pas créer
-- l'une ni l'autre : le dossier de design n'a pas d'écran d'administration. En
-- attendant, une soirée se pose ici.
--
-- À adapter : l'adresse de l'organisateur, le thème, le lieu, la date. Le thème
-- et la date apparaissent **deux fois** — ils servent à retrouver la soirée
-- pour y accrocher le potluck.
--
-- Les heures sont en UTC+11, celle de Nouméa. `starts_at` est un `timestamptz`,
-- donc l'heure s'affiche juste pour chaque membre — à condition que le décalage
-- soit juste à l'écriture.
--
-- Relancer ce fichier ne crée pas de doublon.
-- ============================================================================

-- --- La soirée --------------------------------------------------------------
--
-- L'organisateur est retrouvé par son adresse, et `created_by` référence
-- `profiles` : il doit s'être connecté au moins une fois.

insert into public.events (starts_at, theme, location, tag, created_by)
select
  timestamptz '2026-10-03 19:30:00+11',
  'Grillades & Halving Talk',
  'Chez John',
  'Barbecue',
  p.id
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'john.creusot@gmail.com'
  and not exists (
    select 1 from public.events e
    where e.theme = 'Grillades & Halving Talk'
      and e.starts_at = timestamptz '2026-10-03 19:30:00+11'
  );

-- --- Ce qu'il y a à apporter ------------------------------------------------
--
-- Laissées libres : c'est aux membres de se les attribuer depuis l'app, et
-- c'est tout l'intérêt de l'écran.

insert into public.potluck_items (event_id, item_name, position)
select e.id, besoin.nom, besoin.rang
from public.events e
cross join (values
  ('Glaçons',                1),
  ('Bière artisanale',       2),
  ('Planche de charcuterie', 3),
  ('Pain & fromages',        4),
  ('Dessert',                5),
  ('Softs & jus',            6)
) as besoin(nom, rang)
where e.theme = 'Grillades & Halving Talk'
  and e.starts_at = timestamptz '2026-10-03 19:30:00+11'
  and not exists (
    select 1 from public.potluck_items i
    where i.event_id = e.id and i.item_name = besoin.nom
  );

-- --- Contrôle ---------------------------------------------------------------

select e.starts_at, e.theme, e.location, count(i.id) as lignes_potluck
from public.events e
left join public.potluck_items i on i.event_id = e.id
group by e.id, e.starts_at, e.theme, e.location
order by e.starts_at;
