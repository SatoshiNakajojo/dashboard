# Pistes parquées — ce qui est nommé mais pas construit

Le briefing demande des **stubs seulement** pour quatre pistes. Ce document
les nomme, dit ce qu'on en sait déjà, et ce qu'il faudrait pour les ouvrir.
Aucun code n'est écrit pour elles : un module vide qui porte un nom
prometteur est une dette qui a l'air d'un actif.

## Séquences d'événements

**État : mesuré, et la conclusion est « pas sur cette donnée ».**

L'idée — détecter trois ou quatre événements qui se succèdent, puis chercher
tous les moments de l'histoire où la même séquence s'est produite — a été
déclarée, figée et mesurée. Résultat : les paires de deux événements exigent
une plage de 1 280 décalages pour un nul par bloc valide, donc plus de
1 480 jours d'historique **commun à tous les actifs retenus**. Aucun univers de
perpétuels crypto sans biais du survivant ne l'offre.

Les huit événements seuls ont été testés : une cellule sur huit à p < 0,05,
0,4 attendue par hasard, zéro survivante.

**Pour l'ouvrir** : un univers avec plus d'historique commun, ou un modèle nul
dont la résolution ne dépende pas d'un décalage commun. Le second est un
problème de méthode, pas de données.

## Farm de funding

**État : non construit. Le portage a été réfuté deux fois.**

Le portage de financement rendait +10,73 % avant correction. Le gain venait de
la **composition des jambes** — bêta +1,00 contre +0,79 — pas du financement.
La version relative, censée corriger ça, ramène la récolte à +2,00 %.

Le farm de funding n'est pas la même chose que le portage, et il n'est pas
disqualifié par ces mesures. Mais il en hérite l'avertissement : **une
exposition de classe se déguise facilement en edge de financement**, et c'est
le modèle nul respectant la dépendance qui la démasque.

**Pour l'ouvrir** : déclarer avant de regarder quels actifs, quelle fenêtre,
quel seuil de taux — et prévoir le nul par bloc dès la déclaration.

## S&P sur Hyperliquid

**État : non construit, et non prioritaire.**

Un indice large sur un perpétuel a une volatilité sans rapport avec celle des
alts : le profil est proche d'un ETF. Les règles du dépôt sont calibrées sur
des jetons qui bougent de plus de 5 % par jour — la bande de stop
[30, 1600] bps n'a pas le même sens sur les deux.

**Pour l'ouvrir** : recalibrer la bande de stop et le budget de risque pour
cette classe, ce qui revient à déclarer une seconde configuration de desk.
Pas un chantier de stratégie, un chantier de paramétrage.

## Social et gamification

**État : hors scope explicite du briefing.**

Une exception existe déjà et il faut la nommer : l'onglet **poussée** convertit
le PnL réalisé en distance parcourue. Il a été demandé avant ce briefing, il ne
touche pas au chemin de trading, et il n'affiche aucune taille virtuelle — la
distance est le réalisé, rien d'autre.

Il n'est pas étendu. Classement entre desks, badges, échanges de cartes :
rien de tout ça n'est construit.
