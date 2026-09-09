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

---

# Amendement n° 1 — la mesure de taille

**Écrit le 8 septembre 2026, après les trois sondes et avant tout
collecteur.** Aucun rendement n'a encore été calculé. Le commit qui porte
cet amendement ne contient aucun chiffre de résultat, et c'est vérifiable
dans l'historique.

## Ce que les sondes ont établi

**Le flottant n'est publié nulle part directement.** Ni le calendrier
Nasdaq, ni `meta` chez Yahoo, ni les métadonnées de dépôt de la SEC ne
donnent le nombre d'actions en circulation.

**Et surtout, les échelles n'ont aucun rapport.** Une introduction vend 8 à
20 % du capital ; le *lockup* libère donc **4 à 11 fois le flottant**, quand
un déblocage de jetons libère quelques pourcents de l'offre. Les tranches
pré-enregistrées — 0,5-2 %, 2-5 %, > 5 % — mettraient la totalité de
l'échantillon dans la dernière. **La stratification ne stratifierait rien.**

C'est le cas prévu par le pré-enregistrement, et voici la substitution.

## La substitution

### Test principal : poolé, sans mesure de taille

Sur **toutes** les introductions ordinaires — non-SPAC, cotées depuis au
moins 90 jours à l'expiration, avec des cours disponibles. Ce test ne
demande aucun flottant, donc il conserve l'échantillon le plus large et le
moins filtré. C'est lui qui décide de la confirmation ou de la réfutation.

### Test secondaire : réponse à la dose, par TERCILES

    part bloquée = (actions en circulation − actions offertes) / actions offertes

en **terciles**, et non en bornes absolues. Les bornes crypto n'ont aucun
recouvrement avec l'échelle actions ; les transposer serait arbitraire. Les
terciles sont calculés **sur le prédicteur seul, jamais sur les
rendements** — c'est ce qui les distingue d'un ajustement.

Le critère de confirmation devient : le tercile haut dépasse le tercile bas.

### Le nombre d'actions retenu

La déclaration XBRL **la plus proche de l'expiration parmi celles postérieures
à l'introduction**. Deux exclusions, et la première a été trouvée par la
sonde :

- **une déclaration antérieure à l'introduction est écartée.** INTJ, introduit
  le 20 mars 2024, n'a qu'une seule déclaration, datée du 30 novembre 2023.
  L'utiliser calculerait la part bloquée sur un capital pré-IPO : un nombre
  faux, plausible, et qui ne déclenche aucune erreur.
- **une société sans déclaration valide sort du test secondaire**, jamais du
  test principal.

## Les biais, nommés

**La jointure symbole → CIK utilise la table COURANTE de la SEC.** Une
société radiée depuis son introduction n'y figure plus : 3 sur 45 dans la
sonde, soit 7 %. Ces disparues ne sont pas au hasard — ce sont les échecs.

Le sens du biais compte : retirer les échecs retire les baisses les plus
fortes, donc **rapproche de zéro l'effet baissier mesuré**. Le résultat
publié sera conservateur, mais sa portée sera limitée aux sociétés encore
cotées aujourd'hui, et ce sera écrit.

**Le XBRL manque pour environ un tiers des sociétés** (4 sur 6 exploitables
dans la sonde). Cette perte ne touche que le test secondaire.

**Les SPAC représentent 21 % du calendrier** (12 sur 57). Le filtre retenu
est `proposedSharePrice == "10.00"` : dans la sonde, les neuf sociétés au
nom en « Acquisition » y étaient toutes incluses, ce qui en fait le critère
le plus simple et le plus large des deux.

## Ce qui reste inchangé

Fenêtre J-7 → J-1, six jours de détention, sens baissier, expiration à
J+180, référence SPY, six contrôles, Benjamini-Hochberg à α = 0,05, et les
trois verdicts possibles — confirmation, réfutation, non concluant. **Un
effet plus fort que le crypto reste traité avec méfiance.**

## Une vérification croisée gratuite

