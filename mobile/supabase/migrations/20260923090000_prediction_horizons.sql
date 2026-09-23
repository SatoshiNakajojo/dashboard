-- ----------------------------------------------------------------------------
-- L'Oracle à plusieurs horizons
--
-- L'Oracle ne connaissait qu'une saison de 90 jours, une prédiction par membre,
-- et tout se verrouillait ensemble. Le club parie désormais sur une semaine
-- **et** sur dix ans, en parallèle, chaque pari suivant son propre calendrier.
--
-- Trois changements, dans cet ordre, et l'ordre compte :
--
--   1. un tracé se stocke en **prix** — `[jour, dollars]` — et non plus en
--      coordonnées de toile. Sur dix ans, la bande 80 k$ – 200 k$ ne tient
--      plus, et deux membres ne pouvaient superposer leurs courbes que parce
--      qu'ils partageaient ce repère figé ;
--   2. un pari porte son horizon et son calendrier ;
--   3. **le serveur** fixe ce calendrier. Avant, le verrou n'était qu'un compte
--      à rebours affiché par l'app : `locked_at` n'était écrit par personne, et
--      rien n'empêchait de redessiner après l'heure. Un jeu de paris dont le
--      verrou dépend de la bonne foi du client n'a pas de verrou.
--
-- Rejouable : chaque étape vérifie avant d'agir.
-- ----------------------------------------------------------------------------

-- --- 1. Les colonnes du calendrier ------------------------------------------

alter table public.predictions add column if not exists horizon     text;
alter table public.predictions add column if not exists opened_at   timestamptz;
alter table public.predictions add column if not exists resolves_at timestamptz;

-- --- 2. Les durées, côté serveur --------------------------------------------
--
-- Miroir de `src/lib/horizons.ts`. Les deux tables doivent dire la même chose ;
-- `scripts/__tests__/horizons-sql.test.mjs` les compare et échoue sinon. La
-- duplication est voulue : le calendrier d'un pari est une frontière de
-- sécurité, il doit vivre là où le client ne peut pas le réécrire.

create or replace function public.horizon_duration(h text)
returns interval
language sql
immutable
as $$
  select case h
    when '1w'  then interval '7 days'
    when '3m'  then interval '90 days'
    when '6m'  then interval '182 days'
    when '12m' then interval '365 days'
    when '5y'  then interval '1825 days'
    when '10y' then interval '3650 days'
  end;
$$;

create or replace function public.horizon_editing(h text)
returns interval
language sql
immutable
as $$
  select case h
    when '1w'  then interval '24 hours'
    when '3m'  then interval '72 hours'
    when '6m'  then interval '120 hours'
    when '12m' then interval '168 hours'
    when '5y'  then interval '336 hours'
    when '10y' then interval '336 hours'
  end;
$$;

-- --- 3. Lever ce qui empêcherait la conversion -------------------------------
--
-- L'ancien déclencheur interdit de modifier un tracé verrouillé : laissé en
-- place, la conversion lèverait une exception sur la première prédiction
-- scellée. Il est remplacé plus bas, pas seulement suspendu.

drop trigger if exists predictions_seal_trigger on public.predictions;

-- L'ancienne contrainte exige des coordonnées de toile (0–360, 0–285) : elle
-- rejetterait chaque tracé converti en prix.
alter table public.predictions drop constraint if exists predictions_path_shape;

-- --- 4. Les prédictions existantes deviennent des paris à trois mois ---------
--
-- Elles appartenaient à une saison de 90 jours : c'est exactement l'horizon
-- « 3m ». Leur jour zéro était le début de la saison, pas leur date de
-- création — la saison `2026-S1` commence le 18 septembre 2026 à 13 h UTC,
-- minuit à Nouméa, et chaque saison suivante 90 jours plus tard.
--
-- Conversion toile → prix avec l'ancien repère figé :
--   jour = (x − 34) / 320 × 90
--   prix = 200 000 − (y − 10) / 230 × 120 000

update public.predictions p
set
  horizon = '3m',
  opened_at = coalesce(
    (
      select timestamptz '2026-09-18 13:00:00+00'
             + ((m[1])::int - 1) * interval '90 days'
      from regexp_match(p.season, '-S(\d+)$') as m
      where m is not null
    ),
    p.created_at
  ),
  path_data = coalesce(
    (
      select jsonb_agg(
               jsonb_build_array(
                 round((((pt ->> 0)::numeric - 34) / 320 * 90)::numeric, 3),
                 round((200000 - ((pt ->> 1)::numeric - 10) / 230 * 120000)::numeric, 2)
               )
               order by ord
             )
      from jsonb_array_elements(p.path_data) with ordinality as e(pt, ord)
    ),
    '[]'::jsonb
  )
where p.horizon is null;

-- Second passage, séparé du premier : dans un même `update`, `path_data` lu par
-- une autre colonne vaut encore l'ancienne valeur. L'empreinte doit porter sur
-- le tracé **converti** — et être posée ici, car un pari hérité déjà verrouillé
-- ne sera plus jamais réécrit : il n'en recevrait jamais.
update public.predictions
set
  locked_at   = coalesce(locked_at, opened_at + public.horizon_editing(horizon)),
  resolves_at = opened_at + public.horizon_duration(horizon),
  hash        = upper(substring(md5(path_data::text) from 1 for 4))
