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

**La cotation d'un perpétuel non plus.** Testée sur un univers de 234
perpétuels reconstitué sans biais du survivant — délistés compris, ce que
l'API permet et que personne n'avait vérifié. Une cellule survivait à
Benjamini-Hochberg ; elle ne survit pas au modèle nul qui respecte les
grappes calendaires. Ce n'était pas la cotation qui payait, c'était la classe
d'actifs.

C'est un résultat, pas un échec. Il dit où ne pas mettre d'argent — et il
dit aussi, trois fois, à quel point il est facile d'écrire une raison plutôt
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

**Ce qui ferme la famille entière, et pas seulement trois règles.** Les
trois règles testées rangent toutes les actifs par leur financement, sous
une forme ou une autre. Une question les précède donc : dans cette
cross-section, à quoi le financement est-il lié ? Cinquante-trois actifs, et
les deux corrélations — Pearson, puis Spearman, qui ne se laisse pas
emporter par deux ou trois actifs extrêmes :

```
                                  Pearson   Spearman
bêta ~ financement moyen           +0,099    +0,210
bêta ~ dispersion du financement   −0,010    −0,073
financement moyen ~ dispersion     −0,726    −0,728
```

**Le bêta n'a aucune relation mesurable avec le financement**, ni en niveau
ni en dispersion, et les deux mesures s'accordent là-dessus. Toutes les
explications par le bêta tombent ici — y compris les deux miennes.

Ce qui est fortement lié, et sous les deux mesures, c'est le financement
*moyen* d'un actif et la *dispersion* de son financement : un actif qui paie
peu — ou qui se fait payer — est un actif dont le financement part dans tous
les sens. Le quartile au financement le plus bas a une dispersion de 1,40 ;
celui du haut, 0,47. Ranger les actifs par leur financement, c'est donc
mettre du côté *acheté* le panier des financements instables, quel que soit
le raffinement du classement. C'est structurel, mesuré en coupe, et ça ne
dépend d'aucune pente sur onze points.

Cette mesure a d'ailleurs failli produire une troisième erreur : faite
d'abord à la va-vite en dehors du script, avec un filtre légèrement
différent, elle donnait −0,64 pour la première ligne — trois actifs
extrêmes suffisaient à retourner le signe. C'est en la réécrivant dans le
script, avec Spearman à côté de Pearson, que l'artefact est apparu.

**Ce que l'épisode apprend sur la méthode.** Trois règles, et j'ai enfreint
les deux premières dans la même semaine :

1. **Une explication causale est une affirmation, pas un commentaire.** Elle
   se mesure ou elle ne s'écrit pas. Coût ici : l'explication fausse a été
   publiée, *et* elle a orienté la tentative de sauvetage suivante, qui a
   donc testé la mauvaise chose.
2. **Une pente sur onze points n'est pas une cause tant qu'on ne l'a pas
   retirée mois par mois.** L'erreur-type ne suffit pas : elle était bonne
   (t = −2,9) sur une droite qui n'existe que par une observation. Le
   « laisser-un-mois-de-côté » coûte cinq lignes de code et il aurait évité
   la deuxième version fausse de cette section.
3. **Une corrélation de moyennes se double d'une corrélation de rang.**
   Pearson sur des moyennes de financement se fait retourner par trois
   actifs sur cinquante-trois. Les deux doivent s'accorder avant qu'une
   phrase s'écrive — et une mesure faite hors du script n'est pas une
   mesure, c'est un brouillon qu'on finit par citer.

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
testées, trois réfutations, et deux raisons qui ne dépendent d'aucune pente
fragile : le rendement de cette stratégie est sa composante persistante, et
la retirer ne laisse rien (+10,73 % → +2,00 %) ; et cette composante
persistante est indissociable de la dispersion du financement (−0,73 en
coupe), si bien que tout classement par le financement achète le panier des
financements instables, quel que soit son raffinement.

## La cotation d'un perpétuel : réfutée, et par le contrôle que j'avais cassé

Après le portage, la piste suivante devait être un **événement daté** — la
seule forme qui ait jamais survécu ici. Les déblocages en sont un ; la
cotation d'un perpétuel en est un autre, et il a l'avantage d'être
entièrement mesurable sur l'API Hyperliquid, la seule que cette machine
atteigne.

**L'hypothèse, écrite avant d'avoir regardé le moindre rendement.** Une
cotation attire un flux acheteur — l'attention, le levier disponible dès la
première minute, et l'absence de position à liquider donc de vendeur naturel.
Si ce flux décroît, les semaines qui suivent sont négatives. Deux fenêtres
fixées d'avance (J+1 → J+7 et J+1 → J+30), trois tranches d'amplitude du
premier jour, `sens = -1`.

### Ce que cette étude apporte au dépôt, quel que soit son verdict

**Un univers sans biais du survivant, pour la première fois.** `RECHERCHE.md`
portait la réserve depuis le portage : « l'univers est choisi par le volume
d'aujourd'hui ; ceux qui sont morts pendant l'année sont absents ». Il se
trouve que l'API la lève : `meta` publie **234 perpétuels dont 56 marqués
`isDelisted`**, et `candleSnapshot` sert leur historique complet jusqu'à leur
dernier jour. MATIC répond de 2020-10-22 à 2024-09-09, RNDR de 2023-02-03 à
2024-07-21. `scripts/fetch_cotations.py` reconstitue donc l'univers **tel
qu'il était**, et non tel qu'il a survécu. C'est un acquis durable, et il
sert au-delà de cette étude.

**Un tiers des bougies de cotation ne sont pas négociables.** L'exchange
publie des bougies avant que quoi que ce soit ne s'échange : prix de marque,
volume nul. Sur 154 cotations retenues, **49 — 32 % — ont un volume nul le
jour même**. Le cas limite est PANDORA : +3 823 % sur sept jours, zéro
échange sur huit. À lui seul, il déplaçait la moyenne des 154 événements de
vingt-cinq points de pourcentage. Toute étude bâtie sur ces bougies sans
filtre mesure des prix de marque, pas des exécutions — et la première version
de celle-ci en faisait partie.

### Le résultat, après filtre de négociabilité

105 cotations depuis le 1ᵉʳ juillet 2023, dont 26 depuis délistées.

```
fenêtre     tranche      n     net BTC    hasard   médiane  gagn.    p
J+1_J+7     < 15 %      27      +144,1     +95,3    +666,9   63 %   0,4901
J+1_J+7     15-30 %     25    −1 413,1    +101,6    +305,0   52 %   0,9959
J+1_J+7     > 30 %      53      +494,2      +9,9  +1 336,7   68 %   0,0715
J+1_J+30    < 15 %      27    −1 316,5    +456,6  +1 340,7   70 %   0,9859
J+1_J+30    15-30 %     25    −2 095,3    +541,0     +53,5   52 %   0,9874
J+1_J+30    > 30 %      53    +1 967,2     +82,0  +3 703,2   77 %   ≤ 0,00005
J+1_J+30    toutes     105      +155,6    +280,9  +2 480,4   70 %   0,6489
```

Une cellule survit à Benjamini-Hochberg sur huit : vendre à découvert, un
mois durant, les perpétuels dont le premier jour a une amplitude supérieure à
30 %. Aucun des 20 000 tirages ne fait aussi bien. La sensibilité au seuil est
même monotone et spectaculaire — +665 bps à 15 %, +1 967 à 30 %, +4 099 à
50 %, avec 92 % de gagnants.

**Et elle ne tient pas.**

### Le contrôle qui décide, et l'erreur que j'ai failli publier

