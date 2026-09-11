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
hasard (p = 0,53). Le livre porte un bêta de −0,54 au marché.

C'est un résultat, pas un échec. Il dit où ne pas mettre d'argent — et,
dans les deux cas, la raison pour laquelle on avait cru le contraire.

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
retenir, parce que c'est exactement la forme qu'a un risque caché. Un seul
mois porte la perte : août 2026, marché +42,1 %, livre −36,2 %. Le
diagnostic le dit sans détour — corrélation au marché **−0,70**, bêta
**−0,54**. Le livre n'est pas neutre, c'est un short déguisé.

Et la raison est économique, pas statistique : un financement élevé marque
un actif que tout le monde achète avec levier. Vendre le financement élevé,
c'est vendre le momentum. La stratégie a « marché » huit mois parce que le
marché baissait huit mois ; elle a rendu l'année entière au premier mois de
hausse. Un test qui se serait arrêté en juillet aurait conclu l'inverse.

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

## Ce qui reste ouvert

- Aucune stratégie directionnelle testée ne franchit la barre. Avant d'en
  ajouter une sixième, se rappeler que chaque stratégie ajoutée augmente le
  nombre d'hypothèses, donc de faux positifs attendus.
- Le financement en coupe transversale est testé et réfuté (ci-dessus). Il
  reste la structure de terme, et les écarts entre plateformes — mais la
  leçon du portage vaut d'avance pour eux : **décomposer avant de conclure**.
  Un net positif obtenu en perdant sur la source de rendement annoncée et
  en gagnant ailleurs n'est pas la stratégie qu'on croit tester.
- Mesurer le bêta au marché de toute stratégie dite « neutre », et le
  mesurer *avant* de regarder le net. Le portage affichait huit mois
  positifs sur onze ; c'est son bêta de −0,54, pas son total, qui disait ce
  qu'elle était.
