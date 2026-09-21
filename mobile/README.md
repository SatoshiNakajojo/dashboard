# Satoshi Social Club

Application privée d'un club de sept investisseurs de Nouméa, installable sur
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

- `npm run typecheck`, `npm run lint`, `npm test` — propres (212 tests).
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
- **Création d'une soirée** : feuille ouverte depuis l'onglet Nights dans
  Chromium, deux thèmes du club cochés, un troisième inventé au clavier, soirée
  écrite avec `2026-10-03T19:30:00+11:00`, ses trois thèmes et trois lignes de
  potluck numérotées, carte affichée sans rechargement. Le navigateur de test
  tourne en UTC : sans l'ancrage, la carte aurait annoncé 08:30.
- **Dates du club** : le 31 avril et le 29 février 2027 sont refusés — ils se
  découpent pourtant sans erreur — et `todayInClub` donne le jour calédonien,
  pas le jour UTC.
- **Diagnostic backend** : `npm run check:supabase` exécuté contre un faux
  projet Supabase, sain puis cassé — table absente, RLS inactive, migration
  partielle, fonction non déployée, inscription ouverte — et contre un projet
  injoignable. Chaque cas produit le bon verdict et le bon remède.

---

## Une soirée se propose depuis l'app, à l'heure du club

N'importe quel membre propose une soirée — le club n'a pas d'organisateur
désigné, et la RLS vérifie seulement qu'on en est un.

Une soirée porte **un ou plusieurs thèmes** : Crypto Night, Stock Night, Vibe
Coding Night, ou ce que le club inventera. Une Crypto Night qui finit en Vibe
Coding Night est une soirée, pas deux. La liste de `src/lib/nightThemes.ts`
n'est donc pas fermée — elle aide à la saisie, elle ne valide rien, et un thème
inventé une fois se reprend d'un doigt la fois suivante. La base ne connaît que
du texte, bornée à cinq entrées.

Le modèle a été renommé pour que ça se dise : `events.theme` portait le titre,
`events.tag` l'étiquette. Le titre est désormais `title`, et `themes` est un
tableau. La feuille
demande une date, un thème, un lieu, et jusqu'à six lignes de potluck laissées
libres : c'est aux autres de se les attribuer, et c'est tout l'intérêt de
l'écran.

**L'heure saisie est toujours celle de Nouméa** (`src/lib/clubTime.ts`). Laisser
`new Date(y, m, d, h, min)` décider reviendrait à laisser le fuseau de
l'appareil choisir : un membre en déplacement qui programme « 19 h 30 » veut
19 h 30 au club, pas 19 h 30 là où il se trouve. Le décalage est écrit dans la
chaîne envoyée à la base, jamais calculé.

L'affichage suit le même ancrage, sans quoi la carte contredirait la saisie à
une minute d'intervalle. `splitEventDate` et `formatTime` lisent donc en UTC
après décalage — une soirée à 23 h ne change pas de jour en route.

La création n'est **pas** optimiste, contrairement au RSVP : une Crypto Night
qui apparaîtrait puis disparaîtrait serait pire que trois secondes d'attente,
parce que les six autres membres la voient. Le potluck est écrit ensuite, et son
échec ne défait pas la soirée : une soirée sans liste reste une soirée.

---

## Dire oui, et que ça se sache

Trois choses s'enchaînent quand quelqu'un tape « Je viens », et elles répondent
à trois questions différentes.

**Pour soi : une coche.** Le bouton passait de `JE VIENS` à `VOUS Y ÊTES`, et
il fallait lire pour savoir où on en était. Il porte maintenant une coche. Elle
est **dessinée** — deux `View` pivotées, pas un `✓` : le caractère Unicode se
fait substituer par le système et arrive à des tailles imprévisibles selon
l'appareil. Le club a déjà payé cette leçon une fois, avec le ₿.

**Pour les autres : le temps réel.** `event_attendees` est publiée dans
`supabase_realtime`. Sans ça, « Je viens » n'était visible que de celui qui
l'avait tapé, et les six autres découvraient sa venue à leur prochaine
ouverture de l'app — c'est-à-dire, pour une soirée qui se décide le soir même,
jamais. Les écritures restent optimistes : l'écho de sa propre action retombe
sur un état déjà à jour, l'ensemble est idempotent.

**Pour qu'on le voie : une annonce.** Mettre la liste des présents à jour en
silence n'est pas prévenir. Un avatar qui apparaît dans une carte repliée,
personne ne le remarque. `AttendanceNotices` pose donc une bannière — « Alex
vient à Grillades & Halving Talk » — qui s'efface seule au bout de sept
secondes ou au doigt. Elle est ancrée **sous l'en-tête**, pas en haut de
l'écran : une bannière qui recouvre le logo et le titre fait perdre de vue où
on est. Et on ne s'annonce jamais à soi-même — le bouton vient de passer au
vert sous le doigt.

