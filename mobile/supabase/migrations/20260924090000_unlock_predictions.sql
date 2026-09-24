-- ----------------------------------------------------------------------------
-- Débloquer un pari verrouillé
--
-- Un seul pari en cours par membre et par horizon, et un pari verrouillé ne se
-- retirait plus : un horizon restait donc bloqué jusqu'à la résolution — trois
-- mois, dix ans — même quand personne d'autre n'avait parié. C'était le cas des
-- prédictions de l'ancienne saison, converties en paris à trois mois déjà
-- verrouillés, parfois sans tracé du tout.
--
-- Le verrou protège la sincérité d'un pari **face aux autres** : on ne
-- redessine pas après avoir vu le cours bouger, pendant que les autres restent
-- figés. Seul sur l'horizon, il n'y a personne à protéger. Un pari verrouillé
-- peut donc être retiré par son auteur :
--
--   • s'il n'a pas de tracé (moins de deux points) — ce n'est pas un pari ;
--   • ou si aucun autre membre n'a de pari en cours sur cet horizon.
--
-- Un pari résolu, lui, ne se retire jamais : il appartient à l'historique.
--
-- Miroir de `withdrawable()` dans `src/features/oracle/betting.ts`.
-- Rejouable.
-- ----------------------------------------------------------------------------

create or replace function public.prediction_withdrawable(p public.predictions)
returns boolean
language sql
stable
-- Lit les paris des autres pour savoir s'il en existe : c'est tout ce qu'il
-- en apprend, et chaque membre les voit déjà à l'écran.
security definer
set search_path = public
as $$
  select p.resolves_at > now()
     and (
       p.locked_at > now()
       or jsonb_array_length(p.path_data) < 2
       or not exists (
         select 1
         from public.predictions o
         where o.horizon = p.horizon
           and o.user_id <> p.user_id
           and o.resolves_at > now()
           and jsonb_array_length(o.path_data) >= 2
       )
     );
$$;

revoke all on function public.prediction_withdrawable(public.predictions) from public, anon;
grant execute on function public.prediction_withdrawable(public.predictions) to authenticated;

drop policy if exists predictions_delete_own on public.predictions;
create policy predictions_delete_own on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and public.prediction_withdrawable(predictions));
