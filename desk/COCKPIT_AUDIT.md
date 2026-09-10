# Audit avant habillage cockpit

**Phase 0.** Écrit avant la moindre ligne de CSS, comme le brief l'exige. Deux
objets : recenser ce que l'app fait réellement, et poser la table de mapping
pour qu'aucune fonctionnalité ne se perde derrière la photo.

## 0.0 Réconciliation des noms — à lire en premier

Le brief interdit deux choses qui se contredisent : *« ne change pas les noms
métier déjà dans le code (HOOL, Thana, PAL, ORBITAL TRADING DESK,
notebooks…) »* et *« ne copie pas le lorem halluciné de la photo »*.

Vérification faite, **aucun de ces noms n'existe dans le dépôt.** La photo est
une image générée : son texte est halluciné de bout en bout, y compris les
noms que le brief prend pour des noms de code. Les garder produirait une
interface qui ment sur ce qu'elle affiche — exactement ce que le reste du
projet refuse.

| sur la photo / dans le brief | dans le code | décision |
| --- | --- | --- |
| `ORBITAL TRADING DESK V3.1` | `Desk · Poste de pilotage` | vrai titre |
| `HOOL`, `PRL`, `ALDO PORTOMANICE` | `ema_cross`, `rsi_reversion`, `turtle_breakout`, `tsmom`, `trend_follower_atr`, `regime_switch` | vraies stratégies |
| `PAL -15.6%` | `day_pnl_usd`, `pnl_realise_usd` | **PnL du jour**, en dollars |
| `Thana` | aucun utilisateur ; le desk a un **mode** | `SHADOW`/`PAPER`/`TESTNET`/`LIVE` |
| `JOHN` (broderie du gant) | aucun utilisateur | reste dans le PNG découpé, jamais en HTML |
| `jupyter_notebook_orbital_sources.ipynb` | aucun notebook ; `docs/*.md`, `baselines/*.json` | pill → **sources de recherche** |
| `BTC/USD`, `ETH/USD` | `BTC`, `ETH` (perpétuels Hyperliquid) | pas de paire `/USD` |
| `P99-VOL` | aucune métrique de percentile de volume | remplacé par le **débit du flux** |
| `SUPYTANTES`, `RERERSONT`, `ANRLESUHE`, `SQUIPE`, `Analog diars`, `ROLLANT SERIATOR`, `QUARCED ON DRAPPED` | — | lorem, supprimé |

**La photo reste le chrome exact.** Seuls les textes changent, et ils changent
parce qu'ils sont faux.

## 0.1 Inventaire des fonctionnalités

### Ce qui existe

| # | fonctionnalité | fichier | ce qu'elle fait |
| --- | --- | --- | --- |
| F01 | Bannière d'état + kill switch (2 temps) | `ui/index.html` `render()`, `POST /api/halt`, `/api/arm` | arrête le desk, passe FLAT ; réarmement manuel |
| F02 | 6 tuiles : équité, PnL jour, exposition, levier, positions, mandats | `render()` → `#tiles` | depuis `/api/snapshot` |
| F03 | 12 invariants de risque | `render()` → `#inv` | libellé + détail + passé/échoué |
| F04 | Mandat en vigueur + TTL | `render()` → `#mandate` | biais, régime, univers, notionnel, levier, durée de vie |
| F05 | Santé des flux WS | `render()` → `#feeds` | âge, messages, reconnexions, dernière erreur |
| F06 | Budget de requêtes | `render()` → `#budget` | poids IP/min, réserve par adresse |
| F07 | Positions ouvertes | `render()` → `#pos` | sens, taille, entrée, mark, notionnel, PnL, stop |
| F08 | Derniers prix | `render()` → `#prices` | par actif |
| F09 | Journal de décisions | `loadJournal()`, `GET /api/journal` | 12 dernières entrées, payload JSON |
| F10 | Flux SSE + repli polling + bannière hors-ligne | `connect()`, `poll()`, `setOffline()` | 1 Hz |
| F11 | Thème clair/sombre | `#theme`, `localStorage["desk-theme"]` | |
| F12 | Navigation 7 secteurs | `montrer()`, `localStorage["desk-secteur"]` | PRÉ-VOL, TÉLÉMÉTRIE, NAVIGATION, SOUFFLERIE, CONSOMMATION, VOLS, SYSTÈMES |
| F13 | Liste de vérifications avant vol | `rendrePrevol()`, `/api/recherche` | ok / attente / bloc + verdict de synthèse |
| F14 | Télémétrie de collecte Parquet | `rendreTelemetrie()` | fichiers, flux, octets, dernier battement |
| F15 | Journal hors échantillon des déblocages | `rendreNavigation()` | positions datées, état, seuil de conclusion |
| F16 | Campagnes de validation + criblage BH | `rendreCampagnes()` | cellules, p<0,05, attendues, survivantes, résolution |
| F17 | Inventaire des stratégies | `rendreInventaire()` | cellules, gagnantes, net médian, p min, survie BH |
| F18 | Courbe d'équité vs HODL (2 tracés) | `tracerCourbe()`, `GET /api/courbe` | rejoue un vrai backtest, sélecteurs stratégie/actif/intervalle |
| F19 | Distribution des scores + seuil | `rendreConsommation()` → `histogramme()` | barres, seuil 0,60 marqué |
| F20 | Coût par politique de modèles | `rendreConsommation()` → `#politiques` | cycles, coût total, par cycle |
| F21 | Coût et latence par agent | `rendreConsommation()` → `#agents` | appels, schéma valide, abstentions, p95 |
| F22 | P&L et historique des transactions | `rendreVols()` | courbe, fills, mandats, frais |
| F23 | Graphiques SVG maison | `courbeSVG()`, `histogramme()` | sous-échantillonnage qui garde les extrêmes |
| F24 | Chrono de session | `render()` → `#uptime` | `dur(uptime_s)` |
| F25 | Pupitre PAPER (exécution) | `execution/pupitre.py` + `paper.py` | ouvre/ferme via signal, hors interface |

