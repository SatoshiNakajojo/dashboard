# Satoshi Social Club

Application privée d'un club de sept investisseurs de Nouméa, installable sur
l'écran d'accueil — **une PWA**, comme le dashboard JCGI.
React Native (Expo SDK 57) · TypeScript · NativeWind v4 · Supabase.

**[Comment l'installer sur un téléphone →](docs/INSTALLATION.md)**

Trois onglets, trois mécaniques :

| Onglet | Ce qu'il fait |
|---|---|
| **Nights** | Agenda des Crypto Nights et checklist potluck partagée en temps réel |
| **Calls** | Fil des calls d'investissement, Hall of Fame et Rekt Board |
| **Oracle** | Paris sur le cours du BTC, tracés au doigt — d'une semaine à dix ans, en parallèle, chacun avec son verrou et sa date de jugement |

Registre visuel : club privé, feutré. L'orange Bitcoin y est un **or**, en
accent rare, sur fond encre chaude. Référence : `Bitcoin Club v2.dc.html`.

---

## Démarrer

```bash
npm install
npm start        # développement
npm run build:web && npm run deploy   # publier la PWA à la main (secours : GitHub Actions le fait à chaque push)
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

### `OracleGraph` — SVG, time-lock, superposition CoinGecko

Trois invariants :

1. **Un seul facteur d'échelle.** Le repère logique 360 × 285 est peint tel quel
   dans un `Group` mis à l'échelle. Rien ne re-dérive une géométrie en pixels.
2. **Des prix en entrée, des prix en sortie.** Les courbes arrivent en
   `[jour, prix]` et le tracé repart en `[jour, prix]` ; les coordonnées de
   toile n'existent que dans le graphe. Deux membres peuvent voir des bandes de
   prix différentes sans que leurs courbes se décalent.
3. **Le verrou est une porte, pas un style.** Sans `drawRange`, le geste est
   coupé à la source. Trois garde-fous indépendants : le geste désactivé, le
   `setDraft` qui refuse, et le déclencheur `predictions_guard` en base. Et le
   doigt ne trace qu'à partir d'aujourd'hui : le passé est déjà écrit.

Le tracé est monotone en X — un point n'est retenu que s'il dépasse le précédent
de 4 unités. Toucher la toile alors qu'un tracé est déjà là ne l'efface pas :
une fenêtre demande « Effacer votre tracé ? ». Si l'on confirme, la toile se
vide et le geste suivant dessine ; un pari déposé, lui, reste enregistré tant
qu'on n'a pas déposé le nouveau tracé.

---

## Ce qui a été vérifié

- `npm run typecheck`, `npm run lint`, `npm test` — propres (526 tests).
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
- **Schéma** : toutes les migrations appliquées dans l'ordre à un PostgreSQL 16
  neuf (doublures `supabase/tests/doubles.sql`), réexécutées pour l'idempotence,
  puis `supabase/tests/schema_test.sql` — 39 assertions passent, dont celles
  des paris de l'Oracle (calendrier fixé par la base, un pari en cours par
  horizon, scellement, déblocage seulement quand personne d'autre n'a parié),
  celles des calls (titre figé, corrections datées par la base, clôture qui
  fige la perf, sortie jamais avant l'entrée ni dans le futur, votes argumentés
  dans une fenêtre de 72 h, jamais sur son propre call), celles des
  notifications (file fermée aux membres, rappel du jour J une seule fois,
  battement qui lit son secret dans le coffre-fort), et celle qui
  manquait : un membre lit les couleurs déjà prises **avant**
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

## L'Oracle à plusieurs horizons

L'Oracle ne connaissait qu'une saison de 90 jours : une prédiction par membre,
et tout se verrouillait le même jour. Le club voulait parier sur une semaine
**et** sur dix ans, en parallèle, sans que les paris se bloquent ni se jugent
tous ensemble.

| Horizon | Révisable après le dépôt | Jugé à |
|---|---|---|
| 1 semaine | 24 h | J+7 |
| 3 mois | 3 jours | J+90 |
| 6 mois | 5 jours | J+182 |
| 1 an | 7 jours | J+365 |
| 5 ans | 14 jours | J+1 825 |
| 10 ans | 14 jours | J+3 650 |

On choisit l'horizon en haut de l'écran ; le repère, le cadenas et la liste
parlent alors de celui-là. Un point sur un horizon signale qu'on y a un pari
en cours — or s'il est encore révisable, oxblood s'il est verrouillé. En bas,
l'**historique** mélange tous les horizons : c'est là qu'on relit qui avait vu
juste.

Quatre décisions portent l'ensemble :

- **La base fixe le calendrier.** Avant, le verrou n'était qu'un compte à
  rebours affiché par l'app : `locked_at` n'était écrit par personne, et rien
  n'empêchait de redessiner après l'heure. Le déclencheur `predictions_guard`
  fixe désormais l'ouverture, le verrouillage et la résolution à l'insertion,
  ignore ce que le client envoie dans ces colonnes, et refuse qu'on les change.
  Les durées vivent donc deux fois — en SQL et dans `src/lib/horizons.ts` — et
  `scripts/__tests__/horizons-sql.test.mjs` échoue si les deux divergent.
- **Un tracé se stocke en prix.** `[jour depuis l'ouverture, dollars]`, et non
  plus en coordonnées de toile : sur dix ans, la bande 80 k$ – 200 k$ ne tenait
  plus, et deux membres ne superposaient leurs courbes que parce qu'ils
  partageaient ce repère figé. La migration convertit les tracés déjà déposés
  et en fait des paris à trois mois, datés du début de leur saison.
- **Le repère est calendaire.** Son origine est la plus ancienne ouverture en
  vue — ou un peu avant aujourd'hui, pour voir le cours auquel raccrocher sa
  courbe (`lookbackDays`) — et chaque tracé y est décalé de l'écart entre son
  ouverture et cette origine. L'axe porte de vraies dates, à l'heure de Nouméa :
  des jours sur une semaine, des mois jusqu'à deux ans, des années au-delà.
- **La bande de prix suit ce qu'on affiche**, jamais le tracé en cours — sinon
  l'échelle glisserait sous le doigt. Elle a un plancher par horizon
  (`bandFor`) : à l'ouverture d'un pari à dix ans, on doit pouvoir viser un
  bitcoin à 1 M$ même si le cours n'a encore rien montré.

Un pari encore révisable se **retire** (`RETIRER MON PARI`, confirmé en deux
temps). Sans ça, un tracé déposé par erreur bloquerait l'horizon jusqu'à sa
résolution — dix ans pour le plus long.

Un pari **verrouillé** se **débloque** (`DÉBLOQUER MON PARI`, confirmé) dans
deux cas seulement : son tracé est vide — un reste de l'ancienne saison, qui
bloquait l'horizon à trois mois sans rien parier — ou **personne d'autre** n'a
de pari en cours sur cet horizon. Le verrou protège la sincérité d'un pari
face aux autres ; seul sur l'horizon, il n'y a personne à protéger. Dès qu'un
autre membre a parié, le verrou tient. La base applique la même règle
(`prediction_withdrawable`, migration `20260924090000_unlock_predictions`) ; un
pari résolu ne se retire jamais.

Un brouillon resté en mémoire au moment du verrouillage — une toile vidée pour
redessiner, par exemple — masquait le tracé enregistré : le pari figé
s'affichait vide. Une fois verrouillé, c'est toujours le tracé déposé qui
s'affiche.

**Limite connue :** l'API publique de CoinGecko ne rend pas plus d'un an
d'historique. Un pari à cinq ans ouvert il y a deux ans se juge donc sur sa
dernière année : la justesse ne compare que ce qui se recoupe, elle ne
s'invente pas le reste. Et si CoinGecko ne répond pas, l'écran le dit
(`COURS INDISPONIBLE`) plutôt que de juger les paris sur une courbe de
démonstration.

`src/lib/season.ts` ne sert plus qu'aux classements des Calls (« saison IV »).

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
pas en `<Text>` SVG : la typographie reste strictement celle du reste de l'app,
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
`ScreenHeader`, à gauche du titre, sur tous les onglets — petit, sans jamais
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

## L'Oracle plantait : 7,7 Mo de WebAssembly

Un membre a signalé que l'onglet Oracle tuait la page. Aucune erreur, aucun
message : l'écran mourait.

La mesure, sur les octets réellement publiés : **l'app téléchargeait 11,5 Mo au
démarrage, dont 7,7 Mo de `canvaskit.wasm`** — le moteur Skia compilé en
WebAssembly. Et elle les téléchargeait **sur l'écran d'accueil**, avant même
qu'on ouvre l'Oracle, parce que `loadSkia()` partait au montage de la racine.
Dans une PWA autonome iOS, ce budget — un module WASM de 8 Mo, un contexte
WebGL plein écran à 3× la densité de pixels — est exactement ce qui fait tuer
la page par le système.

Le graphe est passé à **`react-native-svg`**, qui était déjà une dépendance du
projet et n'était utilisé nulle part. Le port est mécanique parce que
`src/lib/chart.ts` produisait **déjà** des chaînes de chemin SVG, que Skia
recompilait ensuite en `SkPath` : les passer directement retire une conversion.
Le reste se traduit terme à terme — `DashPathEffect` devient `strokeDasharray`,
le `LinearGradient` Skia devient un `<Defs><LinearGradient>` en
`userSpaceOnUse`, `<Group transform>` devient `<G scale>`.

Ce qu'on y gagne, mesuré en navigateur sur la build publiée :

| | avant | après |
|---|---|---|
| Téléchargé au démarrage | 11,47 Mo | **3,59 Mo** |
| Coût de l'onglet Oracle | 440 Ko (+ 7,7 Mo déjà chargés) | **53 Ko** |
| Morceau différé `OracleGraph` | 466 Ko | **55 Ko** |

Le geste de tracé, le time-lock, la superposition des courbes du club et le
dégradé sous la courbe BTC sont inchangés — vérifiés en navigateur, tracé au
doigt compris.

**Et une barrière.** `ChartBoundary` entoure le graphe. Elle ne répare rien :
elle garantit que le pire cas est une ligne de texte au lieu d'une app morte.
Un graphe est le seul endroit de l'app où l'on peint des données arbitraires
sur une pile de rendu qui n'est pas celle du reste ; une exception y remontait
jusqu'à la racine React, qui démonte tout.

---

## Les calls affichaient 0 %, et c'était vrai

Un membre a signalé que la perf de chaque carte restait à zéro. Ce n'était pas
un défaut d'affichage : la valeur était juste, c'est la donnée qui ne bougeait
pas.

À la publication, `current_price` est écrit **égal** au prix d'entrée — la carte
s'ouvre honnêtement à 0 %, sans perf inventée. La suite devait venir de
`refresh-prices`, une fonction Edge appelée par un planificateur. Personne ne
l'avait branché, et rien ne le signalait : le club a donc vu des zéros pendant
des semaines, ce qui est exactement ce qu'un prix figé doit afficher.

L'app sait pourtant interroger les mêmes sources — elle affiche déjà le spot
BTC. Elle redemande donc les cours elle-même à l'ouverture de l'onglet
(`useLiveQuotes`), en **une seule requête CoinGecko** pour tous les jetons du
club : `/simple/price` accepte une liste, et sept membres sur `$BTC` ne doivent
pas faire sept demandes. Le rafraîchissement planifié garde son intérêt — il
alimente la base pour qui ouvre l'app hors ligne — mais il n'est plus la seule
voie.

Un détail du modèle rendait la chose invisible : `coingecko_id` et
`yahoo_symbol` étaient **sélectionnés puis jetés** à la lecture. Sans eux, rien
dans l'app ne savait quoi redemander.

**Et le « — » de la colonne vs ₿.** Il vient d'ailleurs : `entry_btc_price` fige
le référentiel au moment de l'entrée, et c'est la seule valeur du modèle qu'on
ne peut jamais retrouver après coup. Elle restait vide quand le spot manquait à
la publication — y compris pour un call **BTC**, qui est pourtant son propre
référentiel et n'avait rien à demander à personne. `entryBtcFor()` distingue
désormais les deux cas. Pour les calls déjà publiés sans elle, « — » reste la
seule réponse honnête.

**Puis « vs ₿ » recopiait la perf.** Signalé sur un call SMR : les deux
colonnes affichaient le même chiffre. Le référentiel BTC était pris **à la
publication**, alors que le prix d'entrée saisi était celui d'un achat passé.
La perf de SMR courait depuis l'achat ; celle du bitcoin, depuis quelques
minutes — soit à peu près zéro. Le rapport des deux retombait sur la perf.

Le composer demande maintenant la **date d'entrée** (vide : aujourd'hui), et le
référentiel est le cours du bitcoin **ce jour-là** — CoinGecko pour la dernière
année, mempool.space au-delà (`src/lib/btcAtDate.ts`). Sans ce cours, la
publication est refusée avec un message plutôt que de figer un référentiel
faux, puisqu'il ne se corrige pas après coup. Même règle pour le cours de repli
du bandeau (`HORS LIGNE`) : il se lit, il ne sert plus de référentiel.

---

## Corriger ou supprimer un call

Un call publié était figé. L'auteur peut maintenant le **modifier** (prix
d'entrée, date d'entrée, thèse) ou le **supprimer** (confirmé ; ses votes
partent avec lui). Les boutons n'apparaissent que sur ses propres calls, et la
base le vérifie aussi (RLS).

