-- ============================================================================
-- Exception : un call au prix où le membre est réellement entré
--
-- L'app impose le cours live à la publication d'un call (v1.01) : sinon, on
-- attendrait de voir si le call est bon pour le publier. Ce script est la
-- porte de service, pour un cas validé par le club — l'app était en panne le
-- jour où le membre voulait publier.
--
-- Mode d'emploi :
--   1. le membre publie son call dans l'app, normalement (thèse comprise) ;
--   2. dans Supabase → SQL Editor, collez ce script, remplacez les cinq
--      valeurs ci-dessous, et lancez-le (Run) ;
--   3. le message « Call … corrigé » confirme ; la carte se met à jour.
--
-- Garde-fous : le script ne touche qu'un call ouvert de ce membre sur ce
-- titre, et s'arrête s'il en trouve zéro ou plusieurs. Le call reste marqué
-- « confirmé » : le relevé des prix ne remplacera pas le prix d'entrée. Et il
-- n'est pas marqué « modifié » : c'est une décision du club, pas une retouche.
-- ============================================================================

do $$
declare
  membre   text    := 'Tim';             -- son nom, tel qu'affiché dans l'app
  symbole  text    := '$XXX';            -- le titre, tel qu'affiché sur la carte
  prix     numeric := 0;                 -- son prix d'achat, en dollars
  btc      numeric := 0;                 -- le cours du bitcoin au même moment, en dollars
  le_jour  date    := date '2026-09-25'; -- le jour où il est entré (AAAA-MM-JJ)

  call     public.tickers%rowtype;
begin
  if prix <= 0 or btc <= 0 then
    raise exception 'Renseignez le prix d''achat et le cours du bitcoin (en dollars).';
  end if;

  select t.* into strict call
    from public.tickers t
    join public.profiles p on p.id = t.user_id
   where lower(p.display_name) = lower(membre)
     and upper(t.symbol) = upper(symbole)
     and t.closed_on is null;

  if le_jour > (call.created_at at time zone 'Pacific/Noumea')::date then
    raise exception 'Le jour d''entrée ne peut pas suivre la publication du call.';
  end if;

  -- Un call BTC est son propre référentiel.
  if call.asset_class = 'BTC' then
    btc := prix;
  end if;

  -- En deux temps, pour que la base y voie une confirmation du prix, pas une
  -- retouche : elle ne marque alors pas le call « modifié ».
  update public.tickers set entry_confirmed_at = null where id = call.id;
  update public.tickers
     set entry_price        = prix,
         entry_btc_price    = btc,
         entered_on         = le_jour,
         entry_confirmed_at = now()
   where id = call.id;

  raise notice 'Call % de % corrigé : entrée à % $ le % (bitcoin à % $).',
    call.symbol, membre, prix, le_jour, btc;
exception
  when no_data_found then
    raise exception 'Aucun call ouvert de % sur % : publiez-le d''abord dans l''app.', membre, symbole;
  when too_many_rows then
    raise exception 'Plusieurs calls ouverts de % sur % : lequel ? Demandez de l''aide.', membre, symbole;
end
$$;
