# Fonctions Edge

## `refresh-prices`

Met à jour `tickers.current_price`. C'est le **seul écrivain légitime** de cette
colonne : le déclencheur `tickers_freeze` interdit au membre de modifier quoi
que ce soit d'autre sur un call publié, et cette fonction n'écrit rien d'autre
non plus.

### Deux fournisseurs, un critère

| Classe d'actif | Fournisseur | Colonne |
|---|---|---|
| `BTC`, `ALT`, `DEGEN` | CoinGecko | `coingecko_id` |
| `ACTION`, `ETF` | **Yahoo Finance** | `yahoo_symbol` |

Yahoo est la source utilisée par le dashboard JCGI (`app.jsx`, `fetchYahoo`) :
`query1.finance.yahoo.com/v8/finance/chart/{symbole}`, prix de séance
`meta.regularMarketPrice` avec repli sur la dernière clôture non nulle.

La contrainte `tickers_one_quote_source` interdit qu'une ligne porte les deux :
un actif a un fournisseur, pas deux rafraîchisseurs qui se disputent sa ligne.

Les deux fournisseurs sont interrogés **en parallèle et indépendamment**. Une
panne CoinGecko ne prive pas les actions de leur cours, et réciproquement : la
fonction ne renvoie 502 que si *tout* a échoué.

### Devises

Le club compte en dollars ; Yahoo cote dans la devise de la place. `meta.currency`
est lu à chaque cotation, et les taux manquants sont demandés à Yahoo lui-même
(`EURUSD=X`). Deux pièges traités :

- **Londres cote en pence** (`GBp`), pas en livres. L'oublier multiplie une
  position par cent.
- **Un taux manquant ne donne jamais un prix approximatif** : la ligne est
  laissée telle quelle et signalée dans `problems`.

Le dashboard JCGI déclare un `EUR_YAHOO_TICKERS_SET` codé en dur — mais ne
l'utilise nulle part. S'appuyer sur `meta.currency` évite d'avoir à tenir cette
liste à jour.

### Déployer

Depuis `mobile/` — la CLI cherche `supabase/functions/<nom>/index.ts` sous le
dossier courant — et **une commande à la fois** : le sélecteur de projet est
interactif, et coller plusieurs lignes d'un coup lui fait avaler les suivantes
comme des frappes clavier.

`--project-ref` évite ce sélecteur. L'identifiant est celui de l'URL du projet.

```bash
cd "$(git rev-parse --show-toplevel)/mobile"

npx supabase functions deploy refresh-prices --project-ref <ref>
npx supabase functions deploy quote --project-ref <ref>
```

Puis le secret d'appel. **Générez-le en l'affichant** : la planification
ci-dessous en a besoin en clair, et `supabase secrets list` ne montre qu'une
empreinte.

```bash
REFRESH_SECRET="$(openssl rand -hex 24)"; echo "$REFRESH_SECRET"
npx supabase secrets set REFRESH_SECRET="$REFRESH_SECRET" --project-ref <ref>

# Clé CoinGecko — facultative, elle relève seulement le quota
npx supabase secrets set COINGECKO_API_KEY=... --project-ref <ref>
```

La valeur passe par l'historique du shell et reste dans le défilement du
terminal. Pour un club de sept c'est acceptable ; si ça ne vous va pas,
régénérez-la après avoir posé la planification.

`REFRESH_SECRET` n'est pas une option. Sans lui, `refresh-prices` serait un
point d'entrée qui écrit en base et appelle deux API externes, joignable avec
la clé anon — qui est publiée dans le bundle de l'app. La fonction répond donc
500 tant qu'il n'est pas posé : une configuration inachevée n'est pas une
permission.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés par la plateforme.
La clé de service ne sort jamais du serveur : elle contourne RLS, c'est
précisément pourquoi elle n'a rien à faire dans l'application mobile.

### Planifier

Toutes les quinze minutes, via `pg_cron` et `pg_net` :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-prices',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/refresh-prices',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || current_setting('app.service_role_key', true),
      'x-refresh-secret', current_setting('app.refresh_secret', true)
    )
  );
  $$
);
```

Les deux secrets se posent une fois, dans le **SQL Editor**, avec la valeur
affichée plus haut :

```sql
alter database postgres set app.refresh_secret  = 'la-valeur-de-REFRESH_SECRET';
alter database postgres set app.service_role_key = 'la-clé-service-role';
```

Ne pas les écrire en clair dans la définition du cron : `cron.job` est lisible
par tout rôle ayant accès au schéma.

### Ce qu'elle ne fait pas

- **Inventer un prix.** Un actif absent des réponses garde le sien. Mieux vaut
  un cours daté par `price_updated_at` qu'un cours effacé.
- **Réveiller les clients pour rien.** Un prix inchangé n'est pas réécrit —
  chaque `UPDATE` sur `tickers` est diffusé en Realtime à tous les membres
  connectés. Un second passage sans mouvement de marché écrit zéro ligne.
- **Confondre les deux fournisseurs.** Les tables de prix restent séparées :
  `ETH` peut désigner le jeton chez CoinGecko et un ETF chez Yahoo, et les
  fusionner donnerait un prix faux sans rien signaler.

### Réponse

```json
{
  "updated": 10,
  "skipped": 0,
  "failures": [],
  "problems": [],
  "assets": { "coingecko": 4, "yahoo": 4 },
  "at": "2026-09-14T…"
}
```

`skipped` compte les actifs absents des réponses **et** ceux dont le prix n'a
pas bougé : les deux cas sont normaux. `problems` porte les pannes partielles —
fournisseur injoignable, taux de change manquant — sans faire échouer le reste.

### Symboles Yahoo

`yahoo_symbol` ne porte pas le « $ » du club, et suffixe les places non
américaines : `MSTR`, mais `AI.PA` pour Paris et `AVIO.MI` pour Milan. La
migration a repris les lignes existantes en retirant simplement le « $ » —
**les titres non américains sont donc à corriger à la main** :

```sql
update public.tickers set yahoo_symbol = 'AI.PA' where symbol = '$AI';
```

`src/lib/quotes.ts` porte la table des suffixes et la conversion, côté app.