Les déblocages ont appris qu'un modèle nul tirant une date **indépendante par
événement** suppose que N événements sont N observations. Les cotations
arrivent en grappes — on cote quand le marché est chaud — donc elles ne le
sont pas. Il faut un nul **par bloc** : un seul décalage appliqué à toutes
les dates, qui préserve la structure calendaire.

La première version de ce contrôle rendait p = 0,15 et semblait tuer l'effet.
Elle était inerte. Le décalage commun est borné par le plus court historique
du lot, et un seul actif jeune — JELLY, 55 jours — écrasait la plage à
**[0, 25] jours**. Chaque tirage « au hasard » recouvrait donc la fenêtre
observée : le nul mesurait l'observation elle-même. J'ai failli publier une
réfutation obtenue par un contrôle qui ne contrôlait rien, ce qui ressemble
exactement à un contrôle réussi.

Corrigé — exiger cent jours de marge, ce qui coûte deux événements sur
cinquante-trois et rend une plage de 1 à 115 jours :

```
                  observé     nul       p
nul indépendant  +1 967,2    +51,4    0,0002    (53 événements)
nul PAR BLOC     +1 863,1   +808,6    0,1642    (51 événements, décalages 1→115 j)
```

**Le nul par bloc rend +808 bps.** Autrement dit : vendre ces mêmes actifs sur
n'importe quelle fenêtre de trente jours de leurs premiers mois rapportait
déjà +808 bps nets de BTC. La cotation en ajoute mille de plus, et cet écart
tombe au seizième centile des décalages possibles.

Ce n'est donc pas un effet de cotation. C'est un **penchant de facteur** : les
jetons dont le premier jour est violent — les memecoins, en clair — ont
sous-performé BTC pendant toute la période, presque quelle que soit la date.
Vendre cette classe d'actifs aurait rapporté ; ce n'est pas la cotation qui
rapporte.

Et le dépôt sait exactement comment finit ce genre de position : c'est celle
du portage de financement, qui affichait huit mois positifs sur onze et a
rendu l'année entière au premier mois de hausse.

### Ce que le contrôle par bloc ne peut PAS dire

Il n'y a que 115 décalages distincts. Sa résolution est donc bornée autour de
0,009 : il ne pourra jamais confirmer fortement, seulement ne pas rejeter.
Ici il ne rejette pas, et l'observation tombe au seizième centile — loin de
tout seuil. L'hypothèse n'est pas établie, et c'est tout ce qu'on peut en
dire. Prétendre l'inverse demanderait plus d'histoire que l'exchange n'en a.

### Les quatre autres contrôles, pour mémoire

Ils tiennent tous, et c'est précisément ce qui rend le cinquième instructif :
un effet peut passer le jackknife, la coupe temporelle et la séparation
délistés/cotés, et n'être malgré tout qu'une exposition de classe.

| contrôle | verdict |
| --- | --- |
| jackknife par actif | tient — pire exclusion p = 0,0050 |
| coupe temporelle | tient des deux côtés (0,068 / 0,0002) |
| délistés contre encore cotés | tient des deux côtés (0,0014 / 0,0052) |
| **nul par bloc** | **ne tient pas — p = 0,164** |

## Un seul actif, est-ce mieux ? La question a une réponse chiffrée

La question posée était : chercher une stratégie qui marche sur *plusieurs*
actifs est peut-être une erreur — ne vaudrait-il pas mieux en chercher une qui
marche sur *un seul* ?

Elle a une réponse exacte, et elle est à double tranchant.

### Ce que l'intuition a de juste

Le seuil de Benjamini-Hochberg au rang 1 vaut `alpha / m`, où `m` est le
nombre d'hypothèses **déclarées**. Réduire l'univers réduit `m`, donc desserre
le seuil. Ce n'est pas un détail de présentation, c'est ce qui décide :

```
tsmom BTC 1d, p = 0,00105 mesuré à 20 000 tirages

    les 84 cellules de la grille    seuil 0,05/84 = 0,000595   ne survit pas
    BTC seul, 12 cellules           seuil 0,05/12 = 0,004167   SURVIT
    BTC 1d seul, 6 stratégies       seuil 0,05/6  = 0,008333   SURVIT
```

**La même mesure, trois verdicts.** Le seul paramètre qui change est le nombre
d'hypothèses qu'on s'est autorisé. L'intuition est donc fondée : un univers
étroit déclaré d'avance achète de la puissance statistique.

### Ce qu'elle coûte, mesuré

Trente combinaisons de paramètres sur BTC 1d uniquement — ce qu'une personne
essaie naturellement en réglant une stratégie sur un actif : quatre familles,
des périodes plausibles, rien d'extravagant. Résultat :

```
                          BTC 1d seul      registre entier
combinaisons testées          30                 35
p < 0,05 brut                 10                 12
attendues par pur hasard      1,5                1,8
seuil BH au rang 1          0,00167            0,00143
SURVIVANTES                    1                  0
```

La survivante est `tsmom lookback=56`, p = 0,0015, net +302,51 $. Elle passe
le seuil de 0,00167 **d'un cheveu** — et elle meurt dès qu'on ajoute au
dénominateur les cinq combinaisons déjà présentes au registre. Cinq
combinaisons qui ne portent même pas sur BTC.

**Même donnée, même mesure, deux verdicts opposés**, et le seul écart est la
portée qu'on déclare. C'est la démonstration la plus nette qu'ait produite ce
dépôt de ce que « quatorze cellules ne font pas quatorze tests » veut
réellement dire.

### Le piège, et il est précis

Réduire l'univers ne paie **que si on l'a déclaré AVANT de regarder**. Ce
dépôt a déjà regardé : les 84 cellules de la grille, puis ces trente
combinaisons. Le dénominateur qu'on doit est celui de tout ce qu'on a essayé,
pas celui qu'on choisit après avoir vu le gagnant. Choisir sa portée après
coup, c'est désigner le vainqueur une fois la course courue.

Et l'univers restreint coûte la preuve la moins chère qui existe : la
**cohérence entre actifs**. Ce dépôt sait où mène l'autre voie —
`rsi_continuation` est née d'une régularité sur un jeu de données et n'a pas
survécu à dix-huit actifs neufs.

### Ce que le balayage montre quand même, et qui n'est pas du bruit

Les dix cellules à p < 0,05 ne sont pas dispersées au hasard : elles se
rangent par famille.

| famille | combinaisons | à p < 0,05 | net médian |
| --- | ---: | ---: | ---: |
| `turtle_breakout` | 6 | 4 | +326,52 $ |
| `tsmom` | 4 | 3 | +220,92 $ |
| `ema_cross` | 11 | 3 | +25,81 $ |
| `rsi_reversion` | 9 | **0** | **−58,05 $** |

Le suivi de tendance gagne sur BTC en journalier, le retour à la moyenne perd
de façon uniforme, et le modèle nul prend le même nombre de trades avec les
mêmes durées — l'écart n'est donc pas un effet de frais. C'est une structure,
pas un tirage chanceux.

Mais une structure n'est pas un edge démontré : le dépôt a déjà tiré
`rsi_continuation` d'une régularité de ce type, et elle est morte hors
échantillon. **Ce qui est mesuré ici est une hypothèse, née dans
l'échantillon, et elle vaut exactement ce que vaut ce statut.**

### La seule façon propre de l'encaisser

Un univers restreint ne peut plus être déclaré rétroactivement sur ces
données. Il reste une direction, et une seule : **figer la règle entièrement
— stratégie, paramètres, actif, échelle — et la juger sur des données qui
n'existent pas encore.** C'est ce que fait déjà `journal_unlocks.py` pour les
déblocages, et c'est la seule preuve que ce dépôt reconnaisse comme
concluante.