Reste figé ce sur quoi on parie : le titre, la classe, l'auteur, la date de
publication — changer de titre, c'est un autre call. Et comme le prix d'entrée
fait le classement, toute correction est **datée par la base** (`edited_at`,
migration `20260924100000_editable_calls`) : la carte affiche « modifié il y a
2 h », et personne ne retouche son prix en silence. Le référentiel BTC n'est
recalculé que si le jour d'entrée change.

---

## `HORS LIGNE` sur un onglet, la variation sur l'autre

Chaque bandeau — un par onglet — interrogeait CoinGecko de son côté, comme les
calls et l'Oracle : six relevés par minute. L'API publique en refusait une
partie, et l'onglet refusé affichait `HORS LIGNE` pendant que son voisin,
servi une seconde plus tôt, montrait la variation du jour.

Le cours BTC est maintenant **un seul relevé partagé** par tous les écrans
(`useBtcSpot`), deux demandes simultanées n'en font qu'une (`withCache`), et
`HORS LIGNE` n'apparaît qu'après trois minutes **sans aucune** réponse
(`spotFreshness.ts`) : un refus ponctuel n'est pas une panne.

---

## Les polices du dashboard JCGI

L'app reprend le registre typographique du dashboard JCGI :

| Rôle | Police | Où |
|---|---|---|
| Titres d'écran | **Cinzel** 600 | « Les Nights », « L'Oracle », le nom du club sous le sceau |
| Serif | **Cormorant Garamond** 500 et 500 italique | titres de carte, grands chiffres, thèses, invites |
| Texte et libellés | **Inter** 400 / 500 / 600 | texte courant, libellés en capitales espacées, montants |

