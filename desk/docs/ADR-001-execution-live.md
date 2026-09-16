# ADR‑001 — Exécution live déterministe, IA hors du chemin critique

**Statut** : accepté · **Date** : 16 septembre 2026 · **Décideur** : Jojo

## Contexte

Le desk peut placer l'IA à deux endroits très différents, et le briefing du
16 septembre demande de documenter le second sans l'imposer.

**Position A — déterministe.** L'IA sert à *générer et raffiner des recettes*,
hors ligne. En live, un signal déclenche un ordre par une règle « si A alors
B ». Aucun appel de modèle dans le chemin de décision.

**Position B — réveil sur événement.** Un collecteur algorithmique réveille un
modèle quand il trouve quelque chose ; le modèle rend la main à un algorithme ;
on n'escalade vers un gros modèle que pour le point final.

## Décision

**Position A par défaut.** L'exécution live est déterministe.

## Ce qui a décidé, et ce sont des chiffres

**Le coût.** Mesure du dépôt : 0,1335 $ par cycle d'agents. À un cycle par
heure, 97,53 $ par mois. Le desk, à sa taille déployée, gagne 4,07 $ par mois.
*La facture vaut 23,9 fois le gain.* Le seuil de rentabilité d'une couche d'IA
horaire est de **23 939 $ de capital** à la taille déployée, 2 937 $ à la
taille validée. Voir `src/trading_desk/rentabilite.py`.

Le même ordre de grandeur est rapporté de l'extérieur : ~800 $/mois en tout‑IA
contre ~54 $/mois avec une cascade, et 20 $ brûlés en deux jours.

**L'auditabilité.** Un ordre déterministe se rejoue. On peut répondre à
« pourquoi ce trade, pourquoi cette clôture » en relisant une règle inscrite
avant les faits. Un ordre issu d'un modèle ne se rejoue pas à l'identique, et
le journal hors échantillon perd son sens : on ne peut plus dire *quelle*
règle a été testée.

**La latence.** Plusieurs modèles en série dans le chemin live coûtent des
secondes. Sur des échelles de 15 minutes à 12 heures ce n'est pas rédhibitoire,
mais c'est du glissement gratuit contre un gain non démontré.

## Ce que la position B aurait pour elle

Elle n'est pas écartée sur le principe, et il faut le dire clairement :

- un collecteur qui ne réveille un modèle que sur condition rare coûte peu ;
- un modèle voit des configurations qu'aucune règle n'encode ;
- l'escalade rare — petit modèle d'abord, gros seulement pour trancher — est
  une bonne architecture de coût.

**Ce qui manque pour la retenir** : une mesure. Aucune donnée de ce dépôt ne
montre qu'un modèle décide mieux qu'une règle sur ces marchés. Les agents
branchés jusqu'ici ont émis **zéro mandat** sur toute une campagne, pour
0,1335 $ le cycle. Adopter B aujourd'hui serait payer une capacité dont
l'utilité n'a jamais été constatée.

## Conditions d'un réexamen

Cette décision se révise si l'une des trois est remplie :

1. **Le capital dépasse le seuil.** Au‑delà de ~24 000 $ à la taille déployée,
   la facture horaire cesse d'être absurde. Le calcul est dans le code, pas
   dans ce document, donc il reste juste quand les chiffres bougent.
2. **Un réveil sur événement est mesuré.** Une règle de réveil, déclarée puis
   figée, dont les signaux battent le hasard sur des données qui n'existaient
   pas au moment de la déclaration.
3. **Le coût par cycle s'effondre.** D'un ordre de grandeur, pas de 20 %.

## Conséquences

- Aucun appel de modèle dans `execution/` ni dans `sentinelle/`. Un test le
  vérifie sur le scorer ; l'étendre aux pilotes est un chantier ouvert.
- Les agents restent branchables hors ligne, pour l'atelier et la recherche.
- `agents_muets()` liste ceux qui coûtent sans émettre. **La règle est
  mécanique à dessein** : tant qu'elle reste une discussion, elle se reporte
  et la facture continue.