### Ce qui n'existe pas, et pourquoi

| brief | état | raison |
| --- | --- | --- |
| Carnet d'ordres affiché | `BookSnapshot` est ingéré et stocké, **jamais exposé** | aucun endpoint ne le sert |
| Formulaire d'ordres, boutons Buy/Sell | **n'existe pas, et ne doit pas exister** | l'interface ne passe aucun ordre. Règle du dépôt, écrite dans le pied de page et **vérifiée par un test** (`assert "/api/order" not in r.text`) |
| Notebooks Jupyter | aucun | la recherche vit dans `scripts/` et `docs/` |
| Auth / utilisateur | aucun | le serveur écoute sur `127.0.0.1`, sans authentification |
| Alertes / triggers configurables | `sentinelle/triggers.py` existe côté moteur | non exposé dans l'UI |
| Hotkeys | aucun | — |
| Modals, drawers, toasts, menus contextuels | aucun | — |
| IndexedDB | aucun | seulement 2 clés `localStorage` |

**Le point dur : les gâchettes des joysticks.** Le brief les veut sur
« Buy / long / submit bid » et « Sell / short ». Ce desk **ne peut pas** :
l'interface n'a aucun chemin vers un ordre, par construction et par test. Ces
hotspots existeront, visibles, avec l'animation de pression, mais `disabled`
et une infobulle qui dit pourquoi. C'est le seul traitement honnête — et le
brief le prévoit : *« si un handler n'existe pas : hotspot visible, disabled,
tooltip, ligne dans l'audit »*.

## 0.2 Table de mapping — zéro orphelin

| feature | slot cockpit | interaction conservée | débordement |
| --- | --- | --- | --- |
| F01 bannière + kill | `screen-left-log` (en-tête) + `btn-kill` | 2 temps, réarmement | — |
| F02 tuiles | `screen-regime` (4 cellules) + `screen-amplitude` (2 jauges) | — | 6 tuiles → 4 + 2 |
| F03 invariants | `screen-triggers` (LEDs) | clic titre → liste complète | secteur SYSTÈMES |
| F04 mandat | `screen-autopilot` | — | — |
| F05 flux | `screen-flux` (aiguilles = latence) | — | — |
| F06 budget | `screen-flux` (2e jauge) | — | secteur TÉLÉMÉTRIE |
| F07 positions | `screen-main` (bandeau bas) | — | secteur VOLS |
| F08 prix | `screen-main` (en-tête) | — | — |
| F09 journal | `screen-feed` (LIVE FEED) | défilement interne | — |
| F10 SSE / hors-ligne | `screen-left-log` + LED `led-red` | — | — |
| F11 thème | `icon-5` | bascule | — |
| F12 navigation | `tab-poste/telemetrie/navigation`, `tab-conso/vols/systemes` | 7 secteurs, persistance | — |
| F13 pré-vol | `screen-left-log` (corps) | — | secteur PRÉ-VOL |
| F14 télémétrie | `tab-telemetrie` | — | — |
| F15 déblocages | `tab-navigation` | — | — |
| F16 campagnes | `screen-minis` + `tab-vols` | — | — |
| F17 inventaire | `tab-vols` | — | — |
| F18 courbe vs HODL | `screen-minis` (2 mini-charts) | sélecteurs → `joy-l-hat` / `joy-r-hat` | secteur SOUFFLERIE |
| F19 scores | `screen-scores` | — | — |
| F20 politiques | `tab-conso` | — | — |
| F21 agents | `tab-conso` | — | — |
| F22 P&L / fills | `screen-main` + `tab-vols` | — | — |
| F23 SVG | dans tous les écrans | — | — |
| F24 chrono | barre haute `ACTIF n MIN ss S` | — | — |
| F25 pupitre | `screen-autopilot` (statut) | — | — |

**Aucune ligne sans slot.** Les secteurs existants absorbent tout ce qui ne
rentre pas dans un écran peint : ils ne sont pas un débarras, ce sont les
mêmes onglets qu'aujourd'hui, atteints par les mêmes clics.

## 0.3 Contraintes non négociables héritées du dépôt

1. **Aucun ordre depuis l'interface.** Testé.
2. **`127.0.0.1` uniquement.** Le cockpit ne change pas ça.
3. **Aucune dépendance nouvelle.** Vanilla + canvas 2D + `<video>`.
4. **Le kill switch doit rester atteignable quand tout va mal** — donc jamais
   caché derrière un onglet, jamais recouvert par les mains.