Le monospace (JetBrains Mono) disparaît : il donnait aux libellés un air de
terminal. Les libellés sont maintenant en Inter, en capitales espacées comme
les sous-titres du JCGI, avec des **chiffres tabulaires** pour que les
montants et le compte à rebours de l'Oracle ne bougent pas de largeur.

Une précédente comparaison avait écarté Cormorant Garamond parce que sa
graisse normale s'efface sur fond noir. On prend donc la graisse **500**, un
cran au-dessus, comme le JCGI pour ses chiffres ; chaque écran a été repassé
dans le navigateur sans débordement.

Les polices sont des **sous-ensembles latins** embarqués dans
`assets/fonts/` (licence OFL jointe, méthode dans `assets/fonts/README.md`) :
0,9 Mo au lieu de 2,1 Mo pour les fichiers complets, soit le poids des
anciennes polices.

---

## Détails d'écran

**Des blocs de blockchain.** Les huit carrés de l'écran d'attente sont devenus
des blocs chaînés : chacun porte ses deux lignes de données, et un maillon le
relie au suivant. Le maillon ne s'allume **qu'avec le bloc d'après** — c'est ce
qui fait une chaîne et pas une rangée. Les paliers du remplissage s'arrêtent au
bord exact d'un bloc ; des crans réguliers tomberaient au milieu des maillons.

