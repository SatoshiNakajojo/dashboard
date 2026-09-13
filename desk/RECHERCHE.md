# Journal de recherche

Ce que les campagnes ont établi, et ce qu'elles ont coûté pour l'établir.
Rien ici ne décrit une stratégie retenue : ce journal sert à ne pas
re-tester ce qui a déjà été réfuté, et à se rappeler comment.

## Où en est le projet

**Aucune stratégie n'a d'edge démontrable.** La grille de robustesse — cinq
stratégies de base, sept actifs, deux échelles de temps, 84 cellules — ne
retient rien après correction de Benjamini-Hochberg. Dix-huit cellules
passent p < 0,05 brut, pour 4,2 attendues par pur hasard.

**Le portage de financement non plus.** Testé en coupe transversale sur
soixante actifs et douze mois : le financement est bien encaissé (+13,75 %)
mais le prix reprend davantage (−17,43 %), et le net est indiscernable du
hasard (p = 0,53). Trois tentatives de sauvetage — résidu de financement, jambes appariées en bêta,
classement de chaque actif par rapport à lui-même — sont réfutées elles
aussi. La piste est close : ce que la règle encaissait venait presque
entièrement de la part *persistante* du financement (+10,73 % → +2,00 %
quand on la retranche), et cette part-là ne se capte pas sans détenir
toujours les mêmes actifs du même côté.

**Deux explications publiées ici étaient fausses**, et leur correction est
une section à part entière : j'avais attribué l'échec du portage au
momentum, puis à un bêta de −0,54, sans mesurer le premier ni éprouver le
second. La corrélation en coupe vaut −0,013, et le bêta disparaît (+0,08)
dès qu'on retire un seul des onze mois.

C'est un résultat, pas un échec. Il dit où ne pas mettre d'argent — et il
dit aussi, deux fois, à quel point il est facile d'écrire une raison plutôt
que de la mesurer.

## Le survivant qui n'en était pas un

À 2 000 tirages, `tsmom BTC 1d` passait la correction avec p = 0,0005 —
exactement le **plancher** du test, 1/2001. Un p au plancher n'est pas un p
mesuré : c'est tout ce que la résolution permettait de dire. Relancé à
20 000 tirages, il donne p = 0,00105, au-dessus du seuil au rang 1
(0,000595). Il ne survit pas.

Le verdict de la grille affiche désormais le plancher à côté du seuil. Un
criblage dont le plancher est au-dessus du seuil ne *peut* rien rejeter, et
son « zéro survivant » ne mesure alors que sa propre résolution.

## La leçon la plus chère : quatorze cellules ne font pas quatorze tests

La grille montrait `rsi_reversion` sous son bras aléatoire sur **ses
quatorze cellules**, d'un écart médian de 48 $ sur 1 000 $. Le modèle nul
prend le même nombre de trades avec les mêmes durées : il paie les mêmes
frais, donc l'écart est du signal, pas du coût. J'ai appliqué un test de
signe — quatorze signes identiques, une chance sur huit mille — et j'en ai
tiré `rsi_continuation`, structure identique, sens inversé.

**Testée sur dix-huit actifs que la grille n'avait jamais vus, elle ne donne
rien.** 13 sur 18 en gain net, mais zéro survivante après Benjamini-Hochberg,
et le test de signe y vaut p = 0,24. Le phénomène ne se reproduit pas.

La raison tient en un chiffre qu'il fallait mesurer avant de conclure, pas
après : **les sept actifs de la grille corrèlent à 0,58** sur leurs
rendements quotidiens. Quatorze cellules valent alors moins de **deux**
observations indépendantes. Mon « p = 1,2·10⁻⁴ » valait en réalité p ≈ 0,64
— c'est-à-dire rien.

Deux choses à retenir, et la seconde est la vraie :

1. Benjamini-Hochberg reste valide sous dépendance positive. Le **test de
   signe**, lui, ne l'est pas : il compte les cellules comme indépendantes.
   C'est lui qui avait servi à conclure.
