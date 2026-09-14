# Étape 2 — Schéma Supabase

| Fichier | Contenu |
|---|---|
| `migrations/20260905120000_init.sql` | Tables, contraintes, déclencheurs, RLS, Realtime |
| `seed.sql` | Jeu de `DONNEES_FICTIVES.md`, UUID identiques à `src/mocks` |
| `tests/schema_test.sql` | Douze assertions sur les règles métier |

## Les sept tables

Le prompt initial en demandait quatre. Trois s'y ajoutent parce que le design
les exige : sans `profiles`, un membre n'a ni couleur ni initiales stables ;
sans `event_attendees`, pas de `5 / 7 présents` ; sans `ticker_votes`, pas de
bull/bear.

```
profiles ─┬─< events ─< potluck_items
          ├─< event_attendees
          ├─< tickers ─< ticker_votes
          └─< predictions
```

## Deux principes, et leurs conséquences

**1. « Membre » = avoir une ligne dans `profiles`.** La fonction
`public.is_member()` le dit une fois, et toutes les politiques de lecture s'y
réfèrent. Il n'existe aucun accès anonyme.

**2. Lecture commune, écriture personnelle.** Tout le monde voit tout ; on
n'écrit que ses propres lignes. Les deux exceptions sont explicites.

### L'exception qui compte : la course du potluck

Deux membres tapent « Glaçons » en même temps. C'est la soirée normale, pas un
cas limite — et ça se règle dans la politique, pas dans le client :

```sql
create policy potluck_claim on public.potluck_items
  for update to authenticated
  using      (public.is_member()
              and (assigned_user_id is null or assigned_user_id = auth.uid()))
  with check (assigned_user_id is null or assigned_user_id = auth.uid());
```

- `using` — on ne peut toucher qu'une ligne **libre** ou **la sienne**. Une ligne
  prise par un autre est simplement invisible à l'`UPDATE`.
- `with check` — après écriture, la ligne est libre ou à soi. Impossible
  d'assigner un besoin à quelqu'un d'autre.

Le premier `UPDATE` passe ; le second n'affecte **zéro ligne** — sans erreur.
C'est ce zéro que `PotluckList` interprète comme « quelqu'un a été plus
rapide », et qui déclenche son rollback. Le client n'arbitre rien.

### Ce que les déclencheurs garantissent

| Déclencheur | Règle |
|---|---|
| `tickers_freeze` | « Non modifiable après publication » : seul `current_price` évolue |
| `predictions_seal` | Après `locked_at`, le tracé ne change plus et le verrou ne se défait pas ; l'empreinte `HASH 8F2A` est calculée au scellement |
| `*_touch` | `updated_at` |

`tickers.performance_percentage` est une **colonne générée** : elle ne peut pas
diverger du couple (`entry_price`, `current_price`). La perf **vs ₿** reste
calculée côté client — elle dépend du cours BTC courant, qui n'est pas en base.

### Validation de forme d'un tracé

`path_data` doit être un tableau de couples `[x, y]` numériques, dans les bornes
du repère 360 × 285. Un `CHECK` n'acceptant pas de sous-requête, la validation
passe par `public.is_valid_path(jsonb)`, déclarée `immutable`.

## Realtime

Quatre tables publiées, et `replica identity full` sur les trois qui sont
observées en `UPDATE` : sans elle, un `old` partiel empêcherait le client de
savoir **qui** libère une ligne de potluck.

## Écart assumé avec le prompt initial

Le prompt demandait `Hall of Fame > +20 %` et `Rekt < -20 %`. Le design validé
retient un seuil plus exigeant et un autre référentiel :

- **Hall of Fame : ≥ +50 %, mesuré vs ₿** — le libellé est à l'écran ;
- **Rekt Board : ≤ −20 %, en dollars**.

Les deux seuils sont exportés depuis `src/lib/performance.ts` et lus par les
libellés, pour que texte et logique ne puissent pas diverger. Changer un seuil
change l'écran.