**« Le Bag » devient « CALLS ».** Le titre d'écran devient « Les Calls », et le
sous-onglet « En cours », en face du Rekt Board.

**Le halo du bouton « + » disparaît.** L'ombre dorée bavait sur le contenu et
donnait au bouton un air de notification.

**Le logo passe de 38 à 46 pt**, et s'ouvre en grand d'un appui. À 38, le
cocotier et les lunettes du personnage étaient illisibles, ce qui réduisait un
logo dessiné à une tache orange.

**La barre d'onglets se resserre encore**, de 68 à 54 pt sur un iPhone. L'inset
système (34 pt) est calibré pour des **zones tactiles**, qu'on ne veut pas voir
happées par le geste de retour à l'accueil. Trois libellés de texte n'ont que
besoin de ne pas passer sous l'indicateur, qui est un trait de 5 pt situé à une
dizaine de points du bord.

---

## Les groupes du club, plutôt qu'une messagerie

Une messagerie interne a été envisagée, puis écartée : le club discute déjà
dans trois groupes Messenger — **Bitcoin Club**, **Stocks Club**,
**Vibe-Coding Club** —, un par sorte de soirée. En refaire une dans l'app,
c'était dédoubler la conversation et perdre la moitié des messages entre les
deux.

Un appui sur le logo, en haut à gauche, l'ouvre en grand ; les trois groupes
sont listés dessous, sous « NOUMÉA · 2020 », et chacun s'ouvre dans un nouvel
onglet. Les adresses se renseignent à un seul endroit,
`src/lib/clubChannels.ts` ; un groupe sans adresse reste listé, marqué
`LIEN À VENIR`, et ne s'ouvre pas. Seules les adresses `https://` s'ouvrent.
Une adresse `messenger.com/t/…` n'ouvre la conversation qu'à ceux qui en font
partie : la publier dans l'app ne donne accès à personne d'autre.

---

## Une page de profil

Un membre pouvait changer son nom en se réinscrivant, et rien d'autre. Un appui
sur l'avatar ouvre maintenant une page : le nom, une photo, et ce qu'on veut
partager au club — un GitHub, une adresse de dépôt BTC, un MetaMask.

**Les liens sont la seule zone de l'app où un membre écrit du texte que six
autres verront et pourront toucher.** C'est ce qui justifie `profileLinks.ts` :
on n'ouvre que `http:` et `https:`. Une entrée `javascript:` collée là
s'exécuterait chez les six autres. Tout le reste — une adresse de portefeuille,
mais aussi `data:` ou `file:` — s'affiche et **se copie**, jamais ne s'ouvre.

Deux détails qui comptent plus qu'ils n'en ont l'air :

- L'adresse raccourcie **élide son milieu, jamais sa fin** : sur une clé de
  portefeuille, les derniers caractères sont ceux qu'on vérifie du regard avant
  d'envoyer des fonds.
