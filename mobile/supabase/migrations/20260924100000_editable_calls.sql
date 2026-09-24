-- ----------------------------------------------------------------------------
-- Un call se modifie, et la modification se voit
--
-- Un call publié était figé : seul son cours courant bougeait. Le club veut
-- pouvoir corriger une thèse, un prix d'entrée mal saisi, une date d'achat
-- oubliée — ou supprimer le call (la suppression par l'auteur existait déjà en
-- base, `tickers_delete_own`, sans rien dans l'app pour s'en servir).
--
-- Ce qui reste figé : **ce sur quoi on parie** — le titre, sa classe, son
-- auteur, sa date de publication. Changer de titre, c'est un autre call.
--
-- Ce qui se modifie : le prix et la date d'entrée (donc le référentiel BTC qui
-- en découle), la thèse, la taille. Et comme le prix d'entrée fait la perf du
-- classement, toute modification est **datée** (`edited_at`) : la carte
-- l'affiche, et personne ne retouche son prix d'entrée en silence.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

-- Le jour de l'entrée, à l'heure du club. `null` pour les calls d'avant : leur
-- jour d'entrée est celui de leur publication.
alter table public.tickers add column if not exists entered_on date;

-- Dernière modification par l'auteur. Écrite par la base, jamais par l'app.
alter table public.tickers add column if not exists edited_at timestamptz;

comment on column public.tickers.entered_on is
  'Jour de l''entrée (heure de Nouméa). Le référentiel BTC est le cours de ce jour-là.';
comment on column public.tickers.edited_at is
  'Dernière modification du prix, de la date, de la thèse ou de la taille. Posée par tickers_freeze_call.';

create or replace function public.tickers_freeze_call()
returns trigger
language plpgsql
as $$
begin
  -- Ce sur quoi on parie ne change pas.
  if new.symbol      is distinct from old.symbol
  or new.asset_class is distinct from old.asset_class
  or new.user_id     is distinct from old.user_id
  or new.created_at  is distinct from old.created_at then
    raise exception 'Le titre, la classe et l''auteur d''un call ne se modifient pas'
      using errcode = 'check_violation';
  end if;

  -- L'horodatage de modification n'appartient qu'à la base.
  new.edited_at := old.edited_at;

  if new.entry_price     is distinct from old.entry_price
  or new.entry_btc_price is distinct from old.entry_btc_price
  or new.entered_on      is distinct from old.entered_on
  or new.thesis          is distinct from old.thesis
  or new.size_usd        is distinct from old.size_usd then
    new.edited_at := now();
  end if;

  return new;
end;
$$;