where resolves_at is null;

alter table public.predictions alter column horizon     set not null;
alter table public.predictions alter column opened_at   set not null;
alter table public.predictions alter column locked_at   set not null;
alter table public.predictions alter column resolves_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'predictions_horizon_check') then
    alter table public.predictions
      add constraint predictions_horizon_check
      check (horizon in ('1w', '3m', '6m', '12m', '5y', '10y'));
  end if;
end
$$;

-- --- 5. La nouvelle forme d'un tracé ----------------------------------------
--
-- Des couples [jour, prix] : un jour entre 0 et un peu plus de dix ans, un prix
-- strictement positif. Au plus 400 points — un tracé au doigt en produit
-- quelques dizaines, et une limite empêche d'envoyer un tableau de 10 Mo par
-- PostgREST.

create or replace function public.is_valid_price_path(path jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(path) = 'array'
     and jsonb_array_length(path) <= 400
     and not exists (
       select 1
       from jsonb_array_elements(path) as point
       where coalesce(jsonb_typeof(point), 'absent') <> 'array'
          or jsonb_array_length(point) <> 2
          or coalesce(jsonb_typeof(point -> 0), 'absent') <> 'number'
          or coalesce(jsonb_typeof(point -> 1), 'absent') <> 'number'
          or (point ->> 0)::numeric not between 0 and 3700
          or (point ->> 1)::numeric <= 0
          or (point ->> 1)::numeric > 1e10
     );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'predictions_price_path_shape') then
    alter table public.predictions
      add constraint predictions_price_path_shape check (public.is_valid_price_path(path_data));
  end if;
end
$$;

-- --- 6. Plusieurs paris par membre ------------------------------------------

alter table public.predictions drop constraint if exists predictions_user_id_season_key;
alter table public.predictions alter column season drop not null;

create index if not exists predictions_horizon_idx
  on public.predictions (horizon, resolves_at desc);
create index if not exists predictions_user_horizon_idx
  on public.predictions (user_id, horizon, resolves_at desc);

-- --- 7. Le gardien : le serveur fixe le calendrier --------------------------

create or replace function public.predictions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.horizon_duration(new.horizon) is null then
      raise exception 'Horizon inconnu : %', new.horizon using errcode = 'check_violation';
    end if;

    -- Le calendrier vient d'ici, jamais de l'app. Ce que le client envoie dans
    -- ces colonnes est ignoré — sans quoi un membre pourrait s'offrir une
    -- fenêtre de révision plus longue que celle des autres.
    new.opened_at   := now();
    new.locked_at   := now() + public.horizon_editing(new.horizon);
    new.resolves_at := now() + public.horizon_duration(new.horizon);

    -- Un seul pari en cours par horizon et par membre. Le verrou consultatif
    -- sérialise deux insertions simultanées, qui passeraient sinon toutes les
    -- deux le test ci-dessous.
    perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.horizon));
    if exists (
      select 1 from public.predictions
      where user_id = new.user_id
        and horizon = new.horizon
        and resolves_at > now()
    ) then
      raise exception 'Un pari % est déjà en cours', new.horizon
        using errcode = 'unique_violation';
    end if;

  elsif tg_op = 'UPDATE' then
    if new.user_id     is distinct from old.user_id
       or new.horizon     is distinct from old.horizon
       or new.opened_at   is distinct from old.opened_at
       or new.locked_at   is distinct from old.locked_at
       or new.resolves_at is distinct from old.resolves_at then
      raise exception 'Le calendrier d''un pari ne se modifie pas'
        using errcode = 'check_violation';
    end if;

    if old.locked_at <= now() and new.path_data is distinct from old.path_data then
      raise exception 'Pari verrouillé : le tracé ne peut plus changer'
        using errcode = 'check_violation';
    end if;
  end if;

  -- L'empreinte suit le tracé. Une fois verrouillé, le tracé ne bouge plus, donc
  -- l'empreinte non plus : pas besoin d'un instant de « scellement » explicite,
  -- que plus personne n'écrirait.
  new.hash := upper(substring(md5(new.path_data::text) from 1 for 4));
  return new;
end;
$$;

drop trigger if exists predictions_guard_trigger on public.predictions;
create trigger predictions_guard_trigger
  before insert or update on public.predictions
  for each row execute function public.predictions_guard();

-- L'ancien sceau est remplacé par le gardien.
drop function if exists public.predictions_seal();

-- --- 8. Retirer son pari, tant qu'il n'est pas verrouillé -------------------
--
-- Un seul pari en cours par horizon : sans moyen de le retirer, un tracé
-- déposé par erreur bloquerait l'horizon jusqu'à sa résolution — dix ans pour
-- le plus long. Pendant la fenêtre de révision, on peut donc le supprimer ;
-- après, il appartient à l'historique du club et ne se retire plus.

drop policy if exists predictions_delete_own on public.predictions;
create policy predictions_delete_own on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and locked_at > now());

-- --- 9. Le temps réel -------------------------------------------------------
--
-- Un tracé déposé par un membre doit apparaître chez les six autres sans
-- recharger, comme les soirées et les présences.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'predictions'
     ) then
    alter publication supabase_realtime add table public.predictions;
  end if;
end
$$;

alter table public.predictions replica identity full;