---

## Journal de réalisation

### Fait

**Phase 0** — cet audit.

**Extraction préalable.** `ui/index.html` portait 367 lignes de CSS et 903 de
JS en ligne. Séparés en `ui/desk.css` et `ui/desk.js`, sans une modification
de comportement. C'est ce qui permet au cockpit de **réutiliser** les widgets
plutôt que de les recopier : les deux pages chargent le même script, et il
n'existe donc pas deux implémentations du même écran.

`desk.js` émet désormais `desk:snapshot` et `desk:recherche`. Le cockpit s'y
abonne au lieu d'interroger l'API de son côté — sinon deux écrans du même
desk afficheraient deux instants différents.

**Phase 1** — plateau 1280×800 en letterbox, photo en z-0, pare-brise détouré
au `clip-path`, boucle vidéo (27 Mo, H.264, 20 s) avec repli sur un champ
d'étoiles en canvas 2D. Le champ est une vraie perspective : chaque étoile a
une profondeur qui décroît, sa projection s'écarte du point de fuite d'autant
plus vite qu'elle est proche. Des points, jamais des traînées — c'est ce qui
distingue une croisière d'un saut en hyperespace.

**Phase 2** — les dix écrans, alimentés par les vraies données.

**Phase 3** — 35 hotspots. 33 branchés sur des handlers existants, **2
désactivés** : les gâchettes des joysticks.

**Phase 5** — LED sur booléens réels, aiguilles en rotation SVG, radar 4 s/tour,
chrono de session, mode HUD (touche `` ` ``) persisté, calibrage (touche `D`).

### Ce qui manque, et pourquoi ça bloque

**`assets/cockpit.jpg` n'est pas dans le dépôt.** La photo a été collée dans
la conversation, pas déposée en fichier. Sans elle, il n'y a ni métal, ni
biseaux, ni mains : seulement des rectangles sur du noir. L'interface le dit
franchement plutôt que de faire semblant, et propose de continuer sans.

**`assets/pilot-foreground.png`** (phase 4) se découpe *depuis* ce JPEG. Il
n'existera donc qu'après lui.

**Le calibrage final** attend la photo. Les coordonnées actuelles sont celles
du brief ; elles ne peuvent être ajustées au pixel qu'en superposant les
rectangles à l'image.

### Les deux hotspots morts

`joy-l-trigger` et `joy-r-trigger`. Le brief les voulait sur « acheter » et
« vendre ». Cette interface ne passe **aucun ordre** — règle du dépôt,
vérifiée par test. Deux gâchettes sous les pouces sont le pire endroit
possible pour un ordre cliqué par erreur. Elles restent visibles, avec
l'animation de pression, désactivées, et l'infobulle qui explique.

---

## Calibrage final — 10 septembre

La photo est arrivée : 1305 × 816, ratio 1,5993 contre 1,6000 attendu, soit
0,04 % d'écart. Invisible.

**Elle n'est pas celle qui s'affichait dans la conversation.** Hublot ouvert
sur la Terre plutôt que sur un champ d'étoiles, panneaux décalés de plusieurs
pourcents. Les coordonnées lues sur l'image collée étaient donc fausses elles
aussi — moins que celles du brief, mais fausses. Tout a été remesuré sur un
rendu 1280 × 800 avec le JPEG dessous, ce qui est la seule façon de caler au
pixel.

### Phase 4 — le calque d'avant-plan

Ni Pillow ni numpy sur cette machine, et le dépôt refuse toute dépendance
nouvelle. Le navigateur sait déjà tout faire : charger le JPEG, le peindre
dans un canvas, y appliquer un masque en `source-in`, exporter un PNG avec
alpha. Trois polygones suivent les avant-bras gantés, les deux manches et le
quadrant des gaz.

Deux passes ont été nécessaires. La première emportait deux pour cent de
console de part et d'autre du fût — on lisait un éclat de dalle peinte
par-dessus le journal, et le radar halluciné par-dessus le mandat. La
seconde a abaissé le sommet des polygones de trois pour cent : ils montaient
au-dessus de la tête des manches, là où il n'y a plus de main.

### Ce que les mains cachent, et ce qu'on en fait

Les avant-bras passent devant quatre panneaux : la gauche du journal et du
flux, la droite de l'exposition et du mandat. C'est la réalité de l'image, et
c'est ce qui donne la profondeur.

Le contenu est décalé vers la zone visible, mais **les écrans gardent la
taille de la dalle peinte** — c'est elle qui vaut dès que les mains
s'écartent. En mode HUD (touche `` ` ``), les mains descendent et la marge
disparaît : c'est exactement à ça que ce mode sert.

---

## Phase 5 — l'intégration, 10 septembre 2026

Quatre demandes : construire le lanceur de campagne, intégrer écrans,
boutons et aiguilles **dans** l'image, refaire la découpe des mains, donner
le lien. Ce qui suit ne raconte que ce que le rendu a démenti.

### Le calque d'avant-plan était l'erreur, pas son réglage

Le PNG détouré de la phase 4 reprend des pixels de la photo et les repose
**sur eux-mêmes**. Partout où le détourage n'est pas franc — et un détourage
à la main ne l'est jamais tout à fait — le décor se dédouble. À la loupe, un
halo bleuâtre suivait le contour du manche droit : ce n'était pas un défaut
de tracé, c'était le principe même du calque.

