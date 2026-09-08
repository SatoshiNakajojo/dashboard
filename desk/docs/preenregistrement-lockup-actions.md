# Pré-enregistrement — l'effet d'anticipation sur les *lockup expiries*

**Écrit le 8 septembre 2026, avant toute collecte de données actions.**
La date compte : c'est ce qui distingue une réplication d'un second essai.

## Pourquoi ce document existe

Le résultat sur les déblocages de jetons a franchi six contrôles. Il en
reste un que le temps seul peut rendre : **il a été construit en connaissant
les données**. La fenêtre J-7/J-1, les bornes 2 %–25 %, la durée de six
jours — chaque décision de méthode a été prise après avoir vu le résultat.
Rien n'indique une tricherie ; rien ne permet de l'exclure.

Le journal hors échantillon y répond, en six mois à un an.

Une réplication sur une **classe d'actifs entièrement différente** y répond
autrement, et tout de suite — à une condition : que les règles soient
écrites *avant* de voir les données. C'est l'objet de ce fichier. Il est
daté, versionné, et tout écart ultérieur sera visible dans l'historique Git.

## L'hypothèse, et elle est la même

Les *lockup expiries* sont l'analogue exact des déblocages de jetons : une
augmentation d'offre **connue des mois à l'avance**, à date fixe, sur un
actif dont le flottant est mécaniquement élargi.

> Le prix baisse entre J-7 et J-1 avant l'expiration du *lockup*, et
> l'amplitude croît avec la taille de la libération rapportée au flottant.

C'est la transposition littérale du résultat crypto. **Rien n'est ré-exploré.**

## Les paramètres, figés

| paramètre | valeur | d'où elle vient |
| --- | --- | --- |
| date de l'événement | introduction + **180 jours** | convention de marché, pas un ajustement |
| fenêtre | **J-7 → J-1** | identique au résultat crypto |
| durée de détention | **6 jours de bourse** | identique |
| sens | **baissier** (`sens = -1`) | identique |
| référence de neutralisation | **SPY** | l'équivalent de BTC : le marché large |
| tranches de taille | **0,5-2 % · 2-5 % · > 5 %** du flottant | identiques |
| plage retenue | **2 % à 25 %** | la plage validée en crypto |
| correction | **Benjamini-Hochberg**, α = 0,05 | identique |

Aucune de ces valeurs ne sera modifiée après avoir vu les résultats. Si
l'une se révèle inapplicable — par exemple si le flottant n'est pas
disponible — la substitution sera **écrite ici avant** d'être mesurée, dans
un commit distinct de celui qui rapporte les chiffres.

## L'univers, et pourquoi il ne sera pas choisi à la main

Toutes les introductions d'une période, issues d'une source systématique.

**Une liste écrite de mémoire ne contiendrait que les IPO dont on se
souvient** — les grosses, les survivantes, celles qui ont fait parler. C'est
le biais de survie que ce projet combat depuis le début, et il suffirait à
fabriquer l'effet : les entreprises qui ont mal fini sont précisément celles
dont le cours baissait déjà.

Deux exclusions, et elles sont posées d'avance :

- **les SPAC**, dont le *lockup* obéit à une autre mécanique ;
- **les introductions de moins de 90 jours de cotation** au moment de
  l'expiration, faute d'historique pour mesurer quoi que ce soit.

Aucune exclusion pour cause de faillite, de radiation ou de mauvaise
performance. Un ticker radié après l'expiration reste dans l'échantillon.

## Les six contrôles, identiques

1. **Dénominateurs aberrants** — l'effet tient-il en resserrant la plage ?
2. **Jackknife par titre** — un seul titre porte-t-il tout ?
3. **Coupe temporelle** — l'effet existe-t-il encore dans la seconde moitié ?
4. **Neutralisation du marché** — survit-il au rendement relatif à SPY ?
5. **Décalage calendaire** — survit-il à un nul qui respecte la dépendance
   entre titres ?
6. **Décalage calendaire net** — les deux à la fois.

## Ce qui compte comme confirmation, et ce qui compte comme réfutation

C'est la partie qui engage, et elle est écrite avant de savoir.

**Confirmation.** Le test poolé sur la fenêtre d'anticipation ressort à
p < 0,05 après Benjamini-Hochberg, **et** l'effet survit au décalage
calendaire net, **et** la réponse à la dose est monotone (la tranche
> 5 % dépasse la tranche 2-5 %).

**Réfutation.** Le test poolé ne ressort pas, ou l'effet est de signe opposé.
Dans ce cas le résultat crypto n'est pas invalidé — mais il devient **propre
à la crypto**, et l'explication par la microstructure des marchés de jetons
(flottant étroit, détenteurs concentrés, absence de teneurs de marché
obligés) prend le pas sur l'explication par un mécanisme général d'offre.

**Non concluant.** Moins de 100 événements exploitables, ou une puissance
insuffisante pour distinguer +290 bps de zéro. Dans ce cas rien n'est
conclu, et il est dit que rien n'est conclu — la campagne des horizons
longs a déjà montré qu'un échantillon trop court produit des chiffres
d'allure convaincante et sans contenu.

**Un résultat plus fort que le crypto sera traité avec méfiance, pas avec
enthousiasme.** Les actions sont plus liquides, plus couvertes et plus
arbitrées que les altcoins ; un effet *plus* grand y serait suspect et
appellerait d'abord une recherche d'erreur dans la chaîne de données.

## Ce que ce document ne promet pas

Que les sources soient accessibles. L'environnement où ce code est écrit
refuse stooq, la SEC, Nasdaq et Yahoo — 403 sur les quatre. La sonde
`scripts/sonder_sources_actions.py` doit tourner ailleurs, et le parseur ne
sera écrit qu'après lecture de sa sortie.

C'est la leçon de `fetch_unlocks.py`, écrit contre une API supposée devenue
payante et une structure de données devinée : propre, testé, entièrement
faux.
