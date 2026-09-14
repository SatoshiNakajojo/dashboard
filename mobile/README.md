# Satoshi Social Club

Application mobile privée d'un club de sept investisseurs Bitcoin.
React Native (Expo SDK 57) · TypeScript · NativeWind v4 · Supabase · Skia.

Trois onglets, trois mécaniques :

| Onglet | Ce qu'il fait |
|---|---|
| **Nights** | Agenda des Crypto Nights et checklist potluck partagée en temps réel |
| **Le Bag** | Fil des calls d'investissement, Hall of Fame et Rekt Board |
| **Oracle** | Prédiction BTC à 90 jours tracée au doigt, scellée par un time-lock |

Registre visuel : club privé, feutré. L'orange Bitcoin y est un **or**, en
accent rare, sur fond encre chaude. Référence : `Bitcoin Club v2.dc.html`.

---

## Démarrer

```bash
npm install
npm start
```

**Aucune configuration n'est nécessaire pour voir l'app tourner.** Sans variables
d'environnement Supabase, tout s'exécute sur les mocks de `src/mocks`, repris
tels quels de `DONNEES_FICTIVES.md` : les trois écrans sont navigables, le
potluck s'assigne et se libère, l'Oracle se trace.

Commandes exactes de mise en place, y compris les pièges : **[docs/SETUP.md](docs/SETUP.md)**.
Schéma et politiques RLS : **[supabase/README.md](supabase/README.md)**.

---

## Comment c'est organisé

```
app/                    routes expo-router (tab bar entièrement personnalisée)
  (auth)/               porte du club — code à usage unique, amorçage du profil
src/
  components/           composants de présentation — ne connaissent aucun backend
  features/<domaine>/   source de données + hook métier
  hooks/                session, annuaire du club, marché BTC
  lib/                  géométrie du graphique, formatage FR, HTTP, cache, cotations, règles de perf
  mocks/                fixtures du design, mêmes UUID que le seed Supabase
  theme/                jetons — miroir TypeScript de tailwind.config.js
supabase/               migrations, seed, tests de schéma, fonction Edge
```

### La règle qui structure tout

**Un composant ne sait jamais s'il parle à Supabase ou à un mock.**

`supabase` vaut `null` tant que l'environnement n'est pas configuré, et chaque
source de données a deux implémentations derrière une même interface. C'est ce
qui permet de livrer l'écran avant le backend sans écrire une ligne jetable —
et de basculer d'un monde à l'autre en posant deux variables.

Les UUID des mocks sont ceux du seed : basculer ne change aucun identifiant.

---

## Les deux pièces qui portent le produit

### `PotluckList` — temps réel optimiste

Trois états coexistent, et c'est délibéré : la vérité serveur poussée par
Realtime, les écritures en vol appliquées par-dessus, et le rendu où l'écriture
en vol gagne tant qu'elle existe.

Le rollback n'est pas un cas d'erreur exotique. Deux membres qui tapent
« Glaçons » en même temps, c'est la soirée normale : la politique RLS tranche
(le premier `UPDATE` gagne), le second reçoit **zéro ligne affectée**, et le
perdant voit sa pastille revenir avec une ligne d'explication. Aucune
interruption, aucune boîte de dialogue.

### `OracleGraph` — Skia, time-lock, superposition CoinGecko

Deux invariants :

1. **Un seul facteur d'échelle.** Le repère logique 360 × 285 est peint tel quel
   dans un `Group` mis à l'échelle. Rien ne re-dérive une géométrie en pixels,
   sinon `path_data` deviendrait dépendant du téléphone et deux membres ne
   pourraient plus superposer leurs courbes.
2. **Le verrou est une porte, pas un style.** `locked` coupe le geste à la
   source. Trois garde-fous indépendants : le geste désactivé, le `setMyPoints`
   qui refuse, et le déclencheur `predictions_seal` en base.

Le tracé est monotone en X — un point n'est retenu que s'il dépasse le précédent
de 4 unités — et borné dans le repère.

---

## Ce qui a été vérifié

- `npm run typecheck`, `npm run lint`, `npm test` — propres (57 tests).
- **Règles pures** : bornes et inversibilité du repère, monotonie du tracé,
  écart à la courbe réelle, espaces insécables du formatage français, perf vs ₿
  comme ratio et non soustraction, seuils et tri des deux classements.
- **Fidélité des fixtures** : les cinq cartes du fil et les six lignes des
  classements sont *calculées* et comparées à `DONNEES_FICTIVES.md`. Retoucher
  un prix d'entrée fait échouer un test, pas une relecture de capture d'écran.
- **Amorçage d'un profil** : initiales (`Jean-Marc Dupont` → `JD`, pas `JM`) et
  unicité des couleurs sur un club de sept.
- **Plan de rafraîchissement** : on n'efface jamais un prix connu, on ne
  réécrit jamais un prix inchangé.
- **Schéma** : migration appliquée à un PostgreSQL 16 réel, réexécutée pour
  l'idempotence, puis `supabase/tests/schema_test.sql` — 12 assertions passent.
  Le seed reproduit exactement les pourcentages du design (`+14,9 %`, `+12,4 %`,
  `+21,8 %`, `+11,2 %`, `-61,0 %`) et les perfs vs ₿ (`-2,5 %`, `+6,9 %`,
  `-3,7 %`, `-66,4 %`).