La photo contient déjà les mains, nettes, à leur place. Il suffit de
**percer** les deux dalles qu'elles traversent, avec un masque SVG en
`fill-rule: evenodd`. Plus rien n'est recomposé : sous le trou, c'est le
JPEG. Le bord des gants est celui de la photo, au pixel, et il ne peut plus
être raté. Le PNG ne sert plus qu'au mode HUD.

Le trou est rentré de 0,15 point vers l'intérieur du bras. Trop large, il
laissait reparaître un croissant de dalle **peinte** autour du manche —
visible à la loupe sur le mandat. Trop étroit, il ne laisse qu'un cheveu de
dalle noire sur un gant noir, que personne ne voit. L'asymétrie du coût
décide du sens de l'erreur.

Une correction supplémentaire entre 64 et 72 % de hauteur : le manche y est
plus étroit que ne le disait le tracé de la phase 4.

### Un rectangle noir n'est pas un instrument

Les cinq dalles qui recouvraient des instruments peints — cadrans,
bargraphes, colonnes, logements numériques — ont été supprimées. À leur
place, on **rallume** ce que la photo dessine déjà.

La règle qui rend la chose invisible : **le fond de chaque pièce est la
teinte relevée au pixel sur le JPEG**, celle du verre éteint ou du métal nu
qu'elle recouvre — jamais un noir choisi à l'œil. Un noir choisi se voit
toujours ; c'est ce qui donnait au rendu de la veille son air d'autocollant.

- logements numériques : `rgb(46,47,51)`, relevé dans « Régime commuté » ;
- logements du bloc « Flux » : `rgb(31,33,34)` ;
- tubes des bargraphes : `rgb(29,35,42)` ;
- colonnes LED et chiffres : `rgb(45,43,43)` et `rgb(40,38,37)`.

Les plaques gravées et les caches d'inverseur, eux, échantillonnent le métal
**au montage**, dans trois bandes autour de la pièce — à gauche, à droite,
en dessous. Jamais au-dessus : il y a presque toujours un bandeau sombre, et
la première version en est sortie noire. Le 70ᵉ centile écarte les ombres et
les vis. Le résultat est désaturé d'un tiers : un seul pixel de légende
peinte, chaude, suffisait à teinter une pièce en rose sur un tableau gris.

### La colonne n'était pas une colonne

La photo découpe la distribution des scores en **sept logements séparés par
du métal**. Un bloc unique effaçait ces sept refends — c'est exactement à ce
détail qu'un calque se trahit. Sept rectangles aux hauteurs relevées
(32,13 / 34,25 / 36,25 / 38,25 / 40,38 / 42,38 / 44,50 %) laissent le métal
visible entre eux.

Même correction pour le bloc « Flux » : quatre logements à gauche, trois à
droite dont un haut — pas six alignés comme le supposait la première carte.

### Une étiquette fausse au-dessus d'un chiffre vrai

Le rendu affichait « ATTENOUES 0 $ » : un mot halluciné étiquetant une
exposition réelle. C'est pire qu'un décor entièrement faux, parce qu'on le
croit. Sept plaques gravées portent désormais le nom réel de la mesure
(Équité, Exposition, Positions, Mandats, Seaux, Compte, Latence, Budget,
Secteurs), et le placard de gauche porte ce qui bloque réellement le
décollage au lieu d'un paragraphe de faux latin.

Quatre plaques du châssis répétaient le même mot. Chacune porte maintenant
un fait que sa voisine ne dit pas.

### Les boutons avaient disparu

Ils étaient parfaitement transparents au repos : rien ne disait que la photo
était cliquable. Un rectangle dessiné par-dessus aurait été un calque posé
sur du matériel. Chaque hotspot porte donc une **halo ronde très faible** —
le bouton peint paraît rétro-éclairé, pas recouvert — qui monte puis
retombe une fois au chargement : la carte des commandes se montre seule.

Les inverseurs ne se dessinent plus **par-dessus** celui de la photo, ils le
**remplacent** : cache au métal échantillonné, seul le levier est neuf. Ils
étaient de surcroît posés sur la légende peinte et non sur la bascule — le
corps de l'interrupteur commence à 73,4 %, pas à 70,9 %.

### La loupe

Demandée à la phase précédente, construite ici. Le plateau **entier**
s'agrandit et se recadre sur un bloc : photo, dalles, aiguilles et boutons
montent ensemble, donc rien ne se décale et les boutons restent cliquables à
leur place. C'est aussi pourquoi cadrans et inverseurs sont des SVG — eux
restent nets à n'importe quel grossissement.

Double-clic pour entrer, encore pour sortir ; touches 1 à 8 ; Échap.

**Limite mesurée, et elle est dans la photo :** `cockpit.jpg` fait
1305 × 816. Au-delà d'environ 2×, c'est le JPEG qui décide de la netteté,
pas le code. Pour que la loupe vaille vraiment, il faut réexporter la photo
en 2560 ou 3840 de large — les surcouches, elles, sont déjà nettes.

### Le pare-brise