2. Un jeu de sept cryptos majeures sur la même période n'est pas un
   échantillon de sept. Le nombre de cellules flatte l'œil ; la corrélation
   décide.

Le verdict de la grille rend maintenant la corrélation moyenne et la taille
d'échantillon effective `n / (1 + (n-1)·ρ)`. L'erreur ne peut plus se faire
en silence.

## Ce que le hors-échantillon a quand même montré

`rsi_reversion` reste négative sur 12 des 18 actifs neufs, et
`rsi_continuation` positive sur 13 — mais ces comptes sont compatibles avec
le hasard (p = 0,24 des deux côtés). Le seul point remarquable est FTM :
−93,72 $ en réversion contre +98,05 $ en continuation, sur les mêmes
56 trades. Un miroir aussi net sur une cellule isolée est exactement ce
qu'une recherche de motifs produit quand il n'y a pas de motif.

## Le portage de financement : réfuté, et par le mois qui manquait

La piste non directionnelle suivante était le financement. L'idée tenait :
sur Hyperliquid le financement ne paie pas pareil partout, et la corrélation
entre cryptos — 0,58, celle qui a ruiné l'indépendance de la grille —
devient un atout quand on vend un actif pour en acheter un autre. Règle
déclarée avant de regarder : chaque mois, classer par le financement versé
le mois *précédent*, vendre les 5 premiers, acheter les 5 derniers, tenir
un mois. Douze mois d'historique, soixante actifs, onze rebalancements.

Le résultat, sur les soixante actifs :

```
financement encaissé   +13,75 %
effet des prix         −17,43 %
frais                   −0,90 %
NET                     −4,58 %   (du notionnel brut)
mois positifs            8 / 11   p (modèle nul) = 0,534
```

La décomposition est tout le rapport. Le financement est bien encaissé —
+13,75 %, et cette partie est mécanique : on est short ce qui paie. Le prix
reprend davantage. Le net est négatif, et surtout il est *indiscernable* de
paniers tirés au hasard avec le même nombre de positions et la même
rotation (p = 0,53) : ce n'est pas le classement qui produit le résultat,
c'est le simple fait d'être en position.

**Huit mois positifs sur onze, et un net négatif.** C'est le chiffre à
retenir, parce que c'est exactement la forme qu'a un risque caché. **Un seul
mois porte toute la perte** : août 2026, marché +42,1 %, livre −36,2 %. La
stratégie a « marché » huit mois parce que le marché baissait huit mois ;
elle a rendu l'année entière au premier mois de hausse. Un test qui se
serait arrêté en juillet aurait conclu l'inverse.

Reste à dire *pourquoi*. J'ai donné deux explications, la première sans la
mesurer et la seconde sans l'éprouver ; les deux étaient fausses. La section
suivante les corrige, et elle vaut d'être lue avant la suite — c'est la
partie de ce journal qui a coûté le plus cher à écrire.

Deux réserves qui survivent au verdict, et qui joueraient *contre* la
stratégie si on les levait :

- **L'univers est choisi par le volume d'aujourd'hui.** Les soixante actifs
  sont les plus traités *maintenant* ; ceux qui sont morts pendant l'année
  sont absents. L'API n'offre pas de classement de volume historique, donc
  ce biais du survivant n'est pas corrigeable ici — il ne peut que flatter.
- **Onze rebalancements ne démontrent rien.** Ils peuvent réfuter, et c'est
  ce qui s'est passé. Une conclusion positive sur onze points aurait exigé
  bien davantage avant d'engager quoi que ce soit.

Un détail d'implémentation qui aurait suffi à fabriquer le résultat :
`JOURS_MINIMUM = 20`, exigé des deux côtés (financement *et* prix). Sans
lui, un actif listé depuis quatre jours présente une somme de financement
minuscule, se classe « le plus bas » et se fait acheter pour une raison
purement comptable. Le biais serait systématique — les nouveaux actifs
arrivent en permanence et se rangeraient toujours du même côté — et
invisible dans le total.

## Correction : l'explication que j'avais donnée du portage était fausse