- Elle garde sa **casse**. Une adresse Ethereum porte sa somme de contrôle dans
  la casse de ses lettres ; l'afficher en capitales en fait une adresse fausse
  sous les yeux de qui la vérifie. C'est le seul endroit de l'app où `Micro`,
  qui met tout en capitales, ne convient pas.

La photo est redimensionnée à 512 px et compressée avant d'être téléversée : un
iPhone produit des images de 4 000 px et plusieurs mégaoctets, que les six
autres membres retéléchargeraient à chaque ouverture pour les afficher dans un
cercle de 34 points. En écriture, chacun n'a que son propre dossier dans le
bucket — la politique vérifie que le chemin commence par son identifiant.

`links` est du jsonb plutôt qu'une table : sept membres, une poignée de liens
chacun, toujours lus d'un bloc avec le profil. Les bornes sont portées par une
contrainte, parce que l'app n'est pas la seule porte — la clé publiable permet
d'écrire directement dans PostgREST.

**Le défaut trouvé en l'exécutant.** La première version de la contrainte
laissait passer `[{"label":"GitHub"}]`, sans url : une clé **absente** donne
`jsonb_typeof(NULL)` = NULL, et `NULL <> 'string'` vaut NULL, pas vrai. Il a
fallu l'appliquer sur un vrai PostgreSQL 16 et lui soumettre les sept cas
qu'elle doit refuser pour le voir ; la relire ne suffisait pas.

**Et l'annuaire se relit.** Un membre qui changeait son nom gardait ses
anciennes initiales dans l'en-tête, sur ses cartes et sur sa courbe de l'Oracle
jusqu'au prochain démarrage — il avait donc l'impression que l'enregistrement
n'avait rien fait. `useMembers` s'abonne désormais au même signal que la garde
de route.

---

## Chacun sa couleur

La couleur d'un membre lui était attribuée à l'inscription — la première
libre — et ne changeait plus. Elle se choisit maintenant dans **Mon profil**,
parmi **quatorze** : les sept du design, et sept de plus pour qu'il y ait
vraiment de quoi choisir (`COLORS`, `src/features/auth/profile.ts`).

Elle identifie le membre partout — avatar, courbes de l'Oracle, potluck —, donc
une couleur déjà portée par un autre ne se choisit pas : la pastille est
voilée et marquée de ses initiales. La base le refuse aussi
(`profiles_color_guard`, migration `20260925090000_member_colors`), y compris
quand deux membres choisissent la même à la même seconde.

Les tests mesurent la palette plutôt que de s'en remettre à l'œil : chaque
paire de couleurs reste distincte (écart perçu ΔE ≥ 15), et chacune garde un
contraste d'au moins 3:1 sous les initiales et sur le fond.

---

## Le profil des autres

Toucher l'avatar d'un membre — sur un call, une soirée, une ligne du potluck,
un classement, un pari de l'Oracle — ouvre sa page (`app/member/[id].tsx`) :
sa photo, son nom, et les liens qu'il partage au club. Un lien web s'ouvre, une
adresse (BTC, MetaMask) se copie, selon la même règle que sur sa propre page
(`src/lib/profileLinks.ts`). Rien ne s'y modifie ; sur son propre profil, un
bouton mène à la page d'édition.

Au passage, ces avatars portent désormais la **photo** du membre : l'app
n'affichait que ses initiales partout ailleurs que dans l'en-tête.

Sous ses liens, son **parcours** (`src/features/profile/record.ts`) :

- **ses calls** — en cours et clos, perf moyenne en dollars et vs ₿, son
  meilleur call au critère du Hall of Fame ;
- **son Oracle** — son rang et ses points de l'année, sa justesse moyenne, son
  total depuis toujours, les horizons où il a un pari en cours ;
- **ses soirées** — présences sur les soirées passées, et la prochaine où il
  est inscrit.

Les chiffres sont ceux des onglets, calculés par les mêmes fonctions : une perf
lue ici est celle de la carte, un score celui du classement. La page lit les
paris et l'agenda **une fois**, sans temps réel : `supabase.channel()` rend le
même canal à un second abonné, et le rebrancher depuis le profil casserait
celui de l'onglet ouvert derrière.

---

## Clôturer un call

Une position vendue restait « en cours » : son cours continuait de bouger, ou
il fallait supprimer le call — qui disparaissait des classements. L'auteur peut
maintenant le **clôturer** : un prix et un jour de sortie. La perf devient
**réalisée** et ne bouge plus ; la perf vs ₿ s'arrête le même jour, sur le
cours du bitcoin de ce jour-là, cherché comme celui de l'entrée.

L'onglet Calls se partage en **En cours** et **Clôturés** ; les classements
prennent les deux, puisqu'une perf réalisée compte autant qu'une perf latente.
Une sortie se corrige (« SORTIE » sur la carte), ou s'annule (« ROUVRIR LE
CALL ») : dans les deux cas, la carte affiche « modifié ».