Une profondeur tirée uniformément laissait presque tout le champ au fond,
donc invisible : le pare-brise se lisait comme un trou noir. La racine
ramène les étoiles vers l'avant, le fond passe d'un noir plat à une nappe
autour du point de fuite. La vidéo reste la source de vérité quand elle
charge ; le canvas couvre le premier dixième de seconde, l'absence de
fichier, et `prefers-reduced-motion`.

---

## Phase 6 — la photo change de format, 10 septembre 2026

Nouvelle photo : **1792 × 1008**, soit du 16:9 là où la précédente était en
16:10, sans mains ni manches, et le pare-brise vidé. Trois demandes : refaire
la découpe du pare-brise, mieux intégrer les écrans, et **afficher les
secteurs dans l'écran central** plutôt que dans une page à part.

### Le ratio ne s'écrit plus en dur

`width: min(100vw, calc(100vh * 1280 / 800))` étirait tout le cockpit de 11 %
à la seconde où la photo a changé de format. Le plateau prend maintenant son
ratio de `design` dans `hotspots.json`, posé par le shell. Même correction
dans le module d'aiguilles : le facteur `1.6` qui rendait les cadrans ronds
était la valeur du plateau 16:10 — en 16:9 les aiguilles se posaient à côté.

### Le pare-brise

Le vitrage est désormais la plus grande plage noire de l'image : un
remplissage depuis un point intérieur, seuil de luminance 18, donne 378 082
pixels et un contour propre. Vingt-huit points relevés ligne par ligne,
rentrés de 0,35 point pour laisser vivre le biseau peint. Aucune estimation
à l'œil, contrairement aux deux versions précédentes.

### Un cadran n'est pas « une tache sombre »

La recherche du centre par minimum de luminance posait les aiguilles **cinq
points sous les cadrans** : sous les panneaux il y a des ombres plus sombres
que les cadrans eux-mêmes, et la fenêtre de recherche, choisie à l'œil, les
contenait. Un cadran, c'est un **cercle clair autour d'un disque sombre** ;
on maximise donc l'écart couronne/disque. Une ombre n'a pas de couronne.

### Les boutons câblés en dur ont disparu en silence

`boutons.js` tenait la liste des clés de la carte **écrite dans son code**.
La photo a changé, les clés avec, et le cockpit est passé de quarante-six
boutons à **un** — sans qu'aucun test ne le voie, puisqu'ils vérifient des
rectangles, pas des branchements.

Chaque bouton porte maintenant son verbe dans la carte (`secteur:vols`,
`loupe:flux`, `kill`, `campagnes`…), et le module ne fait que traduire. Un
test parcourt la carte, vérifie que chaque bouton a un verbe, que le module
sait le traduire, et que les secteurs et blocs nommés existent.

### L'application entière dans l'écran du milieu

Les panneaux vivaient dans un tiroir plein écran : cliquer un bouton du
cockpit quittait le cockpit. Ils sont **déplacés** — pas copiés — dans la
dalle centrale, et la loupe s'en approche.

Deux choses ont dû être réglées avant que ce soit lisible. La page était
**blanche** dans une vitre de bord : le poste force désormais le thème
sombre, la préférence de l'utilisateur restant prioritaire. Et composer
directement dans les 380 px de la dalle donnait une colonne où chaque titre
passait à la ligne tous les deux mots ; les panneaux sont donc composés à
**900 px** puis réduits par `transform: scale(--k)`, `--k` valant la largeur
réelle de la dalle divisée par 900 et recalculé par un `ResizeObserver`. On
lit un petit écran de bord, pas une page web rétrécie.

Le reflet de la vitre est passé au-dessus de tout ce qui s'affiche, panneaux
compris : une dalle a une seule vitre.

### Ce que la dalle centrale montre au repos

Elle est devenue la plus grande de la photo, et trois lignes y flottaient
dans du noir. Elle porte maintenant **les douze invariants**, deux colonnes,
une pastille verte ou rouge chacun — ce qu'un poste affiche avant le départ,
et le seul contenu qui vaut la place qu'il prend.

---

## Phase 7 — les stations, et la mise en ligne, 10 septembre 2026

### On s'approche de l'instrument avant d'ouvrir le secteur

Cliquer « Soufflerie » ouvrait directement l'écran central. C'est rapide, et
c'est faux : sur un poste, on regarde d'abord l'instrument qui porte le
sujet, et on ne bascule sur le grand écran que pour ce qu'on veut voir en
détail. Un bouton qui saute au PFD fait du cockpit une barre de menus.

Le trajet est en deux temps. La loupe cadre le **bloc** du secteur et sa
dalle affiche l'index de ce secteur ; choisir une entrée ouvre le secteur
dans la dalle centrale, s'en approche, et fait défiler jusqu'au panneau
choisi, qui clignote une fois.

L'index n'est pas une liste écrite à la main : ce sont les `<h2>`/`<h3>` du
secteur, lus dans le DOM. Une liste recopiée cesserait d'être juste au
premier panneau ajouté, et personne ne s'en apercevrait.

Deux choses trouvées en cliquant pour de vrai, pas en relisant le code :

**Le hotspot qui recouvre la dalle avalait les clics de l'index.** Monter la
dalle seule ne suffit pas — elle est dans un autre contexte d'empilement, et
son `z-index` ne se compare pas à celui des boutons. C'est le bug de la
couche des mains, en plus petit. C'est la **couche** des dalles qui monte.