La section ci-dessus se terminait, jusqu'au 12 septembre 2026, par ce
paragraphe — reproduit ici parce qu'il a été publié, et qu'effacer une
erreur sans la nommer est la seule façon de la répéter :

> Et la raison est économique, pas statistique : un financement élevé marque
> un actif que tout le monde achète avec levier. Vendre le financement
> élevé, c'est vendre le momentum.

C'était une histoire plausible, écrite sans être mesurée, sur un dépôt dont
c'est précisément la règle de ne pas le faire. `diagnostic_portage.py` fait
les mesures qui manquaient — et la première version de cette correction a
reproduit la même faute une seconde fois, ce que la fin de section explique.

**La mesure qui tue l'explication momentum.** Si vendre le financement élevé
revenait à vendre le momentum, le financement d'un mois et le rendement du
même mois seraient corrélés positivement en coupe, et de façon répétée. Sur
les douze coupes, chacune d'une cinquantaine d'actifs :

```
corrélation en coupe, financement ~ rendement du même mois
médiane                     −0,013
mois où elle est positive     6 / 12
```

Une médiane nulle et un signe qui tombe à pile ou face : il n'y a pas de
relation. Le classement par financement ne classe pas par momentum. **Ce
point-là est solide** — douze cross-sections indépendantes, pas onze points
dans le temps.

**Ce que les jambes sont vraiment.** La rivale évidente était que le côté
vendu soit un panier d'alts à fort bêta et le côté acheté des majeures.
C'est vérifiable directement, en regardant les actifs sélectionnés :

```
                              côté VENDU   côté ACHETÉ
bêta moyen des membres            +1,00        +0,79
financement moyen                 +0,66 %      −1,03 %
dispersion du financement          0,72         1,65
```

L'écart de bêta de *composition* est de −0,22, quand l'écart *réalisé* entre
les rendements des deux jambes est de −1,11 : la composition en explique
20 %, pas davantage. **La sélection ne prend pas des actifs plus exposés.**
Elle prend, du côté acheté, des actifs au financement négatif et très
dispersé — des actifs que le marché paie pour détenir, c'est-à-dire des
actifs en difficulté.

**Et maintenant la partie où je me suis trompé une deuxième fois.** J'avais
d'abord écrit cette correction en désignant un nouveau coupable : « le livre
portait un bêta de −0,54, par construction ». Ce bêta est estimé sur onze
points. En voici la vérification que je n'avais pas faite — la pente du
livre, recalculée en retirant chaque mois :

```
sans 2025-11   marché −21,92 %   livre  −7,53 %   bêta −0,67
sans 2026-04   marché  +6,16 %   livre  +5,66 %   bêta −0,58
   … huit autres mois entre −0,53 et −0,57 …
sans 2026-08   marché +42,14 %   livre −36,20 %   bêta +0,08   ←
```

**Tout le bêta tient à un seul mois.** Retirer août 2026 — le mois de la
grande hausse — et la pente passe de −0,54 à +0,08, c'est-à-dire à rien, et
de signe. Le t de Student de −2,9 et l'intervalle [−0,90 ; −0,18] sont
corrects et sans valeur : ils décrivent une droite qu'une observation à fort
levier tient à elle seule.

**Ce que ce diagnostic établit :** l'explication momentum est fausse ;
l'écart de bêta entre les jambes n'est pas un effet de composition ; le
livre a perdu, et il a perdu l'année entière en un mois.

**Ce qu'il refuse d'établir :** que ce livre « portait un bêta ». Onze
observations mensuelles ne permettent pas de dire si l'exposition était
systématique ou si un seul mois l'a fabriquée. Les deux lectures sont
compatibles avec ce qu'on a, et choisir la plus racontable serait refaire,
en plus discret, l'erreur que cette section corrige.

**Ce que l'épisode apprend sur la méthode.** Deux règles, et j'ai enfreint
les deux dans la même semaine :

1. **Une explication causale est une affirmation, pas un commentaire.** Elle
   se mesure ou elle ne s'écrit pas. Coût ici : l'explication fausse a été
   publiée, *et* elle a orienté la tentative de sauvetage suivante, qui a
   donc testé la mauvaise chose.