`meta.firstTradeDate` chez Yahoo donne la première cotation, indépendamment
du `pricedDate` de Nasdaq. Les deux doivent coïncider à quelques jours près.
Un écart systématique signalerait que l'une des deux sources ne dit pas ce
que je crois — et c'est exactement ce qui rendrait toute la campagne fausse
sans rien casser.

---

# Amendement n° 2 — jours calendaires ou séances ?

**Écrit le 9 septembre 2026, après la collecte et avant tout calcul de
rendement.** Le commit qui le porte ne contient aucun résultat.

## L'incohérence est dans mon propre document

Le pré-enregistrement dit deux choses qui ne coïncident pas sur actions :

- « fenêtre **J-7 → J-1** » — six jours **calendaires** ;
- « durée de détention : **6 jours de bourse** » — six **séances**.

En crypto les deux étaient la même chose : le marché ne ferme jamais, une
journée est une bougie. Sur actions, six jours calendaires font **cinq
séances**, et parfois quatre avec un jour férié. Il faut trancher, et le
faire maintenant plutôt qu'après avoir vu les deux résultats.

## La résolution : le calendrier gagne

**La fenêtre est calendaire.** Entrée à la dernière séance à ou avant
J-7, sortie à la dernière séance à ou avant J-1.

L'argument n'est pas de commodité. L'expiration d'un *lockup* est un
événement **daté au calendrier** : elle tombe 180 jours après
l'introduction, week-end ou non, et les détenteurs qui anticipent comptent
en jours, pas en séances. Le contenu économique de l'hypothèse est « la
semaine qui précède », et une semaine est une semaine.

Compter en séances ferait glisser la fenêtre d'un ou deux jours selon la
position du week-end — c'est-à-dire selon rien.

La détention est donc de **quatre à cinq séances**, ce que le rendement
mesuré reflétera. La mention « 6 jours de bourse » du document initial est
une erreur de transposition, et elle est ici corrigée dans le sens le moins
avantageux : une fenêtre plus courte laisse moins de place à l'effet.

## Un contrôle qui pèse plus lourd ici qu'en crypto

Les introductions ont une dérive post-introduction bien documentée : les
premiers mois ne ressemblent pas aux suivants. Le nul par événement, qui
tire des dates au hasard dans l'historique du **même titre**, est donc
confondu — il compare la fenêtre du 180ᵉ jour à des dates majoritairement
postérieures.

**Le décalage calendaire n'a pas ce défaut.** Il décale tous les événements
du même nombre de jours, donc il compare « le 180ᵉ jour » à « le 180ᵉ + d
jour » dans la vie de chaque société. C'est exactement le contrôle qu'il
faut contre la dérive post-introduction, et il devient ici le test décisif —
plus encore qu'en crypto, où ce confondant n'existait pas.

Si le test poolé ressort mais que le décalage calendaire ne suit pas, la
conclusion sera : **effet de dérive post-introduction, pas effet de
*lockup***.

## Ce que la collecte a déjà appris

526 introductions retenues sur 36 mois, 246 SPAC exclues, **447 séries de
cours écrites**. Le seuil pré-enregistré était de 100 événements.

Douze sociétés ont été écartées pour désaccord de date entre Nasdaq et
Yahoo, et cinq d'entre elles avec des écarts de 1 494 à 11 724 jours. Ce ne
sont pas des erreurs de date : ce sont des **tickers recyclés**, où Yahoo
sert l'historique de la société qui portait le symbole avant. Sans la
vérification croisée, l'expiration d'un *lockup* de 2024 aurait été mesurée
contre les cours d'une entreprise cotée en 1994 — des prix parfaitement
valides, aucune erreur levée.

Écart médian sur les 435 autres : **0,6 jour**. Les deux sources s'accordent.

Cinquante-huit sociétés sont introuvables chez Yahoo. Ce sont les radiées,
donc les échecs, et leur retrait rapproche de zéro l'effet baissier mesuré :
la portée du résultat sera limitée aux sociétés encore cotées, et ce sera
écrit dans le rapport.
