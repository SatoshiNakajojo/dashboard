-- ============================================================================
-- Couleurs de membres — lisibles avant d'être membre
--
-- `profiles_select` exige `is_member()`, qui exige d'avoir un profil. Au moment
-- précis où un membre crée le sien, il n'en a pas : la RLS lui refuse toute
-- ligne, `pickColor` reçoit une liste vide et rend la première couleur de la
-- palette. Les sept membres du club se retrouvaient de la même couleur.
--
-- `security definer` contourne la RLS le temps d'une agrégation, et ne renvoie
-- que des couleurs : aucune identité, aucune adresse, aucun décompte nominatif.
-- `search_path` figé pour la même raison que `is_member()` — la fonction ne
-- doit pas être détournable.
-- ============================================================================

create or replace function public.taken_profile_colors()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(p.color), array[]::text[]) from public.profiles p;
$$;

revoke all on function public.taken_profile_colors() from public;
revoke all on function public.taken_profile_colors() from anon;
grant execute on function public.taken_profile_colors() to authenticated;
