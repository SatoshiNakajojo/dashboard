# Runbook — de l'idée au verdict

La boucle décrite dans le briefing : **Grok (idées) → Claude (re‑challenge +
plan de backtest) → local → coller la console → verdict**. Voici sa version
exécutable dans ce dépôt, avec les commandes réelles.

## 0. Avant de commencer — le seul chiffre qui compte

Le dépôt a essayé **plus de 400 cellules** et n'en a retenu aucune. Une idée
neuve n'arrive donc pas dans un espace vide : elle arrive dans un espace où
l'on sait déjà que la plupart des idées ne survivent pas.

Ce n'est pas du découragement, c'est le dénominateur. Il rend interprétable ce
qui survivra.

## 1. L'idée

Peu importe d'où elle vient — un modèle, une conversation, une lecture.
**Ce qui compte est qu'elle soit écrite avant d'être mesurée**, avec ses
paramètres. Une idée qu'on précise après avoir vu le résultat n'est plus une
idée, c'est un ajustement.

## 2. Le re‑challenge

Trois questions, dans cet ordre :

1. **Combien d'autres idées ont été écartées pour arriver à celle‑ci ?**
   C'est le dénominateur réel. S'il est inconnu, la mesure en échantillon ne
   pourra pas conclure, et il faudra passer directement au test hors
   échantillon (§ 6).
2. **Quel mécanisme la ferait marcher ?** Une règle sans mécanisme plausible
   n'est pas interdite, mais elle n'a droit à aucun bénéfice du doute.
3. **Le desk pourrait‑il seulement la trader ?** Un stop hors de la bande
   [30, 1600] bps se fait refuser. C'est ce qui a écarté `tsmom`, pourtant la
   règle la plus puissante du dépôt : 70 % de ses entrées refusées.

## 3. L'implémenter

Dans `src/trading_desk/backtest/strategies.py`, puis l'enregistrer dans
`BASELINES`. Une règle qu'on ne code pas ne peut pas être réfutée.

```bash
python -m pytest tests/ -q -k "strategies"
```

## 4. L'essayer, avec son origine

```bash
python -c "
from trading_desk import atelier
l = atelier.essayer('ma_regle', 'BTC', '1d', tirages=2000, origine='main')
atelier.inscrire(l)
print(l['verdict'], l['p'])
"
```

`origine` décide du dénominateur. `main` pour une idée réfléchie, `balayage`
pour une grille, `llm` pour une génération, `externe` pour un ticket importé.
**Se tromper d'origine fausse la correction dans un sens ou dans l'autre.**

### Plusieurs réglages sur une même cellule : les lancer d'un bloc

Chercher le meilleur réglage parmi dix, c'est une recherche, et elle se paie.
L'unité que compte Benjamini-Hochberg est la **famille** — une origine, une
stratégie, un actif, une échelle — pas la signature ; dix dérivées à ±25 % du
même parent sur les mêmes barres posent une question, pas dix.

```bash
python -c "
from trading_desk import atelier
lignes = atelier.essayer_famille('ema_cross', 'SOL', '4h',
    variantes=[{'fast': f, 'slow': s} for f in (15, 20, 25) for s in (40, 50, 60)],
    tirages=2000)
for l in lignes:
    atelier.inscrire(l)
print(lignes[0]['famille_p'], lignes[0]['famille_methode'])
"
```

Lancer les mêmes variantes **une par une** donne des lignes valides, mais un
p de famille plus sévère : sans tirages alignés, on ne peut que majorer par la
borne de Šidák. Mesuré sur dix réglages d'`ema_cross` SOL 4 h à 1 000 tirages :
0,017 en exact contre 0,030 par la borne. Le prix d'une recherche dépend de la
façon dont on a cherché.

Deux conséquences à connaître avant de lire un verdict :

- une variante qui n'est pas la meilleure de sa famille échoue au dénominateur
  **même si sa famille survit** — le p de famille certifie la meilleure des V ;
- sous la borne, le plancher de p de la famille monte avec le nombre de
  variantes (≈ `V/(D+1)`) : prendre la meilleure de dix ne peut pas être dix
  fois plus surprenant que la meilleure d'une seule.