La base garde la main (migration `20260926090000_closed_calls`) : elle date la
clôture (`closed_at`), refuse une sortie avant l'entrée ou dans le futur, fige
`current_price` au prix de sortie — `refresh-prices` n'y touche plus, et la
colonne générée `performance_percentage` donne la perf réalisée sans changer de
définition — et un call se publie toujours ouvert.

---

## Déploiement automatique

Chaque push sur `main` qui touche `mobile/` publie l'app
(`.github/workflows/deploy-club.yml`) : configuration vérifiée, `npm ci`,
types, lint, tests, build, publication dans `club/`, bundle vérifié, push de
`club/`. Rien ne part si une étape échoue — le site garde sa version.

Les garde-fous vivent dans `scripts/ci.mjs`, parce qu'un robot publie sans
relecture : pas de build sans Supabase (ce serait l'app de démonstration,
qui ne plante pas, elle ment), pas de clé secrète dans une variable publique ni
dans le bundle. Les journaux nomment les variables, jamais leurs valeurs.

Les quatre variables publiques de la build sont des secrets du dépôt, posés
une fois par `npm run ci:secrets` (via `gh` s'il est là, sinon par la page web
et le presse-papiers, sans rien afficher). Les migrations et les fonctions
Edge restent à la main : elles touchent la production.

---

## Des votes argumentés, et des points

**Voter**, c'est choisir un camp et dire pourquoi : toucher BULL ou BEAR sur la
carte d'un autre ouvre une feuille où l'on écrit sa raison (3 à 140 signes).
Les avis se lisent sous la carte (« LIRE LES 4 AVIS »).

Trois règles, tenues par la base (`ticker_votes_guard`, migration
`20260928090000_argued_votes`) :

- **une fenêtre de 72 h** après la publication — sans elle, on voterait bull
  sur un call déjà à +50 % pour ramasser des points sans avoir rien prédit.
  Hors fenêtre, un vote ne se change ni ne se retire ;
- **pas de vote sur son propre call** ;
- **un call clôturé ne se vote plus**.

**Les points des calls** (`src/features/bag/callPoints.ts`). Une seule règle :
**celui qui fait le call prend 100 % des points, ceux qui votent dessus en
prennent 50 %** — arrondis vers zéro, pour éviter les demi-points (12,5 → 12).

| Perf du call | Auteur | Bull | Bear |
|---|---|---|---|
| +100 % et plus | +500 | +250 | −250 |
| +50 à +100 % | +300 | +150 | −150 |
| +30 à +50 % | +200 | +100 | −100 |
| +20 à +30 % | +100 | +50 | −50 |
| +10 à +20 % | +50 | +25 | −25 |
| +5 à +10 % | +25 | +12 | −12 |
| 0 à +5 % | +10 | +5 | −5 |
| 0 à −5 % | −10 | −5 | +5 |
| −5 à −10 % | −25 | −12 | +12 |
| −10 à −20 % | −50 | −25 | +25 |
| −20 à −30 % | −100 | −50 | +50 |
| −30 à −50 % | −200 | −100 | +100 |
| −50 à −100 % | −300 | −150 | +150 |

Une borne appartient au palier du dessus : +5 % pile vaut 25, −5 % pile vaut
−25. Une perf de 0 % tout rond — un call qui vient de paraître — ne rapporte
rien. Un bull gagne quand le call monte et perd quand il baisse ; un bear,
l'inverse : sans cette perte, voter sur tout serait un billet de loterie
gratuit. Un call en cours est noté sur son cours du moment — ses points sont
**en jeu** et bougent avec le marché ; clôturé, ils sont **acquis** et comptent
pour l'année de la clôture. Sinon, il suffirait de ne jamais clôturer un call
perdant.

**L'onglet Classement** additionne ces points et ceux de l'Oracle, sur l'année
ou depuis toujours (`app/(tabs)/classement.tsx`) :

- **un podium** — le deuxième à gauche, le premier au centre, le troisième à
  droite. Tant que tout le monde est à égalité (en début d'année, sept membres
  à zéro), pas de podium : on ne monte pas sur une marche à l'ordre
  alphabétique ;
- **le classement complet**, avec les titres du club :

  | Rang | Titre | Devise |
  |---|---|---|
  | I | L’Oracle de Wall Street | « Il ne trade pas le marché, il lui donne rendez-vous. » |
  | II | Le Loup de Wall Street | « Il ne suit pas la tendance. La tendance le suit. » |
  | III | Le Chercheur en Pumpologie | « Chaque perte est une nouvelle donnée scientifique. » |
  | IV | L’Analyste de Boursorama | « Il peut aussi vous proposer une assurance vie. » |
  | V | Fournisseur de Liquidité | « Il ne trade plus, il finance les autres. » |

  Deux ex æquo partagent rang et titre (`src/features/club/clubStandings.ts`) ;