- **Application** : build web exportée et pilotée dans Chromium. Prise d'une
  ligne de potluck libre (2 libres → 1, compteur `4 / 6` → `5 / 6`), libération
  au re-tap, ligne d'un autre membre inerte. Tracé de l'Oracle au doigt,
  verrouillage, passage en lecture seule, `FIGÉ · HASH 8F2A`, écarts colorés.
  Publication d'un `$SOL` (10 cartes → 11). Avec Supabase configuré : la garde
  mène à la porte, l'adresse invalide est refusée, la panne réseau se lit
  « Connexion indisponible » et non en trace technique.

---

## Écarts assumés avec le dossier de design

Chacun est signalé, aucun n'est improvisé.

**Seuils de classement.** Le prompt initial disait `> +20 %` / `< -20 %` ; le
design validé dit `≥ +50 % vs ₿` / `≤ -20 %` en dollars. Le design l'emporte —
son libellé est à l'écran. Les seuils sont exportés depuis
`src/lib/performance.ts` et lus par les libellés : texte et logique ne peuvent
pas diverger.

**Cibles des prédictions.** `DONNEES_FICTIVES.md` §Oracle annonce John 164 k$,
Alex 109 k$, Marco 186 k$. Le générateur donné juste en dessous — et le
prototype qui l'exécute — produisent 163 k$, 97 k$, 183 k$. Le prototype étant
la source de vérité déclarée, c'est lui qui a été suivi.

**Écarts affichés après verrouillage.** Le document donne des valeurs fixes
(2,1 %, 3,4 %…). Elles sont ici **calculées** : écart absolu moyen entre la
courbe du membre et la courbe réelle, sur la plage commune. Les chiffres
diffèrent donc du document, et changeront encore avec les vraies données
CoinGecko. C'est le comportement de production décrit au README §7.3.

**Votes de `$WIF`.** La fixture affiche `BULL 1` et `BEAR 7`, soit huit voix
dans un club de sept. Les mocks reprennent les totaux du design ; le seed
Supabase, lui, reste à un vote par membre.

**Étiquettes d'axes.** Rendues en `<Text>` React Native par-dessus la toile,
pas en `SkText` : cela évite de charger les polices une seconde fois dans Skia
et garde une typographie strictement identique au reste de l'app. Elles sont
positionnées dans le repère logique puis mises à l'échelle — donc alignées au
pixel près sur la grille peinte.

**Dégradés radiaux** (le ₿ du bandeau, le FAB) : approximés par un
`LinearGradient` diagonal, comme l'autorise le README §8.3.

**Une suppression ESLint**, dans `OracleGraph.tsx`. La règle `react-hooks/refs`
signale la composition du geste au rendu ; l'analyse est conservatrice — un
handler de geste ne s'exécute jamais pendant le rendu. L'alternative
(recomposer le geste à chaque point capturé) interromprait le tracé en cours.
La suppression est ciblée sur deux lignes et justifiée sur place.

---

## Deux fournisseurs de cours

| Classe d'actif | Fournisseur |
|---|---|
| `BTC`, `ALT`, `DEGEN` | CoinGecko |
| `ACTION`, `ETF` | **Yahoo Finance** — la source du dashboard JCGI |

Le routage est une fonction pure (`src/lib/quotes.ts`), pas une suite de `if`
répartis dans les appelants. La contrainte `tickers_one_quote_source` interdit
qu'une ligne porte les deux identifiants : un actif a un fournisseur, pas deux
rafraîchisseurs qui se disputent sa ligne.

Le parseur de réponse Yahoo est **partagé** entre l'app et la fonction Edge
(`supabase/functions/_shared/yahooParse.ts`) : un prix lu à l'écran et un prix
écrit en base sortent du même code.

Deux différences assumées avec le dashboard :

- **Pas de proxy CORS.** Le dashboard passe par `allorigins` / `corsproxy.io`
  parce que c'est une page de navigateur. Une app React Native n'a pas de
  politique d'origine, et la fonction Edge est un serveur : tous deux appellent
  Yahoo directement, sans tiers dans le chemin des données. Seule la build web
  y perd la suggestion de prix du composer — les cours, eux, viennent de la base.
- **Les devises sortent de `meta.currency`**, pas d'une liste codée en dur. Le
  dashboard déclare un `EUR_YAHOO_TICKERS_SET` qu'il n'utilise nulle part ;
  lire la devise déclarée évite d'avoir à tenir cette liste. Londres cote en
  pence (`GBp`) : l'oublier multiplierait une position par cent.

---

## Ce qui reste à faire

Rien ne bloque. Ce qui suit est du confort :

- **Autocomplétion du ticker** dans le composer. `resolveCoingeckoId()` et
  `fetchStockQuote()` existent et tournent déjà à la saisie et à la
  publication ; il manque la liste déroulante.
- **Places de cotation.** Le composer ne demande pas la place, donc un titre
  européen est publié sans suffixe Yahoo et devra être corrigé en base
  (`AI` → `AI.PA`). La table des suffixes est écrite et testée.
- **Taille de position.** La colonne existe et les cartes l'affichent, mais le
  composer ne la collecte pas — le design ne lui donne pas de champ.
- **Saison de l'Oracle** figée à `2026-S3` dans `src/mocks/oracle.ts` ; en
  production elle devrait venir d'une table `seasons`.
- **Sous-ligne des classements.** Le design y met de la prose
  (« DCA 2 ans · 0,84 ₿ ») ; faute de colonne pour ça, elle est dérivée
  (« +31 % vs ₿ »), ce qui recouvre quatre des six lignes du design.