Le dénominateur redevient alors honnête, parce qu'il est déclaré avant que la
donnée existe. Une règle de prix figée aujourd'hui et relevée dans six mois
serait la deuxième chose de ce dépôt à mériter le mot « validé ».

## Deux règles de prix figées, et ce qu'elles peuvent honnêtement prouver

La section précédente a montré qu'un univers restreint achète de la puissance
— mais seulement s'il est déclaré *avant* de regarder, ce que ce dépôt ne peut
plus faire sur ces données. Il restait une voie : **figer entièrement une
règle et la juger sur des données qui n'existent pas encore.**
`src/trading_desk/sentinelle/regles_figees.py` est cette déclaration, et
`scripts/journal_regles.py` le journal qui l'accumule.

### Ce que la puissance mesurée dit, et il faut le lire avant d'espérer

Fenêtres glissantes sur tout l'historique : si l'on avait figé la règle à une
date quelconque, quel p un test de durée donnée aurait-il rendu ?

| règle | durée | trades | p médian | part à p < 0,05 |
| --- | --- | ---: | ---: | ---: |
| `turtle` BTC 1d | 1 an | 9 | 0,431 | 5 % |
| `turtle` BTC 1d | 3 ans | 31 | 0,329 | 8 % |
| `tsmom` BTC 1d | 1 an | 14 | 0,238 | 20 % |
| `tsmom` BTC 1d | 3 ans | 52 | **0,040** | **54 %** |

Le suivi de tendance a un taux de réussite de 40 % et des queues épaisses :
son rapport signal sur bruit par trade est minuscule. À dix trades par an,
`turtle` ne se prouvera **jamais** par ce chemin — 8 % des fenêtres de trois
ans passent, contre 5 % pour le pur hasard. `tsmom` était le seul à avoir une
chance réelle, et il lui fallait trois ans.

### Pourquoi `tsmom` a quand même été écarté

Parce que le desk le refuserait. En rejouant chaque règle contre le moteur de
risque du déploiement :

| règle | trades | refus du risque | part refusée |
| --- | ---: | ---: | ---: |
| `turtle_btc_1d` | 58 | 2 | **3 %** |
| `turtle_eth_1d` | 50 | 11 | 18 % |
| `tsmom_btc_1d` | 84 | 197 | **70 %** |

`tsmom` pose son stop à trois ATR : médiane 1 175 bps, neuvième décile 1 781,
au-dessus de la bande de 1 600. **Sept entrées sur dix seraient refusées**, et
la règle qui tournerait ne serait pas celle qui a été mesurée.

Deux façons de « réparer » ça, toutes deux malhonnêtes : élargir la bande de
stop pour que la stratégie passe — c'est ajuster le garde-fou à la stratégie —
ou baisser `atr_stop` jusqu'à ce que ça rentre, c'est-à-dire choisir un
paramètre sur une contrainte d'exécution puis le présenter comme validé.

**Le coût de cette décision est réel : il ne reste que des règles à faible
puissance. Aucune règle de prix figée de ce dépôt n'a aujourd'hui de chemin
réaliste vers une validation statistique.** C'est vrai, et ça ne change pas
si on ne l'écrit pas.

### Alors pourquoi les faire tourner

Parce que la validation statistique n'est pas le seul produit d'un journal.
Trois résultats sont disponibles en semaines, pas en années :

- la vérification que la règle s'exécute **comme elle a été simulée** — un
  écart entre le backtest et le live est un bogue, et il se voit au premier
  trade ;
- la mesure du **glissement réel** contre les 15 bps du modèle de coûts, qui
  est une hypothèse jamais confrontée et que le mode PAPER peut trancher ;
- la preuve que la plomberie tient avant qu'un centime réel ne passe.

### Le défaut qui aurait rendu tout le dispositif inutile

La première version du journal re-simulait l'état de position de son côté
pour savoir ce que la règle voulait faire. Elle **dérivait** : dix ouvertures
manquées sur cinquante-six pour `turtle_breakout`, parce qu'elle ignorait les
sorties au **stop** et se croyait encore en position.

Le journal aurait alors accumulé des prédictions sur une règle différente de
celle qui a été mesurée — le seul mode de panne qui rende un test hors
échantillon inutile, et le seul qui ne se voie pas dans les résultats.

La garantie est désormais **structurelle** plutôt qu'espérée : le moteur de
backtest expose `decision_suivante`, la décision qu'il avait en attente à la
dernière clôture, et le journal l'appelle. Le live et le backtest empruntent
le même chemin de code. Un test le verrouille sur chaque règle figée.

## Le glissement, enfin mesuré — et le modèle est conservateur d'un ordre de grandeur

Le modèle de coûts facture **3 bps de glissement par côté**, 15 bps
l'aller-retour frais compris. `costs.py` le dit lui-même : « en backtest sur
bougies, on ne voit pas le carnet : cette constante en tient lieu ». Elle
n'avait jamais été confrontée à une exécution — c'était la seule brique du
dépôt où une mesure gratuite était disponible et n'était pas prise.

Elle l'est maintenant, à deux endroits. `execution/glissement.py` mesure
l'écart entre le prix **décidé** et le prix **obtenu** à chaque fill, en
production ; `scripts/sonder_profondeur.py` fait passer une grille de tailles
dans le carnet réel du moment.

### La courbe, relevée sur carnets réels

```
  écart mid-ask            BTC      ETH      SOL
                          0,07     0,21     0,05  bps

       taille $           BTC      ETH      SOL
            100         +0,07    +0,21    +0,05
            500         +0,07    +0,21    +0,05
          2 000         +0,23    +0,21    +0,05
         10 000         +0,73    +0,21    +0,05
         50 000         +1,28    +0,21   +0,05*
        200 000         +1,58    +0,21   +0,05*
      1 000 000        +1,67*    +0,26   +0,05*
```

`*` = fill tronqué au-delà de 10 % du carnet visible : le chiffre
**sous-estime** alors le coût de l'ordre demandé.

### Ce que ça change, et c'est la sizing qui est concernée

**À la taille où le desk trade aujourd'hui — 33 $ par position — le
glissement vaut 0,05 à 0,21 bps contre 3,0 supposés.** Le modèle est
conservateur d'un facteur **quinze à soixante**.

Et le mur de liquidité est très loin : sur BTC, 200 000 $ coûtent encore
1,58 bps, sous l'hypothèse. Autrement dit, le constat n° 1 du manuel — le
desk prend 3,3 % du capital là où la validation en suppose 25 % — **ne se
heurte à aucune contrainte d'exécution**. Passer de 33 $ à 250 $ par position
ne coûte rien de mesurable. Ce qui bloquait était un garde-fou, pas le marché.

Le seul actif dont le carnet est mince est SOL : tronqué dès 50 000 $.

### Les trois réserves, et elles ne sont pas cosmétiques

**C'est UN instantané, sur un carnet calme.** Un jour de cascade n'a rien à
voir. Le script est fait pour être relancé pendant une panique et comparé —
c'est cette fourchette-là qui compte, pas une mesure d'un mardi après-midi.

**Le simulateur traverse un carnet FIGÉ.** Il ne modélise ni l'impact
permanent de l'ordre, ni le retrait des autres participants quand ils le
voient venir. Le papier reste optimiste, et un chiffre rassurant n'est pas
une garantie.

**Le style demandé n'est pas le rôle réalisé.** La mesure enregistre si
l'ordre était *passif* ou *agressif* au moment de la décision ; seul le
`Fill` de l'exchange porte `is_maker`. Passif et agressif ne sont jamais
moyennés ensemble : un ordre passif est servi au mieux à sa limite, donc son
glissement est nul ou négatif par construction, et les mélanger donnerait un
coût moyen qui ne correspond à aucune exécution réelle.

