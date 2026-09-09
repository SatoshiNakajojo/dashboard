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