Ce sont des notifications **dans l'app**. Écran verrouillé, app fermée, rien
n'arrive : voir « Ce qui reste à faire ».

---

## Le mois en grille

La liste dit ce qui arrive ; elle ne dit pas où sont les trous. C'est pourtant
ce qu'on regarde pour proposer une date. L'onglet Nights porte donc deux vues,
« À venir » et « Le mois ».

La grille fait **toujours six lignes**, même quand cinq suffiraient : sans ça,
elle saute d'une hauteur en changeant de mois, ce qui se voit plus qu'on ne
croit quand on feuillette. Les jours de débord appartiennent aux mois voisins
et s'affichent en retrait — un trou est moins lisible qu'un 29 septembre grisé.
La semaine commence le lundi.

`src/lib/monthGrid.ts` fait l'arithmétique en UTC **sur des dates de
calendrier** : `Date.UTC(2026, 9, 1)` y est « le 1er octobre », pas « minuit
quelque part ». C'est ce qui empêche la grille de se décaler d'un jour selon le
fuseau de l'appareil. Une seule fonction consulte le décalage du club,
`clubDayKey` — parce qu'une soirée du 3 à 19 h 30 à Nouméa tombe le 2 en UTC,
et qu'elle doit apparaître le 3. Une soirée du 1er novembre à 00 h 30
appartient à novembre, pas au 31 octobre.

La grille et la liste parlent **du même mois**. Feuilleter jusqu'en décembre et
lire en dessous une soirée de septembre ne veut rien dire ; un mois vide
affiche « Rien ce mois-ci », ce qui est une information. Taper un jour réduit
la liste à ce jour, le retaper la rend — une sélection dont on ne peut pas
sortir est un piège.

Les chevrons sont dessinés, comme la coche. Leur sens est vérifié en
navigateur : un chevron qui pointe du mauvais côté fait reculer là où on
croyait avancer, et la rotation naïve donne exactement l'inverse de ce qu'on
veut.

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
« SATOSHI SOCIAL CLUB ». C'est le logo qui l'emporte : il sera sur l'écran d'accueil de
chaque membre, et un nom qui contredit la marque se remarque. Revenir en arrière
est un mot à changer dans `brand.ts` — plus les deux fichiers statiques qu'il
nomme.

Le logo ne vivait que sur la porte d'entrée : une fois connecté, plus rien ne
disait chez qui on était. Il tient maintenant la place d'un sceau dans
`ScreenHeader`, à gauche du titre, sur les trois onglets — petit, sans jamais
réclamer l'attention.

**La palette a suivi.** L'or du design était à 36° de teinte, celui du logo à
29°. Sept degrés ne se nomment pas, mais deux oranges voisins posés l'un à côté
de l'autre se voient : le logo avait l'air rapporté. Toute la famille d'ors a
donc été décalée sur la teinte du logo — `gold`, `goldLight`, `goldDeep`,
`goldMuted`, `goldGlow`, `goldTint`, les dégradés du FAB et la première couleur
de la palette des membres — **à luminosité et saturation constantes**. Le
registre sobre du design survit ; seule la teinte bouge. `src/theme/tokens.ts`
et `tailwind.config.js` sont deux copies de la même vérité : toute couleur
ajoutée à l'un doit l'être à l'autre.

---

## Trois polices, et pourquoi celles-ci

Le serif d'affichage était **Instrument Serif**. Mesuré sur fond noir, ses
pleins s'amincissent jusqu'à disparaître : c'est une police de magazine, faite
pour de l'encre sur du papier, et le club la lisait sur un écran sombre.

Onze familles ont été rendues côte à côte, au même corps, sur le vrai fond de
l'app, avec le vrai texte des cartes. **Fraunces** l'emporte : des fûts qui
survivent au fond sombre, et une chaleur de vieille affiche qui répond au badge
du club mieux qu'un didone. Le corps passe à **Plus Jakarta Sans**, plus ouvert
que Manrope aux petites tailles. **JetBrains Mono** ne bouge pas — c'est le
registre technique, il était juste.

La mesure qui a compté : Fraunces est **1,42 fois plus large** qu'Instrument
Serif à corps égal. Ce n'est pas un détail de goût. Instrument Serif est
exceptionnellement étroite, et sur les onze candidates, **aucune** n'approche sa
largeur sans retomber dans le défaut qu'on corrigeait — les deux plus étroites,
EB Garamond et Crimson Pro, sont aussi les plus fines. Changer de serif impose
donc de changer de gabarit : c'est assumé, et chaque écran a été repassé en
navigateur pour vérifier qu'aucun texte ne déborde ni ne se coupe.