### Le sens de l'erreur compte plus que sa taille

Un modèle **optimiste** sous-estime le coût : tout ce qu'il a validé est
flatté d'autant, et c'est le sens qui condamne. Un modèle **conservateur**
rend les résultats prudents. Le panneau du desk affiche donc ce sens en
toutes lettres plutôt qu'un simple écart — un nombre sans son sens ne dit pas
s'il faut s'inquiéter.

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
- **Une pente sur onze points se retire point par point avant d'expliquer
  quoi que ce soit.** L'erreur-type n'y suffit pas : le bêta de −0,54 du
  portage avait t = −2,9 et disparaissait (+0,08) dès qu'on ôtait un seul
  mois. Cinq lignes de code, et la deuxième explication fausse ne serait
  jamais partie.
- **Toute corrélation de moyennes se double d'une corrélation de rang.**
  Trois actifs sur cinquante-trois ont retourné un −0,64 en +0,10. Si
  Pearson et Spearman ne s'accordent pas, il n'y a rien à écrire.
- **Une mesure faite hors du script n'est pas une mesure.** C'est un
  brouillon — et un brouillon finit par être cité.
- **Un contrôle dont on ne connaît pas l'amplitude ne contrôle rien.** Le nul
  par bloc des cotations avait une plage de décalage de [0, 25] jours,
  écrasée par un seul actif jeune : chaque tirage recouvrait l'observation.
  Il rendait un p élevé, ce qui ressemble exactement à un contrôle réussi.
  Tout modèle nul rapporte désormais la plage sur laquelle il a tiré, et se
  tait plutôt que de rendre un p sur trois observations.
- **Une hypothèse de coût se mesure dès qu'une exécution existe.** Les 3 bps
  de glissement du modèle ont vécu des mois sans être confrontés, alors que
  le mode PAPER s'exécute contre le carnet réel. Mesurés : 0,05 à 0,21 bps à
  la taille du desk. Toute constante posée « faute de mieux » doit porter la
  date à laquelle on la confrontera.
- **Une règle qui tourne doit être celle qui a été mesurée, et ça se
  vérifie.** Deux écarts silencieux ont été trouvés le même jour : un journal
  qui re-simulait l'état de position et ratait 18 % des ouvertures, et une
  règle que le moteur de risque aurait refusée sept fois sur dix. Aucun des
  deux ne se voit dans un résultat — seulement en confrontant la règle au
  moteur qui l'exécutera.
- **Une bougie n'est pas une exécution.** Un tiers des cotations Hyperliquid
  ont un volume nul le jour même — prix de marque, rien d'échangé. Un seul
  de ces faux rendements déplaçait une moyenne de vingt-cinq points de
  pourcentage. Tout ce qui se mesure sur des prix doit d'abord vérifier
  qu'ils étaient négociables.
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
- **La cotation d'un perpétuel est testée et réfutée** (ci-dessus). Elle
  laisse un acquis qui vaut plus que son verdict : un univers de 234
  perpétuels **sans biais du survivant**, délistés compris, que l'API permet
  de reconstituer et que personne n'avait vérifié. Toute étude en coupe de ce
  dépôt peut désormais s'en servir.
- **Le penchant de facteur est le piège récurrent de ce dépôt.** Le portage
  vendait des alts volatils contre des majeures ; les cotations violentes
  sont des memecoins. Dans les deux cas une exposition de classe se déguise
  en edge événementiel, et dans les deux cas c'est le nul qui respecte la
  dépendance — par bloc, ou par bêta — qui la démasque. Toute règle en coupe
  doit passer ce test AVANT qu'on regarde son rendement.
- **La règle des déblocages reste la seule qui ait passé la barre** (852
  événements, J−7 → J−1 à +236 bps contre +75 pour le hasard, p = 0,0010
  après Benjamini–Hochberg, dose-réponse monotone). L'étendre demande des
  sources de calendrier que le réseau de cette machine n'atteint pas —
  seul `api.hyperliquid.xyz` répond. C'est une limite d'accès, pas un
  résultat : la piste n'est ni confirmée ni infirmée au-delà de ce qui est
  déjà mesuré.

## L'épreuve unique — l'avocat du diable cesse d'être éparpillé

Idée reprise d'une conversation du 15 septembre 2026 avec un ami qui développe
un bot de trading : *« je veux affiner le système de notes pour que ce soit le
plus dur possible, un peu comme ton truc de dire il y a l'avocat du diable,
toujours quelqu'un qui vient dire et si il y a ça, et si il y a ça »*.

L'intuition est juste et sa mise en œuvre naturelle — durcir un barème — ne
l'est pas. Ce qui fabrique les faux positifs n'est pas la générosité du
barème, c'est **le nombre de candidates**. Trente-cinq combinaisons à
l'atelier ont donné douze cellules sous p = 0,05 ; le hasard pur en aurait
produit 1,8, et après correction il en reste zéro. Un barème deux fois plus
dur aurait gardé six cellules au lieu de douze, et il en resterait toujours
zéro de vraies : moins de faux positifs à la fois, pas moins **par vrai**.

Une note *agrégée* a un second défaut, plus insidieux : une bonne moyenne peut
masquer une épreuve fatale. Une règle dont 70 % des entrées seraient refusées
par le moteur de risque n'est pas « une règle un peu moins bien notée », c'est
une règle qui ne tournera jamais telle qu'elle a été mesurée. Aucune
pondération ne rend cette information à une moyenne.

D'où `src/trading_desk/epreuves.py` : sept épreuves indépendantes, chacune
rendant son verdict avec son motif, **un seul échec suffit**.

### Trois états, et le troisième est celui qui compte

    RETENUE      toutes les épreuves applicables sont passées
    REFUSÉE      au moins une a échoué
    INCOMPLÈTE   aucune n'a échoué, mais une épreuve exigée n'a pas pu tourner

**Une épreuve qui ne peut pas s'exécuter n'est pas une épreuve réussie.**
C'est le défaut par lequel ce dépôt s'est déjà fait avoir : le nul par bloc des
cotations tirait son décalage dans une plage bornée par le plus court
historique, si bien que chaque tirage recouvrait l'observation. Il ne pouvait
pas échouer. Il validait tout, et il a fallu le corriger pour découvrir que p
valait 0,164.

On distingue donc « sans objet » (l'épreuve ne concerne pas cette classe de
candidate — un nul par bloc n'a pas de sens sur un actif unique) de
« indisponible » (elle la concerne, la donnée manque). Le premier ne bloque
pas, le second rend INCOMPLÈTE.

### Ce que l'épreuve rend sur le registre réel

Passée sur les 35 combinaisons déjà inscrites :

    retenues 0 · incomplètes 0 · refusées 35

    ce qui les tue :
      15  trop peu d'aller-retours
      11  ne survit pas au dénominateur
       9  refus du moteur de risque

Le verdict d'ensemble reproduit le « zéro survivant » déjà connu, ce qui est
la moindre des choses. **Ce qui est neuf est la colonne des motifs.** Quinze
combinaisons sur trente-cinq meurent sur le nombre d'aller-retours : c'est une
propriété de la grille de paramètres, qui produit des stratégies trop lentes
pour l'échelle journalière choisie — et ça se corrige, contrairement à une
absence d'edge. Sans cette décomposition, les trente-cinq échecs se lisaient
comme un seul et même verdict de marché.

L'épreuve retrouve seule, depuis la ligne du registre, le refus à 70 % de
`tsmom_btc_1d` — le verdict qui avait demandé une analyse à la main et qui a
fait passer le dénominateur des règles figées de trois à deux.

### Deux défauts trouvés en la branchant, et ce qu'ils apprennent

**Le motif affiché masquait la cause.** `fatale` rendait la première épreuve
bloquante dans l'ordre du tuple ; une épreuve *indisponible* placée avant un
échec réel devenait le motif affiché. Le verdict annonçait REFUSÉE et la
raison affichée disait « donnée absente », ce qui envoie chercher la donnée
manquante au lieu de la vraie cause. Corrigé : un échec prime toujours sur une
indisponibilité. C'est le même défaut que ceux qu'on traque ailleurs dans ce
dépôt — un affichage qui ressemble à un résultat mais décrit autre chose.

**Le critère du retrait d'un mois était trop laxiste.** Le critère sans seuil
— « si retirer un mois rend le net non positif » — est exact mais ne mord que
sur le cas extrême : un mois portant 95 % du net le franchit tranquillement,
ce qui est précisément le défaut qu'on traque (le bêta du livre de portage
passait de −0,54 à +0,08 en retirant août 2026). Il a fallu y ajouter une
convention, et je préfère l'écrire que faire semblant qu'elle n'en est pas
une : au-delà de la moitié du net pour un seul mois, sur trois mois ou plus,
la candidate est refusée.

