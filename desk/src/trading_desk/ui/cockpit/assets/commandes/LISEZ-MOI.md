# Commandes photographiées

Les interrupteurs, boutons et voyants du poste sont des **images** plutôt que
des dessins vectoriels. Une pièce photographiée vient du même monde que la
photo du cockpit — même grain, même éclairage. C'est ce qu'aucun bouton
dessiné n'obtient.

## Ce que le cockpit consomme

Des PNG à fond **transparent**, nommés `<nom>-<état>.png`, à plat dans ce
dossier :

| état | rôle | obligatoire |
| --- | --- | --- |
| `on` | position active | oui |
| `off` | position repos | non — sinon dérivé de `on` |
| `alerte` | anomalie | non — sinon `on` clignote |

**L'état éteint peut être dérivé** : on désature et on assombrit l'image
allumée. Deux fichiers à garder alignés, c'est deux occasions de les
désaligner. Ne fournir `off` que si la pièce change vraiment de forme —
un levier qui bascule, par exemple.

Le cadrage doit être **identique** d'un état à l'autre et **serré sur la
pièce** : le cockpit la pose dans un rectangle donné par `hotspots.json`, et
une marge transparente décale la pièce par rapport à son socle peint.

## Les sources

Les JPG livrés sont conservés dans leurs dossiers d'origine. Ils portent leur
fond **cuit dans les pixels** — damier de transparence, fond plein ou dégradé
— et ne peuvent donc pas être posés tels quels : un JPG collé sur la photo y
colle son rectangle de fond.

Ils ont été détourés en deux régimes :

- **fond clair ou damier** : remplissage depuis les bords, en n'acceptant que
  les couleurs présentes sur le bord, puis trois passes de nettoyage du halo
  laissé par l'ombre portée ;
- **fond noir** : pas de détourage — la **luminance devient l'alpha**. Une
  lueur détourée perd son halo, et le halo est précisément ce qui la rend
  crédible.

Un mode de fusion `screen` aurait donné le même résultat optique, mais la
couche des boutons porte un `z-index`, donc son propre contexte
d'empilement : le mélange n'y voit plus la photo derrière, et le carré noir
restait. L'alpha cuit ne dépend d'aucun contexte.

**Le plus simple reste de livrer des PNG transparents** : il n'y a alors rien
à détourer.

## Ce qui est câblé

| nom | où | ce qu'il suit |
| --- | --- | --- |
| `inter-g` | les deux bascules sous « Exposition » | le secteur ouvert |
| `auto-pilot` | à droite d'« aucun ordre » | mandat en vigueur |
| `live-feed` | à gauche de la latence | flux temps réel |
| `rouge` | bouton « Red » du bloc Exposition | desk arrêté |
| `vert` | bouton « Cefe » du bloc Exposition | desk sain |
| `ambre` | bloc « Flux de données » | réserve de requêtes |
| `actif` | bandeau haut | desk en marche |
| `hodl` | rangée d'icônes | recherche chargée |
| `nav` | rangée d'icônes | journal hors échantillon |

## En ajouter un

1. Déposer `<nom>-on.png` ici (et `-off` / `-alerte` si utiles).
2. Ajouter une entrée dans `voyants` de `../../hotspots.json` : rectangle,
   `image`, `etat`, `action`, `label`.
3. Si l'état n'existe pas encore, l'ajouter dans `../../voyants.js`.

Une image absente ne fait jamais de trou : la pièce disparaît proprement, et
un test vérifie que chaque voyant nommé a bien son image allumée.