### Chercher des marchés plutôt que des réglages

Passer **seul** est le cas le plus dur qui existe : au rang 1, le seuil vaut
`alpha / m`. Une règle correcte qui tient sur cinq actifs produit cinq p bas
qui se portent l'un l'autre, et le cinquième a droit à cinq fois le seuil du
premier. C'est la forme de recherche que le regroupement en familles rend
payante — et c'est l'inverse d'un balayage de paramètres.

```bash
python scripts/balayage.py --strategie tsmom --intervalle 1d
```

Le panier n'est pas choisi : c'est tout ce qui a des barres sur l'échelle (28
actifs en 1 j). Le choisir serait une sélection, donc une hypothèse de plus, et
invisible dans le dénominateur. L'origine est `balayage`, jamais `main`.

**Trois nombres à lire, et jamais le premier seul.**

| Colonne | Ce qu'elle dit |
|---|---|
| Survivantes BH | ce qui passe la correction — **pas une trouvaille** |
| Retenues | ce qui passe les sept épreuves — la seule colonne verte |
| Marchés | combien de marchés *indépendants* font les actifs retenus |

Un balayage du 17 septembre 2026 l'a montré sans ambiguïté : sur 25 actifs,
**15 survivaient ensemble à Benjamini-Hochberg et l'épreuve les refusait tous
les 15** — onze pour moins de trente aller-retours, deux au plancher de p.

La pathologie est propre à la recherche transversale et il faut la connaître
avant de lancer un balayage : une cellule à trois trades a un nul dégénéré,
donc un p artificiellement bas, et le relâchement du seuil au rang fait que
ces cellules **se sauvent mutuellement**. Le criblage lit un amas de bruit
comme un signal. La coupe affiche donc « dont N maigres » à côté de « sous
alpha ».

**Et trois actifs crypto ne font pas trois marchés.** BTC, ETH et SOL en font
1,5 sur 2182 barres journalières ; dix perps en font 2,4. Le nombre effectif
vient du rapport de participation des valeurs propres de la matrice de
corrélation, `M_eff = M² / Σᵢⱼ Cᵢⱼ²` — voir `transversal.py`.

## 5. Le verdict, en deux couches

```bash
python -c "
from trading_desk import atelier
for l in atelier.dernier_par_signature(atelier.lire())[-3:]:
    v = atelier.juger(l)
    print(v.resume())
    print('  ', (l.get('note') or {}).get('resume'))
"
```

**L'épreuve d'abord** — est‑ce distinguable du hasard. Sept contrôles, un seul
échec suffit. **Le scorer ensuite** — est‑ce que ça vaut le coup. Deux portes
bloquantes : rendement annualisé positif, et battre l'achat‑conservation.

Mesuré sur le registre : sur 44 combinaisons, **42 échouent à la porte de
l'achat‑conservation**. C'est de loin le critère le plus sévère.

## 6. Si elle survit — et seulement alors

Une survivante en échantillon n'est pas une conclusion, c'est une
**candidature**. Le seul verdict que ce dépôt reconnaisse comme concluant est
un test sur des données qui n'existaient pas au moment de la déclaration.

1. Figer la règle dans une déclaration (`sentinelle/regles_figees.py` pour les
   idées du dépôt, `regles_llm.py` pour celles d'un agent externe).
2. Commiter la déclaration **seule**, avant toute mesure. L'historique git est
   la preuve qu'aucun ajustement n'a suivi un résultat.
3. Brancher le journal, et attendre.

## 7. Ce qui ne doit jamais arriver

- **Nettoyer le registre.** Il est en ajout seul. Un registre où les ratages
  disparaissent transforme « la meilleure de cinquante » en « p = 0,02 ».
- **Changer un paramètre d'une règle figée.** Il faut incrémenter la version,
  ce qui repart d'un dénominateur neuf et d'un journal qui distingue les deux
  régimes.
- **Classer par rendement sans le verdict à côté.** La colonne qui donne envie
  est précisément celle qui ne doit pas décider.