## La provenance — un dénominateur par origine

Reprise directe de la même conversation : *« c'est un des tags de catégorie
d'où ils viennent, la provenance de la recette »*. Le desk ne l'avait pas.

Chaque ligne du registre porte désormais une `origine` parmi `main`,
`balayage`, `llm`, `externe`, et **la correction de Benjamini–Hochberg porte
par origine**. Cinq cents cellules produites par un générateur et trois idées
tapées à la main ne sont pas le même espace d'hypothèses ; les corriger
ensemble est faux dans les deux sens — ça punit les trois idées réfléchies,
qui portent le poids statistique de cinq cents essais qu'elles n'ont pas
demandés, et ça absout les cinq cents, noyées dans un dénominateur où le seuil
au rang 1 devient si laxiste qu'il ne rejette plus rien.

Conséquence pratique, et c'est elle qui donne sa valeur au champ : **une
stratégie importée de l'extérieur ne pollue pas le dénominateur des nôtres, et
inversement.** L'échange de recettes devient possible sans casser la
statistique de personne.

Une ligne sans origine — écrite avant que le champ existe — est rattachée à
`main` plutôt qu'ignorée. L'ignorer retirerait des hypothèses réellement
testées du dénominateur, ce qui rendrait la correction plus laxiste : l'erreur
exacte que le registre en ajout seul existe pour empêcher.

## La jambe de couverture — la capacité est prête, le branchement est bloqué

La validation de la règle des déblocages mesure deux versions : la vente à
découvert **nue** et la même position **adossée** à un achat de BTC pour le
même notionnel.

    version       Sharpe    repli
    nue             1,80    15,3 %
    adossée         2,46     7,9 %

L'adossée est la seule dont le résultat soit attribuable aux déblocages : la
nue est courte sur des alts pratiquement chaque semaine de la période, donc
son résultat contient une exposition courte permanente au marché, qui a
rapporté ou coûté indépendamment de tout déblocage. Le desk déployé ne passe
que la jambe courte.

### Ce qui a été livré

`size_position` accepte un `notionnel_cible`. Une jambe adossée part du
notionnel de la paire qu'elle couvre au lieu du budget de risque — une
couverture n'est pas une prise de risque indépendante, elle *réduit*
l'exposition du livre, et la dimensionner par le budget de risque donnerait
une taille sans rapport avec ce qu'elle couvre.

**Le paramètre ne fait sauter aucun plafond.** Notionnel par position,
notionnel brut, levier, marge et bande de stop continuent de s'appliquer.
Quand un plafond rabote la couverture sous sa cible, `couverture_partielle`
passe à vrai : le livre n'est alors neutre qu'en partie, et cette exposition
résiduelle n'a été décidée par personne — elle doit remonter, pas être avalée.

### Ce qui bloque le branchement, et ce n'est pas un détail

**Le contrat de sortie est indexé par nom d'actif.** `sorties()` rend des
chaînes, et le pupitre appelle `flatten(asset, size=position.size)` — la
position *entière*. Sur un exchange qui nette, une jambe longue BTC de
couverture et la position de `turtle_btc_1d` sont **une seule position**.

Conséquence mesurée par `tests/test_couverture.py` : quand la fenêtre d'un
déblocage se referme, le pilote demande la sortie de BTC, le faisceau en fait
l'union — comportement correct et délibéré dans le cas général — et le pupitre
ferme aussi la position de la règle gelée. Qui rentrerait au signal suivant,
en payant l'aller-retour.

L'asymétrie est nette et le test la fige : à l'**entrée**, le faisceau sait
router la confirmation vers la bonne source, par identité d'objet. À la
**sortie**, il n'a aucun moyen équivalent.

### Les deux façons d'en sortir

**Changer de référence** pour un actif qu'aucune règle gelée ne trade. C'est
une ligne de configuration — mais la validation a mesuré BTC, et changer la
référence change la stratégie. Il faudrait la remesurer, donc dépenser une
hypothèse de plus.

**Donner au contrat de sortie une identité de position.** C'est la correction
juste, et elle est plus lourde qu'il n'y paraît : il faut attribuer les parts
d'une position nettée à chaque source qui la détient, comptabilité que
l'exchange ne fournit pas. C'est un vrai morceau, pas un drapeau.

Tant que l'une des deux n'est pas tranchée, **la jambe de couverture reste
débranchée**, et l'écart Sharpe 1,80 contre 2,46 subsiste.

## Le seuil de rentabilité d'une couche d'IA — une division, pas une opinion

Cadrage repris de la même conversation. L'ami en question a la discipline que
ce dépôt n'avait pas : *« si tous mes agents tournaient en IA, c'était
800 boules par mois ; avec le modèle que j'ai là, ça me coûte 54 dollars par
mois — faut que je gagne plus de 50 boules pour être rentable »*. Et la phrase
qui contient une question chiffrable : *« ça deviendrait rentable qu'à partir
de grosses sommes à lui confier »*.

`src/trading_desk/rentabilite.py` calcule la réponse. Le coût par cycle est
mesuré (0,1335 $, campagne du 8 septembre 2026), les rendements aussi (≈5 %/an
à la taille déployée, ≈48 %/an à la taille validée). Le seuil n'est qu'une
division.

    cadence                    facture    seuil à 5 %/an   seuil à 48 %/an
    un cycle par jour        4,06 $/mois           997 $             122 $
    un cycle par heure      97,53 $/mois        23 939 $           2 937 $
    un cycle par quart d'h. 390,12 $/mois        95 755 $          11 747 $

Sur les 1 000 $ du desk, au rythme d'un cycle par heure : **97,53 $ de facture
mensuelle pour 4,07 $ de gain, soit 23,9 fois le gain.** Même à la taille
validée — 40 $ de gain mensuel — la facture reste deux fois et demie le gain.

Les deux colonnes de seuil sont **l'écart de taille du desk vu par le coût**.
Le même bloc revient par une autre porte : à la taille déployée il faut
vingt-quatre mille dollars pour payer une IA horaire ; à la taille validée,
moins de trois mille.

### L'erreur commise en écrivant ce module, et son sens

La première version divisait le rendement annuel par douze. C'est faux, et
**faux du mauvais côté** : à 48 %/an la division naïve rend 4,00 % par mois,
alors que le taux qui compose réellement à 48 % sur douze mois vaut
`1,48^(1/12) − 1`, soit 3,32 %. Elle surestimait donc le gain de vingt pour
cent, et le seuil de rentabilité d'autant — elle faisait paraître une couche
d'IA plus abordable qu'elle ne l'est.

