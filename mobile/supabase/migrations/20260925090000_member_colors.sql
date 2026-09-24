-- ----------------------------------------------------------------------------
-- Chaque membre choisit sa couleur — pas celle d'un autre
--
-- La couleur d'un membre lui était attribuée à l'inscription (la première
-- libre de la palette) et ne changeait plus. Elle se choisit maintenant depuis
-- la page de profil, parmi quatorze.
--
-- Elle l'identifie partout : son avatar, ses courbes dans l'Oracle, ses
-- marques sur le potluck. Deux membres de la même couleur, et l'Oracle devient
-- illisible. La page de profil grise donc les couleurs déjà portées ; la base
-- le refuse aussi, pour deux membres qui choisiraient la même à la même
-- seconde — le verrou consultatif sérialise les deux changements.
--
-- Seul le **changement** de couleur est contrôlé. L'inscription prend déjà la
-- première couleur libre, et un club qui dépasserait la palette doit pouvoir
-- accueillir un membre de plus plutôt que de lui refuser l'entrée.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

create or replace function public.profiles_color_guard()
returns trigger
language plpgsql
-- Voit les couleurs de tous les membres, RLS ou non : c'est tout ce qu'il lit,
-- et chaque membre les voit déjà à l'écran.
security definer
set search_path = public, pg_temp
as $$
begin
  if new.color is not distinct from old.color then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('profiles.color'));

  if exists (
    select 1
    from public.profiles p
    where lower(p.color) = lower(new.color)
      and p.id <> new.id
  ) then
    raise exception 'Cette couleur est déjà celle d''un autre membre'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_color_guard on public.profiles;
create trigger profiles_color_guard
  before update of color on public.profiles
  for each row execute function public.profiles_color_guard();