---

## Ce qu'on voit avant que l'app existe

Le bundle pèse 2,7 Mo. Entre le moment où Safari reçoit le document et celui où
React peint quelque chose, il s'écoule plusieurs secondes — et pendant ce temps
l'app était un rectangle noir. Sur un écran d'accueil d'iPhone, un rectangle
noir se lit « ça a planté ».

`scripts/boot-shell.mjs` pose une coquille dans le document publié : le logo, et
une chaîne de huit blocs qui se minent en boucle. Elle est là **dès le premier
octet** — aucune police à charger, aucun JavaScript, et pour seule image
l'icône que la PWA a déjà en cache. Si le bundle n'arrive jamais, elle reste :
c'est encore mieux qu'une page blanche.

Pas de pourcentage. On ignore le débit du réseau, et une barre bloquée à 80 %
ressemble à une panne ; des blocs qui se minent ne promettent que « ça
travaille », ce qui est la seule chose vraie.

`src/components/BootScreen.tsx` en est la copie React — elle prend le relais
pendant le chargement des polices, et sur mobile natif elle est seule. Les deux
doivent se ressembler : c'est ce qui rend le passage de l'une à l'autre
invisible. L'app retire la coquille quand elle est prête, et elle seule sait
quand ce moment arrive.

Le remplissage est un calque découpé qui s'élargit par crans, un par bloc. Le
premier essai laissait les blocs **se comprimer** dans la largeur animée au lieu
d'être découpés par elle : la chaîne se remplissait de tranches dorées. Ça ne se
voit qu'une fois l'animation lancée, donc jamais en relisant le code.

---

## Le huitième d'écran perdu en bas

La barre d'onglets réservait `24 + insets.bottom`. C'était deux fois la même
chose : les 24 de la maquette dessinaient la barre d'accueil que l'inset système
mesure déjà.

Mesuré sur une capture du club — deux repères nets, le soulignement d'onglet en
haut et le trait d'indicateur en bas — la barre atteignait **131 pt**, un
huitième de l'écran pour trois mots. Le défaut était invisible en
développement, où `insets.bottom` vaut 0 : il ne pouvait apparaître que sur un
vrai téléphone.

`bottomInset()` borne désormais la marge entre 12 et 34 pt. La borne haute n'est
pas de la superstition : dans une PWA autonome iOS, `env(safe-area-inset-bottom)`
remonte parfois bien plus que les 34 pt de la barre d'accueil, et une marge
décorative ne doit pas suivre une valeur aberrante. Au pire on frôle la zone
système de quelques points ; sans borne, on reperd ce qu'on vient de récupérer.

Le bouton flottant descend au passage de 96 à 24 pt : il était calé sur la
hauteur de barre de la maquette, et flottait au milieu de la liste où il
masquait un ticker sur deux.

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

- **Notifications sur le téléphone.** Les annonces de présence sont
  **dans l'app** : elles ne s'affichent que si elle est ouverte. Une vraie
  notification — écran verrouillé, app fermée — est une autre construction :
  une paire de clés VAPID, une table `push_subscriptions` avec sa RLS, une
  fonction Edge qui chiffre en `aes128gcm` et signe en VAPID, une demande de
  permission à l'écran, et sur iOS l'obligation que la PWA soit installée sur
  l'écran d'accueil (Safari ne notifie pas un onglet). Rien d'exotique, mais
  rien qui se déduise de ce qui est là.
- **Autocomplétion des titres.** Les cryptos ont leur liste — CoinGecko
  autorise les appels navigateur. Les actions n'en ont pas : il faudrait
  relayer `v1/finance/search` de Yahoo par une fonction Edge, comme pour les
  cotations. Le sélecteur de place couvre le besoin en attendant.
- **Taille de position.** La colonne existe et les cartes l'affichent, mais le
  composer ne la collecte pas — le design ne lui donne pas de champ.
- **Ouverture d'une saison à la main.** Elles tournent seules tous les 90 jours
  (`src/lib/season.ts`). Si le club veut décider lui-même quand une saison
  s'ouvre, il faudra une table `seasons` et un écran pour l'administrer.
- **Sous-ligne des classements.** Le design y met de la prose
  (« DCA 2 ans · 0,84 ₿ ») ; faute de colonne pour ça, elle est dérivée
  (« +31 % vs ₿ »), ce qui recouvre quatre des six lignes du design.