2. **Une pente sur onze points n'est pas une cause tant qu'on ne l'a pas
   retirée mois par mois.** L'erreur-type ne suffit pas : elle était bonne
   (t = −2,9) sur une droite qui n'existe que par une observation. Le
   « laisser-un-mois-de-côté » coûte cinq lignes de code et il aurait évité
   la deuxième version fausse de cette section.

## Trois tentatives de sauvetage du portage, trois réfutations

Les trois règles ci-dessous sont nées du diagnostic d'un échec sur ces mêmes
données. Elles sont donc dans l'échantillon : un résultat positif n'aurait
valu que candidature à un test hors échantillon. Les trois sont négatives,
et une réfutation dans l'échantillon, elle, suffit.

**1. Classer par le résidu de financement** (`portage_residuel.py`). Née de
l'explication fausse : si le classement vendait du momentum, il fallait
retirer du financement la part que le rendement du mois explique et classer
par ce qui reste. La régression est refaite en coupe chaque mois.

```
                          TÉMOIN (financement brut)   CANDIDAT (résidu)
financement encaissé              +13,75 %                +12,88 %
effet des prix                    −17,43 %                −22,45 %
NET                                −4,58 %                −10,59 %
p (modèle nul)                     0,554                   0,639
```

Pire que le témoin sur tous les postes. C'est cohérent avec la correction
ci-dessus : la part « expliquée » qu'on retire est proche de rien, et la
retirer n'ajoute que du bruit au classement.

**2. Apparier les jambes en bêta** (`portage_neutre.py`). Née de la
deuxième explication — celle dont on sait maintenant qu'elle tenait à un
seul mois : peser chaque jambe à l'inverse de son bêta plutôt qu'à notionnel
égal. Le bêta est estimé **à chaque rebalancement, sur les mois strictement
antérieurs** — un bêta calculé sur la période entière donnerait une
couverture que personne n'aurait pu mettre en place, et c'est la façon la
plus discrète de fabriquer un résultat. Les poids sont bornés à [0,4 ; 2,5]
pour que la couverture reste une correction et non un pari.

```
                          TÉMOIN (notionnel égal)   CANDIDAT (bêta apparié)
financement encaissé              +13,75 %              +13,05 %
effet des prix                    −17,43 %              −15,61 %
NET                                −4,58 %               −3,46 %
mois positifs                       8 / 11                6 / 11
p (modèle nul)                     0,554                 0,538
```

Le net reste négatif et p reste à 0,54. Un bêta estimé sur quatre à dix mois
est de toute façon trop bruité pour couvrir quoi que ce soit — et, la
correction ci-dessus l'ayant établi, il n'est même plus sûr qu'il y ait eu
un bêta à couvrir.

**3. Classer chaque actif par rapport à LUI-MÊME** (`portage_relatif.py`).
La meilleure des trois idées, et la plus instructive en échouant. Le niveau
de financement d'un actif est d'abord une *caractéristique persistante* :
un actif au financement chroniquement négatif se retrouve acheté tous les
mois, quoi qu'il arrive. On classe donc par l'écart au niveau habituel :

    signal = financement(mois précédent) − moyenne de ses mois antérieurs

La moyenne ne porte que sur les mois strictement antérieurs, ce qui coûte
les premiers mois : le candidat ne peut jouer qu'à partir de 2026-01, et le
témoin est rejoué **sur la même fenêtre** — sinon on comparerait deux
périodes plutôt que deux règles.

```
                          TÉMOIN (niveau)   CANDIDAT (écart à soi)
                             8 rebalancements, 2026-01 → 2026-08
financement encaissé          +10,73 %            +2,00 %
effet des prix                −22,75 %           −14,82 %
NET                           −12,64 %           −13,49 %
mois positifs                   6 / 8               4 / 8
écart réalisé des jambes        −1,39              −1,16
p (modèle nul)                  0,692               0,704
```

La prédiction déclarée avant de mesurer était que l'écart entre les jambes
se resserrerait nettement. Il passe de −1,39 à −1,16 : **la prédiction est
réfutée**, et c'est une information sur le mécanisme, pas seulement sur la
règle.