Le module sert à décider s'il faut payer. Quand une approximation doit
pencher, elle penche du côté qui ne fait pas dépenser.

### La règle mécanique, et pourquoi elle est mécanique

`agents_muets()` liste les agents qui ont coûté sans jamais émettre de mandat.
Ceux du dépôt en sont à zéro mandat sur toute la campagne. **La règle proposée
est mécanique et c'est le point** : un agent sans mandat après un nombre de
cycles donné est débranché, pas débattu. Tant que la décision reste une
discussion, elle se reporte et la facture continue.

Deux garde-fous, parce qu'une règle mécanique mal bornée coupe ce qu'il ne
faut pas : un seuil de cycles, pour qu'un agent branché la veille ne soit pas
jugé sur trois cycles ; et zéro appel ne vaut pas « muet » — c'est un agent
déjà débranché, et le compter gonflerait la liste de faux positifs qu'on
apprendrait à ignorer.

Le module ne débranche rien. Couper un agent est une action ; il ne fait que
chiffrer.

## La taille de position — personne ne l'a choisie

Le desk prend **3,3 % du capital** par position là où la validation de la
règle des déblocages en suppose **25 %**. L'écart vaut, composé sur la période
mesurée, ≈5 %/an contre ≈48 %/an. C'était le premier constat du manuel, et il
manquait la chose qui explique pourquoi il a pu vivre des mois sans être vu.

**Les 3,3 % ne sont le réglage de personne.** Ils tombent d'une division :

    fraction du capital = risque par trade / distance au stop
                  3,3 % =          0,5 %    /        15 %

Le budget de risque a été fixé à 0,5 % parce que c'est une prudence classique.
Le stop a été posé à 15 % parce que les jetons concernés bougent de plus de
5 % par jour et qu'un stop serré sortirait au bruit. Ni l'un ni l'autre n'a été
choisi en pensant à la taille de position, et leur quotient n'apparaît dans
aucun fichier de configuration.

C'est la forme la plus courante d'un réglage qui dérive : **un nombre que
personne n'a posé et que personne ne relit**, parce qu'il n'est écrit nulle
part.

`src/trading_desk/risk/fraction.py` le calcule, l'affiche, et donne son
inverse — le chiffre actionnable : **pour viser 25 % avec un stop de 15 %, il
faut régler le risque par trade à 3,75 %**. Sept fois et demie la valeur
actuelle. Écrit comme ça, ça se voit et ça se discute.

La formule est confrontée au moteur de risque lui-même, à trois distances de
stop, plutôt qu'affirmée : une formule qui ressemble au moteur sans en être
l'image afficherait un chiffre faux avec l'autorité d'une mesure.

Les plafonds sont traduits dans la même unité que la fraction — ils sont en
dollars, elle est en pourcent, et tant qu'ils ne sont pas comparables la
question « peut-on monter à 25 % ? » n'a pas de réponse. **Réponse : aucun
plafond ne mord.** Sur 1 000 $, 250 $ par position contre un plafond de 500 $,
un notionnel brut de 1 000 $ et un levier de 3×.

**La valeur déployée n'est pas changée.** Rendre un réglage visible et le
modifier sont deux actes différents ; le second appartient à qui porte le
risque.

### Un mensonge d'écran, corrigé au passage

En regardant la ligne rendue, le résumé de la règle déployée disait *« vendre
à découvert avant un déblocage de jetons, **adossé à BTC** »*. La jambe de
couverture n'est pas branchée. L'écran affirmait une neutralité de marché que
le desk n'a pas — et c'est exactement la classe de défaut que ce dépôt traque
partout ailleurs : un affichage qui ressemble à un état mais en décrit un
autre. Le résumé dit désormais que la jambe est absente, et ce qu'elle
coûterait.

## L'identité de position — ce qui débloque l'adossement

La section précédente sur la jambe de couverture s'arrêtait sur un blocage :
le contrat de sortie était indexé par nom d'actif, et le pupitre appelait
`flatten(asset, size=position.size)` — la position *entière*. Sur un exchange
qui nette, une jambe longue BTC de couverture et la position de
`turtle_btc_1d` sont **une seule position**, et la fin de fenêtre d'un
déblocage fermait donc la règle gelée.

Le blocage est levé. Trois pièces.

### 1 · La sortie porte la source qui la demande

`Faisceau.sorties()` rend des `Sortie(asset, source)` au lieu de chaînes.
L'union reste, et reste juste : une entrée est une prise de risque sur
laquelle on veut l'accord de la source qui la porte ; une sortie réduit le
risque, et la refuser parce qu'une *autre* source ne la demande pas garderait
une position que sa propre règle veut fermer. **Ce qui était faux n'était pas
l'union, c'était ce qu'elle rendait.**

Détail qui compte : la même demande émise par deux sources n'est pas un
doublon. Deux sorties sur BTC ferment deux parts différentes, et les
dédupliquer par actif en perdrait une — une part resterait ouverte sans que
rien ne le dise, soit le défaut d'origine retourné. La déduplication porte
donc sur `(source, actif)`.

### 2 · Le registre des parts

`execution/parts.py` tient qui détient quelle part de chaque actif. La part
est inscrite **après** l'ouverture réussie et **au propriétaire que le
faisceau désigne** — jamais deviné. Inscrire à la demande attribuerait une
part que le moteur de risque a peut-être refusée ; deviner le propriétaire
autoriserait une source à fermer ce qui ne lui appartient pas.

### 3 · La réconciliation, ou le même bug déplacé d'un cran

Une position peut diminuer sans que le desk le demande : stop touché,
liquidation partielle. Un registre qui annoncerait encore l'ancienne taille
laisserait une source fermer plus que sa part — donc la part d'une autre.
**L'état du compte est la vérité, le registre n'est qu'une attribution.**

`reconcilier()` tourne à chaque cycle, avant les sorties, et rend la liste des
actifs corrigés : une correction silencieuse serait le pire cas, le registre
redevenant juste sans que personne ne sache qu'il avait cessé de l'être.

Le rattrapage se fait **au prorata**, et c'est un choix qui mérite d'être dit :
quand un stop rogne une position partagée, rien ne dit *laquelle* des deux
sources a été rognée — c'est une seule position chez l'exchange, l'information
n'existe pas. Le prorata ne privilégie personne ; faire porter la perte à une
source désignée inventerait une information.

Et une position inconnue du registre n'est **pas adoptée**. Une position
ouverte hors du desk — reprise après redémarrage, geste manuel —
n'appartient à aucune source, et lui attribuer un propriétaire autoriserait
cette source à la fermer.