**`textContent` recolle tout ce qui pend au titre** : le compteur d'un badge,
un sous-titre. On lisait « SOUFFLERIE0 » et « Déclencheurs —
directiondirection ». On prend le premier nœud de *texte*.

### Le rebord en carbone

Le bas du pare-brise n'est pas une droite : le rebord **monte** au centre
(48,8 %) et redescend sur les côtés (53,5 %). Un bord droit à 52,55 %
passait donc par-dessus le rebord au milieu — il en manquait un bout,
exactement là où il est le plus visible.

### L'instrument « Exposition »

Les deux cadrans lisaient déjà l'exposition et le levier contre leurs
plafonds, mais rien ne le disait : ils portent maintenant leur nom, gravé
dans le métal sous chacun. Les quatre témoins portaient des mots peints qui
ne disent pas ce qu'ils surveillent — ils affichent « Expo », « Levier »,
« Flux », « Sain ». Les deux boutons agissent : le rouge coupe le desk (par
le bouton existant, qui porte déjà la confirmation en deux temps), l'autre
ouvre Systèmes.

### Les plaques suivent le plan des consoles

Les deux consoles basses fuient vers l'extérieur. Une étiquette posée
d'aplomb dessus se lit comme un autocollant : « Secteurs » et « Campagnes »
reprennent la pente et le biais relevés sur le texte peint qu'elles
recouvrent.

### En ligne, sans passer par un lien d'artefact

Le dépôt sert déjà des pages statiques depuis sa racine. La copie hors ligne
du poste y est déposée dans `cockpit/`, et `scripts/apercu_cockpit.py`
la fabrique **sans desk en marche** : il en démarre un en mémoire, sans port
ouvert ni processus à lancer. La capture devient reproductible depuis
n'importe quelle machine.

Deux formes, une seule source : `--page` produit un document complet pour un
hébergement statique, l'absence de `--page` un fragment pour un artefact,
qui fournit son enveloppe. Sans `<!doctype>`, le navigateur rendait la page
en mode « quirks » et la mise en page du poste s'effondrait.

Un piège s'est refermé au passage : `boutons.js` **citait le chemin** de la
route d'ordre dans un commentaire, pour expliquer la règle. Tant que le
fichier était chargé par balise, la page servie ne le contenait pas ; la
copie hors ligne l'inline, et le test qui interdit toute route d'ordre dans
la page a sauté. Il avait raison — c'est la même leçon que les chaînes
hallucinées : une valeur écartée qui traîne dans un fichier d'interface finit
recopiée par quelqu'un qui la prend pour une consigne.

---

## Phase 8 — la perspective, et ce qui la trahissait vraiment

Reproche : « les perspectives de tes écritures sur les instruments sont
souvent fausses ; aide-toi des lignes de délimitation ».

### Ce que la mesure a répondu

Deux méthodes, sur les lignes de délimitation des panneaux :

1. **Suivi d'arête** sur les liserés — pour chaque colonne, la ligne de
   gradient vertical maximal. Écart type résiduel de 5 à 11 pixels : le
   maximum saute d'un détail à l'autre. Inexploitable.
2. **Axe des grands titres peints** — le barycentre vertical par colonne,
   puis **médiane des pentes deux à deux** (Theil-Sen). Les moindres carrés
   suivaient les hampes et les jambages ; un accent déplaçait le barycentre
   d'une colonne de plusieurs pixels et tirait la droite.

| panneau | pente mesurée |
| --- | --- |
| Analog diairs (Exposition) | −1,4° |
| GUARDED UN QUARRED | 0,0° |
| Flux de données | +1,5° |
| REMÉRCIEMENTS | −2,0° |
| Régime commuté | 0,0° |
| Déclencheurs | +0,7° |
| Distribution des scores | +1,5° |

**Tout est entre −2 et +2,6 degrés.** Les consoles sont presque d'aplomb. Et
les deux pentes que j'avais posées à l'œil en phase 7 étaient de −3° et
−2,5° — l'une des deux avec le **mauvais signe**.

### Ce qui trahissait vraiment

Pas l'angle : le **relief**. Mes étiquettes étaient des plaquettes
saillantes — liseré clair en haut, ombre en bas, fond en dégradé — alors que
la photo, à ces endroits-là, n'a aucune plaque : le mot est imprimé à même
la tôle. Poser un relief sur une surface plate se voit quel que soit
l'angle.

Elles sont maintenant **gravées** : pas de bord, pas d'ombre portée, le
métal exact relevé autour, et le liseré clair d'un creux sous le trait.
Seules deux d'entre elles recouvrent une vraie plaquette peinte et gardent
le relief.

Un dernier détail les trahissait encore : la teinte relevée est celle du
métal *autour*, mais le panneau porte un dégradé. Une couleur unique laissait
un rectangle **à peine** visible — et « à peine visible » suffit. Un fondu de
quelques pour cent sur les quatre bords le fait disparaître.

### Deux étiquettes de trop

« Expo » et « Levier » gravés sous les cadrans redisaient ce que les deux
témoins juste à côté disent déjà, et le liseré bas du panneau les coupait.
Supprimées.