- **les affiches des titres** (`assets/titles/`) : le médaillon du personnage
  sur les marches du podium et devant chaque titre, les cinq affiches en
  galerie (« LES TITRES », avec qui les porte), et l'affiche en grand d'un
  appui. La page d'un membre titré montre la sienne. Chaque affiche existe en
  trois tailles — 1080 px, 540 px et le médaillon de 240 px — et un test
  vérifie qu'aucune ne manque ;
- **le barème** ci-dessus, lu dans `SCORE_TABLE` — la même table que le calcul,
  pas une copie : l'écran ne peut pas contredire les règles.

L'onglet relit calls, votes et paris à chaque visite. La page d'un membre
affiche son rang, ses points, son titre et sa devise.

---

## Les notifications

Quatre occasions de prévenir le club sans qu'il ait à ouvrir l'app : une
soirée proposée, le rappel du jour J (à 9 h à Nouméa), un call publié ou
clôturé, un pari résolu. Chacune se coche ou se décoche dans **Mon profil →
Notifications** ; les réglages valent pour tous les appareils du membre,
l'activation se fait appareil par appareil.

C'est du Web Push, sans dépendance : le message est chiffré pour chaque
appareil (RFC 8291) et chaque envoi est signé (VAPID, RFC 8292), en WebCrypto
(`supabase/functions/_shared/webpush.ts`). Le chiffrement rejoue octet pour
octet le vecteur de test de la RFC, et un vrai service de push (FCM) accepte
la signature — et refuse une signature altérée. Le reste du chemin — file en
base, battement pg_cron, fonction `notify` — est décrit dans
`supabase/functions/README.md`.

Sur iPhone, Safari n'ouvre le push qu'aux apps ajoutées à l'écran d'accueil ;
le profil le dit au lieu de montrer un bouton inerte. Toucher une
notification ouvre l'onglet dont elle parle.

Mise en place : `npm run push:setup` (voir `docs/INSTALLATION.md`).

---

## Le classement des oracles

Chaque pari résolu rapporte des **points** : sa justesse (0 à 100), multipliée
par le poids de son horizon — 1 pour une semaine, 2 pour trois mois, 3, 4, 6,
et 8 pour dix ans (`HORIZONS[].weight`). Les points se **cumulent** : parier
souvent paie, parier loin aussi. Une simple moyenne aurait donné la première
place à qui parie le moins ; elle reste affichée à côté, c'est elle qui dit qui
vise juste.

L'horizon est la **longueur de la prévision** dessinée, pas le temps qu'un call
met à performer : viser juste à dix ans est bien plus dur qu'à une semaine, d'où
le poids. Les paris courts, eux, paient par leur nombre — on peut en faire 52
par an à une semaine (vers 4 900 points à 95 % de justesse), contre un seul
pari de dix ans tous les dix ans. Inverser les poids ferait monter un parieur
hebdomadaire vers 40 000 points par an, et les calls ne compteraient plus.

Le classement vit dans l'onglet Oracle, sur l'année en cours ou depuis
toujours ; le premier de l'année porte le titre d'**Oracle 2026**
(`src/features/oracle/standings.ts`).

Un même pari devait rapporter les mêmes points partout. Or sa justesse
dépendait du grain de la série qui le jugeait, et ce grain changeait avec
l'horizon affiché à l'écran. Les paris résolus sont donc jugés sur deux séries
**canoniques** (`judging.ts`) : horaire sur les 88 derniers jours, journalière
au-delà — la règle dépend de la date, jamais de l'écran.

---

## Un pari se dépose sciemment

Le tracé de l'Oracle était enregistré **900 ms après le dernier point**. Un
membre qui relevait le doigt pour réfléchir avait donc déjà déposé sa
prédiction, sans l'avoir décidé, et rien à l'écran ne le disait.

C'est maintenant un bouton : `DÉPOSER MON PARI · 3 MOIS` pour ouvrir un pari,
`METTRE À JOUR MON PARI` quand on redessine un pari encore révisable,
`PARI DÉPOSÉ` quand l'écran et la base disent la même chose. La comparaison se
fait **point à point** (`samePath`) et non par référence — le tracé rechargé
depuis la base est un tableau neuf, et comparer les références allumerait le
bouton à chaque ouverture.

Sous le repère, un seul bouton, trois gestes qu'il ne faut pas confondre :

- `EFFACER MON TRACÉ` — un brouillon jamais déposé ;
- `REVENIR AU PARI DÉPOSÉ` — on a redessiné sans déposer : rien ne se perd,
  pas de confirmation ;
- `RETIRER MON PARI` — le pari est supprimé en base, donc en deux temps :
  `CONFIRMER LE RETRAIT` en oxblood, qui redevient lui-même au bout de quatre
  secondes. Pas d'`Alert` système : elle ne s'affiche pas de la même façon sur
  le web et sur iOS, et sortirait du registre de l'écran.