Mais le chiffre à retenir est ailleurs, et il est robuste — c'est une somme
sur huit mois, pas une pente : **le financement encaissé s'effondre de
+10,73 % à +2,00 %**. Autrement dit, presque tout ce que ce portage
encaissait venait de la part *persistante* du financement — le fait qu'un
actif paie cher en permanence — et non de ses variations. Or la part
persistante est exactement celle qu'on ne peut pas capter sans détenir en
permanence les mêmes actifs, du même côté, ce qui n'est plus un portage mais
une position.

**Le portage de financement en coupe transversale est clos.** Trois règles
testées, trois réfutations, et une raison qui ne dépend d'aucune pente
fragile : le rendement de cette stratégie est sa composante persistante, et
la retirer ne laisse rien.

## Méthode : ce qui est acquis

- **Le plancher de p** est inscrit dans chaque fichier de campagne. Sans
  lui, on ne peut pas distinguer un « zéro survivant » dû à la donnée d'un
  « zéro survivant » dû à la résolution.
- **Les campagnes écrivent après chaque cellule.** Une écriture finale
  unique a déjà coûté une campagne entière lors d'un recyclage de machine.
- **Les p-values ne sont pas arrondies.** `round(p, 4)` écrasait à 0,0 tout
  p sous 0,00005 — une valeur impossible, et qui *flatte* le résultat.
- **Une hypothèse née d'un jeu de données se teste ailleurs.** La liste des
  actifs hors échantillon est *calculée* (`scripts/hors_echantillon.py`),
  jamais écrite à la main : une liste écrite peut être retouchée après
  coup, ce qui est la façon la plus discrète de truquer un test.
- **Le seuil d'historique est fixé avant de regarder.** 800 barres.
- **Une explication causale est une affirmation, pas un commentaire.** Elle
  se mesure ou elle ne s'écrit pas. Celle que j'avais donnée de l'échec du
  portage — « vendre le financement élevé, c'est vendre le momentum » — a
  été publiée sans mesure, et elle était fausse (corrélation en coupe :
  −0,013). Elle a en plus orienté la tentative de sauvetage suivante, qui a
  donc testé la mauvaise chose.
- **Une correction se publie à côté de l'erreur, pas à sa place.** Le
  paragraphe faux est reproduit dans la section qui le corrige. Réécrire
  silencieusement l'histoire d'un résultat, c'est perdre la seule trace de
  ce qui a été cru et pourquoi.

## Ce qui reste ouvert

- Aucune stratégie directionnelle testée ne franchit la barre. Avant d'en
  ajouter une sixième, se rappeler que chaque stratégie ajoutée augmente le
  nombre d'hypothèses, donc de faux positifs attendus.
- **Le financement en coupe transversale est clos** : trois règles testées
  (classement brut, résidu, jambes appariées en bêta), trois réfutations, et
  une cause mesurée — l'écart de bêta entre les paniers — qu'une meilleure
  sélection ne répare pas. Il reste la structure de terme et les écarts
  entre plateformes, mais la leçon vaut d'avance pour eux : **décomposer
  avant de conclure**. Un net positif obtenu en perdant sur la source de
  rendement annoncée et en gagnant ailleurs n'est pas la stratégie qu'on
  croit tester.
- Mesurer le bêta au marché de toute stratégie dite « neutre », et le
  mesurer *avant* de regarder le net. Le portage affichait huit mois
  positifs sur onze ; c'est son bêta de −0,54, pas son total, qui disait ce
  qu'elle était.
- **La règle des déblocages reste la seule qui ait passé la barre** (852
  événements, J−7 → J−1 à +236 bps contre +75 pour le hasard, p = 0,0010
  après Benjamini–Hochberg, dose-réponse monotone). L'étendre demande des
  sources de calendrier que le réseau de cette machine n'atteint pas —
  seul `api.hyperliquid.xyz` répond. C'est une limite d'accès, pas un
  résultat : la piste n'est ni confirmée ni infirmée au-delà de ce qui est
  déjà mesuré.