### Les commandes photographiées

Les interrupteurs et voyants peuvent désormais être des **images** plutôt que
des dessins : une paire de PNG cadrés à l'identique, `<nom>-off.png` et
`<nom>-on.png`, superposés, dont on change l'opacité. Rien ne bouge d'un
pixel entre les deux états.

Le clignotement n'a pas besoin d'un troisième fichier : on alterne les deux.
Un cadre de plus serait un fichier de plus à garder aligné avec les autres,
pour rien.

Si les fichiers manquent, la pièce retombe sur son dessin vectoriel. Une
image absente ne doit jamais faire un trou dans le tableau de bord — et un
test vérifie ce repli, plus le fait qu'un nom d'image a bien ses **deux**
états.

### Typographie des dalles

Tout le corps des écrans passe en unités du plateau (`cqw`) et se resserre
d'environ un cinquième : à la loupe on veut lire **plus de choses**, pas des
caractères plus gros. Les deux dalles latérales ont été recadrées sur la
plage sombre peinte ; celle de gauche est le miroir exact de celle de droite
autour de l'axe du poste, la mesure directe butant sur le graphisme peint
qui la remplit.

La dalle centrale porte maintenant, sous les douze invariants, les canaux de
collecte avec leur latence et le mandat en cours.

---

## Phase 9 — les commandes photographiées, et la vraie perspective

### La perspective : ce n'était toujours pas ça

Phase 8 concluait « pas de cisaillement, les consoles sont d'aplomb ». Faux,
et pour une raison que seule une mesure des **deux** familles de lignes
pouvait révéler : je n'avais mesuré que les horizontales.

Les montants gauche et droit d'un logement penchent **en sens contraire** :

| dalle | montant gauche | montant droit |
| --- | --- | --- |
| auto-pilote | +1,97° | −3,50° |
| desk (centre) | −1,47° | +1,36° |
| journal | −3,45° | −1,47° |
| alarme | −0,65° | +3,58° |

Ce n'est pas un cisaillement, c'est une **convergence** — de la perspective
pour de vrai. Aucune combinaison rotation + cisaillement ne la rend : un
rectangle d'aplomb dans un logement qui converge se voit du premier coup
d'œil, et c'est exactement ce que le reproche disait.

Les quatre coins de chaque dalle sont donc relevés par intersection de ses
quatre arêtes, et le shell en tire l'**homographie** qui envoie le rectangle
de mise en page sur ce quadrilatère, donnée à CSS en `matrix3d`. Les termes
projectifs ont la dimension d'un inverse de longueur : la matrice se
recalcule à chaque redimensionnement du plateau.

La dalle auto-pilote était par ailleurs cadrée 1,3 point trop bas.

### Les commandes photographiées

Trente images livrées, en JPG avec leur fond cuit dans les pixels. Détourage
en deux régimes, parce qu'un seul ne pouvait pas marcher :

- **fond clair ou damier** : remplissage depuis les bords en n'acceptant que
  les couleurs du bord. Un critère *local* (« avance tant que la luminance
  varie peu ») avait été essayé d'abord : il fuyait à travers les pièces —
  sur du métal poli, deux pixels voisins diffèrent de moins de seize
  niveaux, et le remplissage traversait la pièce de part en part. Puis trois
  passes de nettoyage du halo laissé par l'ombre portée.
- **fond noir** : pas de détourage du tout — la **luminance devient
  l'alpha**. Détourer une lueur lui coupe son halo, et le halo est ce qui la
  rend crédible.

J'ai d'abord compté sur `mix-blend-mode: screen` pour effacer le noir à
l'affichage. La couche des boutons porte un `z-index`, donc son propre
contexte d'empilement : le mélange n'y voit plus la photo derrière, et le
carré noir restait. L'alpha cuit ne dépend d'aucun contexte.

L'état éteint est **dérivé** de l'allumé par filtre quand le fichier manque —
deux fichiers à garder alignés, c'est deux occasions de les désaligner.

Neuf pièces sont câblées, chacune sur un booléen réel du desk.

### Les cadrans disent enfin quelque chose

Une aiguille sans chiffre ne dit rien : on lit qu'elle a bougé, pas de
combien — et la graduation peinte du cadran est inventée, donc inutilisable.
La valeur s'inscrit maintenant en phosphore sous le moyeu, dans son unité,
et l'aiguille passe à l'ambre quand elle est **en butée** : une aiguille
collée au maximum sans le signaler laisse croire qu'elle mesure encore. Les
six cadrans sont cliquables vers le secteur qui porte la mesure.

## Phase 10 — la perspective, enfin mesurée au lieu d'être devinée

Quatre fois de suite l'utilisateur a dit que les écritures posées sur
l'image n'étaient pas dans la bonne perspective. Quatre fois j'ai corrigé
sans jamais mesurer la seule chose qui tranche : **l'angle du texte déjà
peint dans le décor**. Il a fini par fournir un dessin au trait du cockpit,
au même cadrage que la photo — et c'est ce dessin qui a permis de fermer
la question.

Deux méthodes indépendantes, montées exprès pour ne pas se croire l'une
l'autre (`scripts/perspective/`) :

