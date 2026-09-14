# Fonctions Edge

## `refresh-prices`

Met à jour `tickers.current_price` depuis CoinGecko. C'est le **seul écrivain
légitime** de cette colonne : le déclencheur `tickers_freeze` interdit au membre
de modifier quoi que ce soit d'autre sur un call publié, et cette fonction
n'écrit rien d'autre non plus.

### Déployer

```bash
npx supabase functions deploy refresh-prices

# Clé CoinGecko (facultative) et secret d'appel (recommandé)
npx supabase secrets set COINGECKO_API_KEY=...
npx supabase secrets set REFRESH_SECRET="$(openssl rand -hex 24)"
```

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

Les deux secrets se posent une fois avec
`alter database postgres set app.refresh_secret = '...'`. Ne pas les écrire en
clair dans la définition du cron : `cron.job` est lisible par tout rôle ayant
accès au schéma.

### Ce qu'elle ne fait pas

- **Les actions et ETF.** `$MSTR`, `$NVDA`, `$IBIT`, `$GME` ne sont pas cotés
  chez CoinGecko : ils n'ont pas de `coingecko_id` et sont simplement ignorés.
  C'est le point qui attend un arbitrage — second fournisseur (Finnhub, Alpha
  Vantage, Twelve Data) ou saisie manuelle par le membre.
- **Inventer un prix.** Un actif absent de la réponse garde le sien. Un échec
  CoinGecko laisse toute la table en place et renvoie 502 : mieux vaut un cours
  daté par `price_updated_at` qu'un cours effacé.
- **Réveiller les clients pour rien.** Un prix inchangé n'est pas réécrit —
  chaque `UPDATE` sur `tickers` est diffusé en Realtime à tous les membres
  connectés.

### Réponse

```json
{ "updated": 3, "skipped": 4, "failures": [], "assets": 5, "at": "2026-09-14T…" }
```

`skipped` compte les actifs absents de la réponse **et** ceux dont le prix n'a
pas bougé : les deux cas sont normaux.
