# Interface — ce que chaque panneau afficherait aujourd'hui

**Écrit le 9 septembre 2026, avant de coder.** Le cahier des charges décrit
sept panneaux. Trois seraient vides, deux montreraient des réfutations, et
deux ont de vraies données. Ce document dit lesquels, pourquoi, et ce que je
propose de mettre à la place — rien n'est retiré en silence.

## Le tableau, sans ménagement

| panneau demandé | données réelles au 9 septembre |
| --- | --- |
| Trades en cours | **AUCUN.** Le desk n'a jamais émis un seul mandat |
| Historique des transactions | **VIDE.** Aucun ordre n'a jamais été passé |
| Graphique P&L | **rien à tracer.** Un axe des temps et une ligne plate à zéro |
| Stratégies existantes | 6 stratégies, **1 survivante sur 56 cellules** testées |
| Courbe stratégie contre HODL | traçable en backtest, mais toutes les courbes racontent le même échec |
| Collecte live | **réelle.** Le VPS enregistre 7 actifs × 4 canaux depuis le 6 septembre |
| Création de stratégies | possible : le moteur de backtest et le modèle nul existent |

## Pourquoi les trois premiers sont vides

Ce n'est pas une panne, c'est le résultat. Le desk a tourné 31 cycles réels
le 8 septembre : **19 setups proposés, 19 arrêtés à la porte du score,
0 mandat.** Le desk agentique est de surcroît gelé jusqu'au 1er octobre, le
plafond de dépense API étant atteint.

Un panneau « P&L » affichant une ligne plate mentirait par omission : il
suggérerait qu'on a tradé et fait zéro. La vérité est qu'on n'a pas tradé.

## Ce que je propose à la place — et pourquoi ça sert le thème

L'analogie aéronautique tombe juste, et pas seulement esthétiquement :
**c'est un appareil dont les systèmes sont sous tension et dont les moteurs
n'ont jamais été démarrés.** Un cockpit avant décollage n'est pas un cockpit
vide — c'est un cockpit qui affiche une liste de vérifications.

Cinq panneaux, tous alimentés par des données réelles :

**PRÉ-VOL** — la liste de vérifications, avec ce qui bloque le décollage.
Chaque ligne est verte, orange ou rouge, et dit ce qui manque. C'est le
panneau qui remplace « trades en cours » : il explique pourquoi il n'y en a
pas.

**TÉLÉMÉTRIE** — la collecte live. Fichiers Parquet écrits, actifs suivis,
canaux vivants, dernier battement. C'est le seul système réellement en
marche, et il tourne 24 h/24 sur le VPS.

**NAVIGATION** — le journal hors échantillon des déblocages. Quinze
positions inscrites, la première fenêtre se ferme le 13 septembre. **C'est
ce qui ressemble le plus à des « trades en cours »**, à ceci près qu'aucun
ordre n'est passé : ce sont des prédictions datées, inscrites avant les
faits.

**SOUFFLERIE** — les campagnes de validation. Six stratégies, quatre
déclencheurs, 269 cellules de déblocages, 447 sociétés pour la réplication
actions. C'est le vrai contenu de « performances des stratégies », et il est
majoritairement négatif — ce qui est l'information.

**CONSOMMATION** — le coût par décision, la qualité de schéma par agent, la
distribution des scores. Le desk coûte 0,0826 $ par cycle et 803 $/mois en
balayage périodique contre 1,30 $ sur déclencheur.

## Ce qui est reporté, pas supprimé

**Le graphique P&L et l'historique** sont construits mais restent vides
jusqu'au premier mandat. Le code sera là ; il affichera « aucun vol
effectué » plutôt qu'un zéro trompeur.

**La courbe contre HODL** existe déjà dans le moteur de backtest
(`benchmark_buy_and_hold`). Elle sera branchée sur les stratégies
existantes — elle montrera qu'elles perdent, ce qui est le résultat mesuré
et mérite d'être vu.

**La création de stratégies** commence par la documentation et le lancement
d'un backtest depuis l'interface. Un éditeur de stratégie dans le navigateur
viendra après, s'il se révèle utile — écrire une stratégie en Python dans un
fichier reste plus rapide que dans un formulaire.

## Ce que j'ajoute, et que le cahier des charges ne demandait pas

**Le coupe-circuit**, déjà présent dans le serveur : un bouton qui arrête le
desk sans dépendre de l'état du reste du système. Sur un tableau de bord de
trading, c'est la seule commande qui doit fonctionner exactement quand tout
va mal.

**Le compteur de dépense API**, parce que la campagne du 8 septembre s'est
arrêtée sur un plafond atteint sans que personne ne le voie venir.

## Une chose que l'interface ne fera pas

Elle ne passera **aucun ordre**. Le serveur écoute sur `127.0.0.1`, il peut
arrêter le desk mais pas le faire trader. Un tableau de bord qui peut ouvrir
une position est un tableau de bord qu'on peut cliquer par erreur.
