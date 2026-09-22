-- ----------------------------------------------------------------------------
-- Page de profil : photo et liens publics
--
-- Un membre pouvait changer son nom en se réinscrivant, et rien d'autre. Deux
-- colonnes suffisent à ouvrir une vraie page :
--
--   • `avatar_url` — la photo, servie depuis le bucket `avatars` ;
--   • `links`      — ce qu'on veut partager au club : un GitHub, une adresse
--                    de dépôt BTC, un MetaMask.
--
-- `links` est du jsonb plutôt qu'une table. Sept membres, une poignée de liens
-- chacun, toujours lus d'un bloc avec le profil : une table imposerait une
-- jointure et une politique RLS de plus pour aucune requête qu'on ferait
-- réellement. Les bornes sont portées par une contrainte, pas par la confiance.
--
-- Aucune politique nouvelle : `profiles_update_self` couvre déjà « un membre
-- modifie sa propre ligne, et elle seule ».
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.profiles.avatar_url is
  'URL publique de la photo, dans le bucket `avatars`. Null = initiales.';
comment on column public.profiles.links is
  'Liens publics : [{"label": "GitHub", "url": "https://…"}]. Au plus 8.';

-- ----------------------------------------------------------------------------
-- La forme de `links`, vérifiée côté base
--
-- L'app normalise déjà (`src/lib/profileLinks.ts`), mais l'app n'est pas la
-- seule porte : la clé publiable permet d'écrire directement dans PostgREST.
-- Un tableau de 10 000 entrées, ou une `url` de 2 Mo, doit être refusé ici.
-- ----------------------------------------------------------------------------

create or replace function public.valid_profile_links(links jsonb)
returns boolean
language sql
immutable
as $$
  -- `coalesce` sur les types n'est pas de la ceinture-bretelle : une clé
  -- **absente** donne `jsonb_typeof(NULL)` = NULL, et `NULL <> 'string'` vaut
  -- NULL, pas vrai. Sans lui, `[{"label":"GitHub"}]` — sans url — passait la
  -- contrainte. Vu en l'exécutant sur un vrai PostgreSQL, pas en la relisant.
  select jsonb_typeof(links) = 'array'
     and jsonb_array_length(links) <= 8
     and not exists (
       select 1
       from jsonb_array_elements(links) as entry
       where coalesce(jsonb_typeof(entry), 'absent') <> 'object'
          or coalesce(jsonb_typeof(entry -> 'label'), 'absent') <> 'string'
          or coalesce(jsonb_typeof(entry -> 'url'), 'absent') <> 'string'
          or length(btrim(entry ->> 'label')) not between 1 and 24
          or length(btrim(entry ->> 'url')) not between 1 and 200
     );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_links_check'
  ) then
    alter table public.profiles
      add constraint profiles_links_check check (public.valid_profile_links(links));
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Le bucket des photos
--
-- Public en lecture : une photo de profil s'affiche dans sept apps différentes,
-- et signer chaque URL obligerait à rafraîchir des jetons pour une image de
-- club. Elle n'est pas secrète — elle est déjà visible de tous les membres.
--
-- En écriture, chacun n'a que son propre dossier : le chemin commence par son
-- identifiant, et la politique le vérifie. Sans ça, un membre pourrait
-- remplacer la photo d'un autre.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