- **le biais du texte peint**, par profil de projection : on fait tourner
  une vignette de la photo et on retient l'angle où l'encre se range le
  mieux en lignes ;
- **les arêtes du dessin au trait**, par remplissage des faces closes puis
  Theil-Sen sur les quatre bords.

Elles concordent partout à moins d'un demi-degré. Le verdict :

| plan | texte peint | dessin | valeur qui était en place |
|---|---|---|---|
| secteurs | −8,03 | −7,50 | **0,0** |
| campagnes | **+7,70** | +7,50 | **−2,0** |
| barre-g / barre-d | −0,08 / +0,05 | — | 1,8 / −0,4 |
| scores | 0,01 | 0,00 | 1,5 |
| expo / flux | −1,48 / +1,75 | −1,51 / +1,36 | −1,4 / 1,5 |

« Campagnes » était penché **à l'envers**, et quatre fois trop peu.
« Secteurs » n'était pas penché du tout alors que sa plaque monte de huit
degrés. Les deux bandeaux du milieu, eux, sont parfaitement d'aplomb et je
les avais inclinés. Autrement dit : les seuls panneaux que j'avais réglés
juste étaient ceux que je n'avais presque pas touchés.

Deux enseignements, et le second compte plus que le premier :

1. **Le décor porte sa propre réponse.** La photo contient onze titres
   peints. Leur angle est la spécification ; tout le reste est de
   l'interprétation.
2. **Aucun test ne pouvait voir la faute.** Les tests vérifiaient que la
   boîte était au bon endroit — elle l'était. C'est son contenu qui
   basculait du mauvais côté. D'où le garde-fou ajouté : le cockpit est
   symétrique, deux panneaux qui se font face doivent porter des pentes
   **opposées**. Une faute de signe ne repasse plus.

Le cisaillement, lui, reste écarté. Au zoom, les jambages des lettres
peintes tournent **avec** leur ligne de base : le décor applique une
rotation, pas un cisaillement. Une base de plan complète serait plus
« exacte » en théorie et plus fausse à l'œil.

## Phase 10 bis — quatre requêtes perdues à chaque chargement

Le cockpit demandait les trois variantes de chaque commande photographiée et
rattrapait les 404. Ça marchait — la feuille de style fait clignoter
l'image allumée quand la variante d'alerte manque, donc l'état restait
lisible — mais la page publiée réclamait quatre fichiers dont on savait
depuis toujours qu'ils n'existaient pas. Les variantes livrées sont
maintenant **déclarées** dans la carte, et un test les compare au
répertoire : un fichier ajouté sans déclaration resterait invisible, un
fichier déclaré sans être livré ramènerait le 404 qu'on vient d'enlever.

## Phase 11 — six retours, et un bug qui n'avait jamais rien affiché

### Le PFD n'était pas flou, il était minuscule

`#panneaux` composait la mise en page de l'app à **900 px** puis la
réduisait dans une dalle de 381 px : facteur 0,41. Un corps de 10 px
finissait à **quatre pixels physiques**, et le halo de phosphore achevait
de le noyer. J'ai d'abord soupçonné le `matrix3d` de la dalle — une
transformation 3D fait rastériser puis rééchantillonner son sous-arbre.
L'essai A/B a réfuté ça net : en remplaçant la transformation par un
rectangle, le texte restait exactement aussi mou. Ce n'était pas un défaut
de rendu, c'était de la typographie à 4 px.

On compose maintenant à la largeur que la dalle a **dans la photo**. Le
facteur vaut 1 à la taille de référence, 1,43 sur un grand écran, 0,71 sur
un petit. La règle : agrandir un texte le garde net, le réduire non — donc
`--k` ne doit jamais descendre franchement sous 1 par construction.

### L'interrupteur photographié n'avait jamais pu s'afficher

`inverseur()` appelait `habiller()` — qui pose les deux images — **avant**
d'écrire le levier vectoriel dans `innerHTML`. Or `innerHTML` remplace tous
les enfants : les images étaient créées puis effacées, systématiquement,
depuis le premier jour.

Ce qui rendait la panne muette : la classe `photo` était quand même posée,
parce qu'un `load` se déclenche sur une image même détachée du document. Et
`.inverseur.photo svg { display: none }` masquait alors le levier de repli.
Résultat : rien à l'écran, aucune erreur, aucun 404, et un test voisin qui
vérifiait que les deux appels existaient — ils existaient tous les deux.

Le test ajouté porte donc sur l'**ordre**, seule chose qui était fausse.

### Le reste

- **Les cadrans s'approchent.** Premier clic : le plateau grossit et se
  recadre sur l'instrument. Second clic seulement : le secteur s'ouvre.
  Ouvrir dès le premier clic ferait du cadran un lien déguisé.
- **Le PFD s'approche aussi**, au premier clic, intercepté à la capture
  pour ne pas actionner au passage le contrôle sous le curseur. Une fois
  approché il redevient une dalle ordinaire — sinon on ne pourrait plus
  s'en servir.
- La loupe accepte désormais un rectangle quelconque, pas seulement un des
  huit blocs : inventer un bloc par cadran aurait été huit fois le même
  code.
- Le bouton *live feed* est retiré, le bouton *auto-pilot* ramené de 38 à
  24 px — il était plus gros que le voyant peint qu'il double.
