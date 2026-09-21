# Cryptos Club

Application privée d'un club de sept investisseurs Bitcoin, installable sur
l'écran d'accueil — **une PWA**, comme le dashboard JCGI.
React Native (Expo SDK 57) · TypeScript · NativeWind v4 · Supabase · Skia.

**[Comment l'installer sur un téléphone →](docs/INSTALLATION.md)**

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
npm start        # développement
npm run build:web && npm run deploy   # publier la PWA
npm run check:supabase                # dit ce qui manque au backend
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

- `npm run typecheck`, `npm run lint`, `npm test` — propres (189 tests).
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
  l'idempotence, puis `supabase/tests/schema_test.sql` — 13 assertions passent,
  dont celle qui manquait : un membre lit les couleurs déjà prises **avant**
  d'être membre, là où la RLS lui refuse toute ligne.
  Le seed reproduit exactement les pourcentages du design (`+14,9 %`, `+12,4 %`,
  `+21,8 %`, `+11,2 %`, `-61,0 %`) et les perfs vs ₿ (`-2,5 %`, `+6,9 %`,
  `-3,7 %`, `-66,4 %`).
- **Application** : build web exportée et pilotée dans Chromium. Prise d'une
  ligne de potluck libre (2 libres → 1, compteur `4 / 6` → `5 / 6`), libération
  au re-tap, ligne d'un autre membre inerte. Tracé de l'Oracle au doigt,
  verrouillage, passage en lecture seule, `FIGÉ · HASH 8F2A`, écarts colorés.
  Publication d'un `$SOL` (10 cartes → 11). Sélecteur de place : absent sur un
  call BTC, présent sur `ACTION`, `$AI` suivi comme `AI` puis `AI.PA` après un
  tap sur Paris, place remise aux États-Unis au retour sur une crypto. Choix du
  jeton : `$WIF` propose dogwifhat (#62) devant ses deux homonymes hors rang,
  le choix s'épingle (« Suivi comme… »), se dégrafe dès que le ticker change,
  et `$WIFX` annonce qu'aucun jeton ne correspond ; liste absente en BTC comme
  en ACTION. Avec Supabase configuré : la garde mène à la porte, l'adresse invalide est
  refusée, la panne réseau se lit « Connexion indisponible » et non en trace
  technique. Un code à huit chiffres — la longueur est réglable côté Supabase —
  traverse le champ sans être tronqué. Parcours complet rejoué : porte, code,
  prénom, puis l'app — la garde de route apprend la création du profil au lieu
  de renvoyer le membre devant la porte.
- **Ancrage de la saison** : build web pilotée dans Chromium avec l'horloge
  figée au douzième jour de la saison I et un faux CoinGecko. L'app demande 13
  jours d'historique et non 90, affiche `JOUR 12 / 90`, laisse 78 jours de
  toile vierge à droite du marqueur, et titre « saison I ».
- **Diagnostic backend** : `npm run check:supabase` exécuté contre un faux
  projet Supabase, sain puis cassé — table absente, RLS inactive, migration
  partielle, fonction non déployée, inscription ouverte — et contre un projet
  injoignable. Chaque cas produit le bon verdict et le bon remède.

---

## La saison ancre la courbe, pas seulement l'étiquette

L'Oracle prédit 90 jours. Encore faut-il savoir à quelle date correspond le
jour 0 du repère.

Il n'y avait pas de réponse : l'historique BTC était demandé sur « les 90
derniers jours » et numéroté depuis le premier point reçu. Avec de vraies
données, aujourd'hui tombait donc au **jour 90 sur 90** — la courbe réelle
couvrait la toile entière, et il ne restait aucun avenir à tracer. Le jeu de
démonstration place aujourd'hui au jour 34, ce qui masquait le défaut
complètement : il ne pouvait apparaître qu'une fois Supabase et CoinGecko
branchés.

`src/lib/season.ts` donne cet ancrage. Une saison dure 90 jours et démarre à
l'ouverture du club — `SEASON_EPOCH`, minuit à Nouméa, **la seule ligne à
changer** et pas à la légère : `predictions.season` en dérive, et des tracés
déposés se retrouveraient orphelins d'une saison qui n'existe plus.

Trois choses en découlent, qui étaient figées à trois endroits différents :

- On ne demande à CoinGecko que les jours écoulés, datés depuis le début de
  saison — 13 jours au douzième jour, pas 90.
- Le compteur `JOUR n / 90` vient du **calendrier**. Un jour où CoinGecko ne
  répond pas ne fait plus reculer le curseur de la saison.
- `predictions` porte un `unique (user_id, season)`. Tant que l'étiquette était
  figée, un membre ayant scellé son tracé ne pouvait plus jamais en déposer un
  autre. La saison tourne maintenant d'elle-même, et chacun repart d'une toile
  vierge.

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

## Identité

Le nom et le logo vivent en un seul endroit chacun : `src/theme/brand.ts` pour
le nom, `assets/brand/logo-source.jpg` pour la marque. `scripts/make-icons.py`
dérive toutes les tailles de la seconde — PWA, iOS, Android, splash, écran de
connexion.

Le dossier de design parle de « Satoshi Social Club » ; le logo du club porte
« CRYPTOS CLUB ». C'est le logo qui l'emporte : il sera sur l'écran d'accueil de
chaque membre, et un nom qui contredit la marque se remarque. Revenir en arrière
est un mot à changer dans `brand.ts` — plus les deux fichiers statiques qu'il
nomme.

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

### La place de cotation fait partie du ticker

`$AI` est C3.ai à New York **et** Air Liquide à Paris. Un composer qui ne
demande pas la place propose donc le prix d'une société pour un call sur
l'autre, sans que rien ne le signale.

Le composer affiche un sélecteur de place dès que la classe d'actif est
`ACTION` ou `ETF`, et écrit sous les puces le symbole réellement interrogé —
*« Suivi comme AI.PA sur Yahoo Finance. »* C'est cette ligne qui fait le
travail : elle transforme une erreur silencieuse en erreur visible, avant
publication plutôt qu'au premier relevé de performance.

La place n'est pas stockée : `tickers.yahoo_symbol` porte déjà `AI.PA`.

### Côté crypto, le même problème sous une autre forme

CoinGecko connaît trois `$WIF` et une bonne poignée de `$SOL`. À la
publication, le club retenait le mieux classé — bon choix presque toujours, et
quand il se trompait, il se trompait en silence. Pire : un ticker ne
correspondant exactement à aucun jeton publiait un call **sans fournisseur**,
dont la carte restait figée au prix d'entrée pour toujours, sans un mot.

Le composer propose donc les jetons pendant la frappe, avec leur nom et leur
rang, et annonce ce qu'il va suivre. Quand rien ne correspond, il le dit aussi
— c'est le cas qui était muet. Le choix du membre est transmis à la
publication, qui ne re-résout pas : ce serait remplacer sa décision par le
classement qu'il venait de contredire.

Deux garanties tiennent l'ensemble (`src/lib/coinSearch.ts`, testé) :

- La recherche **ne lève jamais**. Sans réseau, la liste est vide et le membre
  tape son ticker comme avant. Une autocomplétion est une commodité, pas une
  condition.
- `bestCoin`, qui tranche quand personne ne choisit, n'accepte qu'un symbole
  **exact** — jamais une ressemblance de nom. Publier sans fournisseur laisse
  une carte visiblement figée ; publier avec le mauvais jeton affiche un cours
  faux et crédible, que personne ne remet en question.

---

## Ce qui reste à faire

Rien ne bloque. Ce qui suit est du confort :

- **Autocomplétion des titres.** Les cryptos ont leur liste — CoinGecko
  autorise les appels navigateur. Les actions n'en ont pas : il faudrait
  relayer `v1/finance/search` de Yahoo par une fonction Edge, comme pour les
  cotations. Le sélecteur de place couvre le besoin en attendant.
- **Créer une Crypto Night depuis l'app.** C'est le manque le plus visible une
  fois le club en ligne : l'app sait rejoindre une soirée et prendre une ligne
  de potluck, pas les créer. Le dossier de design n'a pas d'écran
  d'administration. En attendant, `supabase/first-night.sql` pose une soirée et
  sa liste, et se relance sans créer de doublon.
- **Taille de position.** La colonne existe et les cartes l'affichent, mais le
  composer ne la collecte pas — le design ne lui donne pas de champ.
- **Ouverture d'une saison à la main.** Elles tournent seules tous les 90 jours
  (`src/lib/season.ts`). Si le club veut décider lui-même quand une saison
  s'ouvre, il faudra une table `seasons` et un écran pour l'administrer.
- **Sous-ligne des classements.** Le design y met de la prose
  (« DCA 2 ans · 0,84 ₿ ») ; faute de colonne pour ça, elle est dérivée
  (« +31 % vs ₿ »), ce qui recouvre quatre des six lignes du design.