### Ce que le test prouve, et pourquoi il passe par un vrai pupitre

    ouvertures : 2        positions : BTC 10,0000    (l'exchange nette)
    parts      : deblocages 5,0000 · regles_figees 5,0000

    après la sortie de `deblocages` :
    positions  : BTC 5,0000
    parts      : regles_figees 5,0000

Avant la correction, les dix unités partaient. Le test traverse le chemin
complet — faisceau, registre, dimensionnement, ordre, fill — parce que chaque
pièce prise seule passait déjà *avant* la correction : c'est leur assemblage
qui était faux.

Un second test fige le pendant : une source unique qui rend une chaîne nue
ferme toujours la position entière. Sans lui, le premier pourrait passer parce
que la fermeture partielle serait devenue le *seul* comportement, ce qui
casserait tous les desks à une source en silence.

### Et les parts sont visibles

Le registre remonte au snapshot et s'affiche sous l'actif dès qu'il y a plus
d'un propriétaire. Un écran qui afficherait « BTC 10 unités » sans dire à qui
elles appartiennent cacherait exactement l'information qui permet de savoir ce
qu'une sortie va fermer — et c'est ce silence qui a permis au défaut de vivre.
Dans un dépôt dont tout l'objet est la supervision, un registre juste mais
invisible revient à ne pas l'avoir.

## La jambe adossée, branchée

Avec l'identité de position en place, la couverture peut enfin exister. Mesure
réelle sur un desk papier, un déblocage sur PYTH :

    cycle 1   PYTH  COURT  833,3333 unités   notionnel  333,25 $
    cycle 2   BTC   LONG     3,3333 unités   notionnel  333,36 $

Le livre est neutre au marché. Trois choses méritent d'être dites.

**La couverture arrive au cycle SUIVANT, et c'est nécessaire.** Son notionnel
doit être celui qui a *réellement* été rempli, pas celui qui a été demandé :
le moteur de risque peut avoir raboté la jambe courte, et un livre adossé de
travers n'est pas un livre adossé. La taille remplie traverse donc le pupitre
et le faisceau jusqu'au pilote, par une confirmation dont l'arité est
**inspectée et non devinée** — un `try/except TypeError` prendrait une vraie
erreur levée *dans* `confirmer` pour un désaccord de signature, et la source
croirait avoir confirmé.

**Le stop de la couverture est une concession qu'il faut voir.** L'invariant
« aucune position sans stop » n'est pas négociable : c'est la distance au stop
qui donne la taille, donc une position sans stop n'est pas une position non
protégée, c'est une position sans taille. La couverture reçoit le même stop en
pourcentage que sa paire. Conséquence : si ce stop est touché, le livre
redevient nu alors que la jambe courte est encore ouverte. Sur BTC, à 15 %,
c'est rare — mais le taire serait prétendre à une neutralité que le desk n'a
pas toujours.

**La couverture ne sort que quand la DERNIÈRE jambe courte sort.** Le contrat
de sortie ferme toute la part d'une source sur un actif ; sortir BTC dès
qu'une jambe courte se ferme fermerait aussi la couverture des autres, encore
ouvertes. C'est le même défaut qu'on vient de corriger, un cran plus bas.

### Le réglage, et ce qu'il coûte

`DESK_DEBLOCAGES_ADOSSES` — **faux par défaut, et ce n'est pas de la
timidité.** Adosser double le nombre de positions ouvertes : avec le plafond
de deux positions simultanées, un seul déblocage adossé occupe tout le desk.
Relever ce plafond est une décision distincte, qui se prend en sachant ce
qu'elle coûte.

Et l'écran lit le réglage. Le résumé de la règle déployée a dit « adossé à
BTC » pendant des semaines alors que la jambe n'était pas branchée :
l'interface affirmait une neutralité de marché que le desk n'avait pas. Un
test le verrouille désormais dans les deux sens — un texte codé en dur
redeviendrait faux au premier changement.

## Les séquences d'événements — et le piège que je me suis tendu moi-même

L'idée vient de la conversation : *« la big stratégie, c'est qu'il y a une
stratégie par événement — dès qu'il détecte trois, quatre événements qui se
succèdent dans un ordre, il se réfère à tous les moments dans l'histoire où
ces quatre événements se sont produits à la suite »*.

La seule voie honnête était de figer le vocabulaire avant de mesurer.
`vocabulaire_evenements.py` a donc été **commité seul**, avant qu'une ligne de
mesure n'existe : l'historique git est la preuve qu'aucun ajustement n'a suivi
un résultat.

### La version 1 s'était déclarée mesurable, et ne l'était pas

Elle déclarait 72 hypothèses — huit types d'événements, longueurs 1 et 2 — et
vérifiait que le criblage pouvait voir : plancher de p à `1/(TIRAGES+1)` =
0,0002, sous le seuil de Benjamini–Hochberg au rang 1 de 0,05/72 = 0,00069.
La vérification était juste. **Elle portait sur le mauvais plancher.**

Le nombre de réalisations distinctes d'un nul **par bloc** est le nombre
d'offsets disponibles, pas le nombre de fois qu'on en tire un. Un nul par bloc
décale tous les événements d'un même offset ; tirer cinq mille fois dans une
plage de cent-dix offsets ne produit pas cinq mille nuls, il en produit
cent-dix, rééchantillonnés. Le plancher réel vaut `1/(plage+1)`, et la plage
est fixée par la donnée.

C'est la classe de défaut habituelle de ce dépôt, cette fois appliquée à mon
propre contrôle : une vérification qui ressemble à une garantie et garantit
autre chose.

### Ce que la donnée porte, et pourquoi on ne peut pas en acheter plus

    seuil d'historique   actifs   délistés   plage   hypothèses max
              300 j        216     21,8 %     110          5
              365 j        202     21,3 %     171          8
              500 j        179     17,9 %     302         15
              730 j        127     11,8 %     532         26

La colonne qui décide n'est pas la dernière, c'est l'avant-dernière.
**Relever le seuil d'historique réintroduit le biais du survivant** : un
perpétuel délisté est court par construction, et l'univers de 234 perps avait
été collecté précisément pour ne pas avoir ce biais. Acheter de la résolution
en montant le seuil revient à payer avec la seule propriété rare de cet
univers.

À 365 jours la part de délistés passe de 23,9 % à 21,3 % — à peu près rien —
et la donnée porte exactement huit hypothèses.

### Version 2, et la réponse à donner sur les séquences

Les huit événements **seuls**, sans les paires. Le changement est dicté par la
résolution du contrôle et la composition de l'univers, deux quantités
calculées sans avoir regardé un seul rendement — c'est ce qui le distingue
d'un ajustement.

Le nul devient **exhaustif** plutôt qu'échantillonné : on énumère les 172
offsets de la plage au lieu d'en tirer. Strictement meilleur, et ça supprime
la graine, donc la question « et si on avait tiré autrement ».

**La réponse sur l'idée des séquences est : pas sur cette donnée.** Soixante-
quatre paires exigent une plage de 1 280 offsets, donc plus de 1 480 jours
d'historique commun à tous les actifs retenus. Aucun univers de perpétuels
crypto sans biais du survivant ne l'offre aujourd'hui.

### La mesure

Contrôle du nul d'abord : **0 décalage effectif nul sur 34 744**, médiane
185 jours. Le contrôle peut échouer, donc il contrôle quelque chose.

    séquence              observations   moyenne         p
    ecart_bas                      134   +442,54 bps   0,0289
    serie_baissiere               4730   +194,66 bps   0,1098
    cassure_haute                 6207    +77,69 bps   0,4162
    ecart_haut                     168   +115,59 bps   0,4682
    serie_haussiere               3249    −65,40 bps   0,6705
    volume_extreme               13571    +21,71 bps   0,6879
    cassure_basse                 8746    +42,96 bps   0,7110
    amplitude_extreme             4624    +22,74 bps   0,7746

**8 testées · 1 à p < 0,05 · 0,4 attendues par hasard · 0 survivante.**

Une cellule brute là où le hasard en produit 0,4 : c'est exactement ce que le
hasard produit. `ecart_bas` passe six épreuves sur sept et meurt au
dénominateur — seuil BH au rang 1 de 0,00625 contre un p de 0,0289. Et ce p
n'est pas un artefact de plancher : il est cinq fois au-dessus des 0,00578.

La septième famille d'événements rejoint donc les six autres au cimetière.

## La poussée — rendre l'écart de taille physique

Dernière idée de la conversation : *« tes profits génèrent la poussée de ton
vaisseau, du coup tu parcours une distance ; ce serait génial d'avoir un
onglet dans le cockpit où tu as ta position en direct »*.

Ça peut passer pour de la décoration. Ça n'en est pas, pour une raison
précise : **la partie la plus dure de la discipline des règles figées est de
ne pas y toucher pendant trois mois.** Un tableau de p qui ne bouge pas ne
donne envie de rien. Une distance qui avance, si.

### L'unité n'est pas arbitraire, et c'est ce qui la rend utile

Un kilomètre par dollar n'aurait rien voulu dire. L'échelle est calée sur
**un tour de Terre = une année à la taille validée** :

    40 075 km / 480 $ par an (48 %/an sur 1 000 $) = 83,49 km par dollar

Conséquence, et c'est elle qui fait passer le compteur de joli à utile :

    repère                                sur un an   tours de Terre
    taille déployée (3,3 % du capital)     4 174 km        0,10
    taille validée  (25 % du capital)     40 075 km        1,00

**À la taille déployée, une année entière fait un dixième de tour.** L'écart
du bloc 3 cesse d'être une ligne dans un tableau et devient quelque chose
qu'on voit ne pas avancer.

### Ce que le module refuse de faire

Aucune taille virtuelle, aucune projection, aucun « ce que ça aurait donné ».
**La distance est le PnL réalisé et rien d'autre.** Un compteur qui afficherait
ce que le desk *aurait* parcouru à pleine taille donnerait la satisfaction
sans le résultat, ce qui est exactement l'inverse de ce qu'on attend d'un
instrument. Les deux repères encadrent le compteur ; ils ne le gonflent pas.

Trois refus, chacun verrouillé par un test :

- **Un PnL indisponible reste indisponible.** Position ouverte, le cumul de
  trésorerie mélange du réalisé et du coût d'entrée ; l'afficher comme une
  distance ferait reculer le vaisseau à chaque ouverture et avancer à chaque
  fermeture. Un compteur qui oscille avec les entrées ne mesure rien.
- **Une perte recule le vaisseau.** Un compteur qui ne saurait qu'avancer
  serait un jeu vidéo.
- **Un desk à l'arrêt n'arrive jamais**, et le panneau le dit ainsi plutôt que
  d'afficher un très grand nombre de jours, qui laisserait croire à une
  progression lente.

### Un motif d'écran faux, attrapé en regardant la page

Le panneau annonçait *« position ouverte »* sur un desk qui n'a jamais rien
exécuté — ce qui envoie chercher une position inexistante. Deux absences
différentes appellent deux motifs différents. C'est la même classe de défaut
que le « adossé à BTC » sans jambe de couverture, et elle ne se voit qu'en
ouvrant la page.

## Les trois règles d'un agent LLM externe — mesurées

Un agent a produit un rapport annonçant trois stratégies rentables sur
BTC/ETH/SOL en 1 h, fenêtre fév→sep 2026, frais 3,5 bps par côté. Elles sont
implémentées fidèlement (`supertrend`, `donchian_ema_be`,
`momentum_residuel`), inscrites au registre avec **`origine="llm"`** — donc
avec leur propre dénominateur — et passées au modèle nul et à l'épreuve.

### Ce que le rapport annonce, et ce que la mesure rend

Avec **le modèle de coûts du rapport lui-même** (3,5 bps/côté, sans
glissement ni funding), sur les trois actifs :

    stratégie            annoncé PF   mesuré PF   annoncé        mesuré net
    supertrend                 1,92        0,88   +0,22 R          −85,44 $
    donchian_ema_be            1,24        1,01   +0,11 R          +10,45 $
    momentum_residuel          1,28        1,46   +0,11 R          +80,24 $

Le profit factor est **sans échelle** : il ne dépend ni du capital ni du
dimensionnement, donc 1,92 contre 0,88 ne peut pas s'expliquer par une
convention de taille. Le repli maximal non plus : −9,1 % mesuré sur BTC contre
−2,3 % annoncé.

**Le classement du rapport est inversé par la mesure.** Celle qu'il met en
priorité desk (★, « Paper : ON ») est la seule nettement perdante ; celle
qu'il écarte explicitement (« pas en paper pour l'instant ») est la seule qui
gagne — et son propre caveat était juste, l'edge est sur SOL.

