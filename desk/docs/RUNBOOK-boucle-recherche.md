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
