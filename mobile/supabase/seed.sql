-- ============================================================================
-- Jeu de seed — reprend DONNEES_FICTIVES.md à l'identique.
--
-- Exécuté par `supabase db reset` (rôle superutilisateur), d'où l'insertion
-- directe dans `auth.users` : ces comptes n'ont pas de mot de passe et servent
-- uniquement au développement local.
--
-- Les UUID sont ceux de `src/mocks/members.ts` : basculer mock ↔ serveur ne
-- change aucun identifiant, donc aucune vue.
-- ============================================================================

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('11111111-1111-4111-8111-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'john@satoshisocial.club',  now(), now()),
  ('11111111-1111-4111-8111-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex@satoshisocial.club',  now(), now()),
  ('11111111-1111-4111-8111-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marco@satoshisocial.club', now(), now()),
  ('11111111-1111-4111-8111-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sofia@satoshisocial.club', now(), now()),
  ('11111111-1111-4111-8111-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rayan@satoshisocial.club', now(), now()),
  ('11111111-1111-4111-8111-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lea@satoshisocial.club',   now(), now()),
  ('11111111-1111-4111-8111-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'toi@satoshisocial.club',   now(), now())
on conflict (id) do nothing;

-- --- Membres ----------------------------------------------------------------

insert into public.profiles (id, display_name, initials, color) values
  ('11111111-1111-4111-8111-000000000001', 'John',  'JD', '#E8A33D'),
  ('11111111-1111-4111-8111-000000000002', 'Alex',  'AX', '#6E9A78'),
  ('11111111-1111-4111-8111-000000000003', 'Marco', 'MC', '#8C7BA8'),
  ('11111111-1111-4111-8111-000000000004', 'Sofia', 'SF', '#B3574F'),
  ('11111111-1111-4111-8111-000000000005', 'Rayan', 'RY', '#5B8A9A'),
  ('11111111-1111-4111-8111-000000000006', 'Léa',   'LE', '#C9A227'),
  ('11111111-1111-4111-8111-000000000007', 'Toi',   'TU', '#F2EBDD')
on conflict (id) do update
  set display_name = excluded.display_name,
      initials     = excluded.initials,
      color        = excluded.color;

-- --- Crypto Nights ----------------------------------------------------------

insert into public.events (id, starts_at, theme, location, tag, created_by) values
  ('22222222-2222-4222-8222-000000000001', '2026-09-18 20:00:00+02', 'Pastaga & Wine Tasting',    'Penthouse — Marco', 'Dégustation', '11111111-1111-4111-8111-000000000003'),
  ('22222222-2222-4222-8222-000000000002', '2026-10-03 19:30:00+02', 'Grillades & Halving Talk',  'Rooftop — Alex',    'Barbecue',    '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000003', '2026-10-22 22:00:00+02', 'Night Trading Session',     'Loft — Sofia',      'Séance live', '11111111-1111-4111-8111-000000000004')
on conflict (id) do nothing;

insert into public.event_attendees (event_id, user_id) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000003'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000004'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000006'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000005'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000006'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000004'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000003'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000005'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002')
on conflict do nothing;

-- --- Qui amène quoi ---------------------------------------------------------

insert into public.potluck_items (id, event_id, item_name, assigned_user_id, position) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 'Viande (2 kg)',       '11111111-1111-4111-8111-000000000001', 1),
  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000001', 'Glaçons',             null,                                   2),
  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000001', 'Vins — 3 bouteilles', '11111111-1111-4111-8111-000000000002', 3),
  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000001', 'Pastaga & olives',    '11111111-1111-4111-8111-000000000003', 4),
  ('33333333-3333-4333-8333-000000000005', '22222222-2222-4222-8222-000000000001', 'Fromages',            null,                                   5),
  ('33333333-3333-4333-8333-000000000006', '22222222-2222-4222-8222-000000000001', 'Dessert',             '11111111-1111-4111-8111-000000000004', 6),

  ('33333333-3333-4333-8333-000000000007', '22222222-2222-4222-8222-000000000002', 'Charbon',             '11111111-1111-4111-8111-000000000005', 1),
  ('33333333-3333-4333-8333-000000000008', '22222222-2222-4222-8222-000000000002', 'Viande',              null,                                   2),
  ('33333333-3333-4333-8333-000000000009', '22222222-2222-4222-8222-000000000002', 'Bières',              null,                                   3),
  ('33333333-3333-4333-8333-000000000010', '22222222-2222-4222-8222-000000000002', 'Salades',             '11111111-1111-4111-8111-000000000006', 4),

  ('33333333-3333-4333-8333-000000000011', '22222222-2222-4222-8222-000000000003', 'Sushis',              '11111111-1111-4111-8111-000000000004', 1),
  ('33333333-3333-4333-8333-000000000012', '22222222-2222-4222-8222-000000000003', 'Whisky',              null,                                   2),
  ('33333333-3333-4333-8333-000000000013', '22222222-2222-4222-8222-000000000003', 'Café (litres)',       '11111111-1111-4111-8111-000000000001', 3)
on conflict (id) do nothing;

-- --- Le Bag -----------------------------------------------------------------
--
-- `entry_btc_price` est calibré pour que la perf vs ₿ affichée retombe sur les
-- chiffres du design à un spot BTC de 120 911 $.

insert into public.tickers
  (id, user_id, symbol, asset_class, entry_price, current_price, entry_btc_price, size_usd, thesis, coingecko_id, created_at)
values
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000006', '$BTC',  'BTC',    103200,   118576.80, 103200.00, 12500, 'Le seul actif que je garde dix ans. DCA hebdomadaire, jamais de levier, cold storage.', 'bitcoin',  now() - interval '2 hours'),
  ('44444444-4444-4444-8444-000000000002', '11111111-1111-4111-8111-000000000001', '$MSTR', 'ACTION',    412,     463.088, 104882.53,  9000, 'Levier propre sur BTC via le bilan. Tant que la trésorerie achète, je tiens.',          null,       now() - interval '1 day'),
  ('44444444-4444-4444-8444-000000000003', '11111111-1111-4111-8111-000000000002', '$ETH',  'ALT',      3940,    4798.920, 106120.53,  4200, 'Le seul alt que je garde. Staking et L2 ; je sors si le ratio ETH/BTC casse.',          'ethereum', now() - interval '2 days'),
  ('44444444-4444-4444-8444-000000000004', '11111111-1111-4111-8111-000000000005', '$IBIT', 'ETF',      58.30,    64.8296, 104709.87,  6800, 'Une poche BTC dans l’enveloppe fiscale. Pratique, mais ce ne sont pas mes clés.',       null,       now() - interval '3 days'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000003', '$WIF',  'DEGEN',     1.84,     0.71760, 104169.00,  1100, 'Aucune thèse. Pur degen. Assumé jusqu’au bout.',                                       'dogwifcoin', now() - interval '5 days')
on conflict (id) do nothing;

-- --- Positions closes des saisons précédentes -------------------------------
--
-- Ce ne sont pas des lignes de classement à part : les deux tableaux sortent de
-- `splitLeaderboards()` appliqué aux mêmes `tickers`. Sans ces positions, le
-- Hall of Fame serait vide — aucun call en cours n'atteint +50 %.
--
-- `$WIF` n'y figure pas : le -61 % du Rekt Board est le call du fil ci-dessus.

insert into public.tickers
  (id, user_id, symbol, asset_class, entry_price, current_price, entry_btc_price, size_usd, thesis, coingecko_id, created_at)
values
  ('44444444-4444-4444-8444-000000000101', '11111111-1111-4111-8111-000000000006', '$BTC', 'BTC', 61000, 119560.00000, 61000.00, null, 'Le seul actif que je garde dix ans. DCA hebdomadaire, jamais de levier, cold storage.', 'bitcoin', now() - interval '420 days'),
  ('44444444-4444-4444-8444-000000000102', '11111111-1111-4111-8111-000000000002', '$NVDA', 'ACTION', 88.4, 153.81600, 91030.70, null, 'Les pelles de la ruée vers l’or. Je sors quand les hyperscalers arrêtent de commander.', null, now() - interval '300 days'),
  ('44444444-4444-4444-8444-000000000103', '11111111-1111-4111-8111-000000000001', '$MSTR', 'ACTION', 252, 410.76000, 88272.45, null, 'Levier propre sur BTC via le bilan. Tant que la trésorerie achète, je tiens.', null, now() - interval '280 days'),
  ('44444444-4444-4444-8444-000000000104', '11111111-1111-4111-8111-000000000005', '$ETHW', 'ALT', 4.2, 2.18400, 111610.15, null, 'La fork que personne n’a gardée. J’ai oublié de vendre.', 'ethereum-pow-iou', now() - interval '260 days'),
  ('44444444-4444-4444-8444-000000000105', '11111111-1111-4111-8111-000000000004', '$GME', 'ACTION', 28.9, 22.54200, 103859.45, null, 'Nostalgie 2021. Ce n’était pas un investissement, c’était un souvenir.', null, now() - interval '190 days')
on conflict (id) do nothing;

insert into public.ticker_votes (ticker_id, user_id, side) values
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000001', 'bull'),
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000002', 'bull'),
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000003', 'bull'),
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000004', 'bull'),
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000005', 'bull'),
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000007', 'bull'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000001', 'bear'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000002', 'bear'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000004', 'bear'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000005', 'bear'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000006', 'bear'),
  ('44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000007', 'bear')
on conflict do nothing;