### Ce que j'ai éliminé avant de conclure

Une implémentation infidèle ne réfute rien : elle mesure une quatrième
stratégie que personne n'a proposée. Quatre causes testées :

- **le nombre de trades colle** — 119/133/131 mesurés contre 120 annoncés pour
  `supertrend`, donc la logique d'entrée est la bonne ;
- **le modèle de coûts** — testé avec celui du rapport, celui du desk et le
  glissement réellement mesuré (0,21 bps) : le signe ne change pas ;
- **la sémantique de sortie** — « stop = ligne Supertrend (trail) » se lit de
  deux façons, stop dur sur la ligne ou sortie au retournement à la clôture.
  Les deux ont été mesurées : PF 0,73–0,79 et 0,61–1,12. Aucune ne rejoint
  1,92 ;
- **l'entrée à l'ouverture suivante** plutôt qu'à la clôture du signal : écart
  moyen mesuré de **+0,01 bps sur BTC et −0,09 bps sur ETH**. Négligeable.

### Le modèle nul, et l'épreuve

    cellule                  trades      net        p        verdict
    supertrend BTC              108   −31,02   0,4873   non distinguable
    supertrend ETH              129   −92,76   0,8336   non distinguable
    supertrend SOL              131   +16,72   0,1954   non distinguable
    donchian_ema_be BTC         140   −31,39   0,2299   non distinguable
    donchian_ema_be ETH         141    −4,78   0,2574   non distinguable
    donchian_ema_be SOL         152   −49,20   0,4698   non distinguable
    momentum_residuel BTC         0     0,00        —   aucun trade
    momentum_residuel ETH        35    +3,92   0,3458   non distinguable
    momentum_residuel SOL        54   +54,57   0,0130   BAT LE HASARD

Une cellule sur neuf bat le hasard. Le seuil de Benjamini–Hochberg au rang 1
sur huit cellules testées vaut 0,00625 ; p = 0,0130 ne passe pas. **Neuf
refusées sur neuf**, et le taux de refus du moteur de risque est nul partout —
l'obstacle n'est pas l'exécutabilité.

### Le détail qui tranche : c'est un mois

Les deux cellules positives de `momentum_residuel` et celle de `supertrend`
meurent toutes sur **l'épreuve du retrait d'un mois**, et c'est le même mois.

    toutes cellules confondues
      août 2026 . . . . . . . . . . . . +84,59 $
      tous les autres mois réunis . . . −218,53 $

Retirer août 2026 fait passer `supertrend SOL` de +16,72 à −16,70 $, et
`momentum_residuel ETH` de +3,92 à −16,77 $. Février est le second mois
porteur. Sur huit mois d'historique, deux portent tout le résultat — c'est la
définition d'un épisode, pas d'un edge.

### Un bug de ma part, et ce qu'il apprend

`MomentumResiduel` allait chercher l'intervalle sur `bars[0].interval`, un
attribut que le contrat `Bar` ne porte pas. L'`AttributeError` tombait dans un
`except Exception` large, le résiduel rendait des `None` partout, et la
stratégie produisait **zéro trade en silence**. Ça se lisait comme un résultat
(« aucun signal ») au lieu d'un bug.

Un test sur le nombre de trades l'aurait laissé passer. Celui qui l'attrape
regarde la grandeur intermédiaire — combien de résiduels ont été calculés — et
c'est la leçon : quand une absence peut être un résultat, il faut tester ce
qui la produit, pas ce qu'elle produit.