Le brouillon est gardé **par horizon** : passer de « 1 SEM » à « 5 ANS » ne
jette pas ce qu'on était en train de dessiner.

---

## La justesse d'un tracé

`meanAbsoluteGap` répondait déjà à la question, mais à l'envers : elle donne
l'**erreur** moyenne, en pour cent du prix réel. Un membre lit mieux « 87 % de
justesse » que « 13 % d'écart », et c'est la même mesure.

Ce n'est volontairement **pas** un coefficient de corrélation. Une corrélation
mesure l'accord de *forme* : un tracé parfaitement parallèle au cours, mais
40 000 $ au-dessus, obtiendrait 100 %. Dans un club qui parie sur des niveaux de
prix, ce serait un mensonge.

Elle se lit ainsi : 100 % le tracé est confondu avec le cours ; 90 % on s'est
trompé de 10 % en moyenne ; 0 % on s'est trompé d'au moins 100 %, c'est-à-dire
du double ou de la moitié du prix — en dessous, la nuance n'intéresse plus
personne.

Elle s'affiche **dès** qu'une portion du cours recoupe le tracé, et non plus
seulement après verrouillage : attendre privait le club du seul chiffre qui
rend la superposition intéressante avant la résolution. Les tracés sont déjà
visibles à l'écran — rien de nouveau n'est divulgué en les chiffrant.

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

Une fois l'app prête, la coquille reste encore **deux secondes**
(`BOOT_HOLD_MS`) : prête en une fraction de seconde, l'app escamotait
l'animation avant qu'on ait pu la voir. L'app se monte et charge ses données
dessous pendant ce temps.

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

### La bande qui restait, et qui n'était pas à nous

Même resserrée, la barre gardait une bande vide d'une quarantaine de points
sous ses libellés, sur l'app installée. Ce n'était ni la barre ni l'inset :
en mode autonome avec une barre d'état `black-translucent`, iOS dessine la page
sur tout l'écran — elle passe sous l'heure — mais calcule sa zone de mise en
page comme si la barre d'état ne la recouvrait pas. `innerHeight` et
`height: 100%` valent l'écran **moins** la barre d'état (844 − 47 = 797 pt sur
un iPhone 12 à 14), et l'app s'arrêtait 47 pt au-dessus du bord. Les « plus de
70 pt d'inset » qu'on avait cru lire sur la première capture, c'étaient ces
47 pt ajoutés aux 34 de la barre d'accueil.

`scripts/viewport-shim.mjs` mesure l'écart entre l'écran et la zone de mise en
page, et allonge le document d'autant — seulement dans l'app installée sur iOS
(`navigator.standalone`), en pleine largeur, et pour un écart de barre d'état
(100 pt au plus : un clavier ouvert n'est pas une barre d'état). Partout
ailleurs l'écart vaut 0 et rien ne bouge. Deux effets de bord sont traités :
les feuilles (`Modal`, en `position: fixed`, donc ancrées à la zone trop courte)
sont prolongées d'autant, et le document, désormais plus haut que ce qu'iOS
croit visible, est ramené en haut s'il défile. Le script est en ligne dans
`<head>` : la page a la bonne hauteur avant le premier rendu, et le déploiement
échoue si la balise manque.

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

- **Les présences en notification.** « Alex vient à la soirée » reste une
  annonce **dans l'app**. La passer en push est une ligne de plus dans la
  file (`notification_outbox`) et un réglage de plus — à décider : à sept,
  chaque clic sur « Je viens » ferait sonner six téléphones.
- **Autocomplétion des titres.** Les cryptos ont leur liste — CoinGecko
  autorise les appels navigateur. Les actions n'en ont pas : il faudrait
  relayer `v1/finance/search` de Yahoo par une fonction Edge, comme pour les
  cotations. Le sélecteur de place couvre le besoin en attendant.
- **Taille de position.** La colonne existe et les cartes l'affichent, mais le
  composer ne la collecte pas — le design ne lui donne pas de champ.
- **Ouverture d'une saison des Calls à la main.** Elles tournent seules tous
  les 90 jours (`src/lib/season.ts`). Si le club veut décider lui-même quand
  une saison s'ouvre, il faudra une table `seasons` et un écran pour
  l'administrer.
- **Historique CoinGecko au-delà d'un an.** Pour juger un pari à cinq ou dix
  ans sur toute sa durée, il faudra soit une clé CoinGecko payante, soit
  archiver soi-même un cours quotidien dans une table (la fonction planifiée
  `refresh-prices` s'y prêterait).
- **Sous-ligne des classements.** Le design y met de la prose
  (« DCA 2 ans · 0,84 ₿ ») ; faute de colonne pour ça, elle est dérivée
  (« +31 % vs ₿ »), ce qui recouvre quatre des six lignes du design.
