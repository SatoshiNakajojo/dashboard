"""Les regles proposees par un agent LLM externe, FIGEES pour un test en paper.

Le rapport du 16 septembre 2026 annonce trois strategies rentables sur
BTC/ETH/SOL en 1 h. Mesurees par ce depot — implementees fidelement, passees
au modele nul et a l'epreuve des sept controles — elles donnent **neuf
cellules refusees sur neuf**, et toutes les cellules positives meurent sur le
retrait d'un seul mois : aout 2026 rend +84,59 $ quand tous les autres mois
reunis en rendent -218,53.

Ce module n'ignore pas ce resultat. Il en tire la seule consequence utile.

────────────────────────────────────────────────────────────────────────────
  POURQUOI FIGER DES REGLES QUE LA MESURE VIENT DE REFUSER
────────────────────────────────────────────────────────────────────────────

Parce que la mesure porte sur les donnees qui ont SERVI a les trouver, et
qu'aucune correction statistique ne repare ca. Le rapport nomme neuf
strategies — trois gardees, six abandonnees — sans compter les parametres de
chacune. Le denominateur reel de la recherche qui a produit ces trois-la est
inconnu et ne sera jamais connu.

Il reste une voie, et une seule : **figer entierement les regles et les juger
sur des donnees qui n'existent pas encore.** Le denominateur redevient honnete
parce qu'il est inscrit avant que la donnee existe. C'est ce que fait
`regles_figees.py` pour les regles du depot ; ce module fait la meme chose
pour celles-ci, avec son PROPRE denominateur.

Le denominateur est separe pour la meme raison que l'origine l'est au registre
de l'atelier : six regles venues d'un agent externe et deux regles du depot ne
sont pas le meme espace d'hypotheses, et les corriger ensemble serait faux
dans les deux sens.

────────────────────────────────────────────────────────────────────────────
  CE QUI EST DECLARE, ET POURQUOI CE N'EST PAS MON CHOIX
────────────────────────────────────────────────────────────────────────────

**La liste est celle que l'agent a lui-meme designee pour le paper.** Son
rapport porte, pour chaque strategie, une ligne « Paper » :

    supertrend           Paper : ON (auto)
    donchian_ema_be      Paper : ON (auto)
    momentum_residuel    Pas en paper pour l'instant

Les deux premieres sont declarees ici, sur les trois actifs du rapport. La
troisieme ne l'est PAS — et c'est important, parce qu'elle est la seule dont
une cellule ait battu le hasard (`momentum_residuel SOL`, p = 0,0130).

La retenir maintenant serait une selection faite APRES avoir vu le resultat,
donc exactement ce que ce module existe pour eviter. Si elle doit etre testee,
ce sera dans une version ulterieure, declaree comme celle-ci : avant.

────────────────────────────────────────────────────────────────────────────
  CE QUE CE TEST PEUT ESPERER PROUVER
────────────────────────────────────────────────────────────────────────────

Six regles, donc un seuil de Benjamini-Hochberg au rang 1 a 0,05/6 = 0,0083.
C'est une barre haute, et elle est la consequence directe du nombre de regles
declarees : en declarer moins aurait relache le seuil, mais il aurait fallu
choisir lesquelles, et ce choix aurait ete le mien.

La cadence, elle, est favorable par rapport aux regles du depot. Mesure sur
208 jours : `supertrend` produit environ 120 trades par actif, `donchian` 145.
Soit de l'ordre de **soixante trades par regle et par trimestre**, la ou
`turtle_btc_1d` en produit dix par AN. Un test de trois mois a donc ici une
puissance reelle, ce qui n'etait pas le cas des regles figees du depot.

Ce n'est pas une prediction de succes. C'est la difference entre un test qui
peut conclure et un test qui ne le peut pas.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from .regles_figees import REFUS_MAXIMUM  # le meme plafond, pour les memes raisons

VERSION = 1
FIGE_LE = "2026-09-16"

# La source de ces regles. Inscrit pour que le journal, lu dans six mois,
# n'ait pas besoin d'un humain qui se souvienne d'ou elles venaient.
ORIGINE = "agent LLM externe, rapport du 16 septembre 2026"


@dataclass(frozen=True)
class RegleLLM:
    cle: str
    strategie: str
    actif: str
    intervalle: str
    parametres: dict[str, Any]
    # Ce que le rapport annonce. Inscrit pour que la comparaison hors
    # echantillon se fasse contre la promesse, et pas contre un souvenir.
    annonce: str
    # Ce que ce depot a mesure en echantillon, avec le modele de couts du
    # rapport lui-meme.
    mesure: str
    # La part des entrees que le moteur de risque du deploiement refuserait.
    # Mesuree : nulle pour les six. L'obstacle n'est pas l'executabilite.
    refus_mesure: float = 0.0
    version: int = field(default=VERSION)

    def empreinte(self) -> str:
        return hashlib.sha256(json.dumps({
            "s": self.strategie, "a": self.actif, "i": self.intervalle,
            "p": {k: self.parametres[k] for k in sorted(self.parametres)},
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]


_SUPERTREND = {"atr_period": 10, "mult": 3.0, "stop_min_pct": 0.40,
               "time_stop": 72}
_DONCHIAN = {"entry_period": 20, "exit_period": 10, "ema_period": 100,
             "atr_period": 14, "atr_stop": 2.0, "stop_min_pct": 0.40,
             "cible_r": 3.0, "time_stop": 48}

REGLES: tuple[RegleLLM, ...] = tuple(
    [
        RegleLLM(
            cle=f"supertrend_{a.lower()}_1h", strategie="supertrend",
            actif=a, intervalle="1h", parametres=dict(_SUPERTREND),
            annonce="+0,22 R · PF 1,92 · repli −2,3 % · WR 56 % (les trois actifs)",
            mesure=m,
        )
        for a, m in (("BTC", "PF 0,79 · net −46,54 $ · repli −9,1 % · WR 38 %"),
                     ("ETH", "PF 0,73 · net −69,89 $ · repli −10,0 % · WR 33 %"),
                     ("SOL", "PF 1,13 · net +31,00 $ · repli −6,3 % · WR 39 %"))
    ] + [
        RegleLLM(
            cle=f"donchian_{a.lower()}_1h", strategie="donchian_ema_be",
            actif=a, intervalle="1h", parametres=dict(_DONCHIAN),
            annonce="+0,11 R · PF 1,24 · repli −3,7 % · WR 29 % (les trois actifs)",
            mesure=m,
        )
        for a, m in (("BTC", "PF 1,00 · net −0,11 $ · repli −7,2 % · WR 36 %"),
                     ("ETH", "PF 1,09 · net +34,73 $ · repli −6,3 % · WR 35 %"),
                     ("SOL", "PF 0,94 · net −24,17 $ · repli −9,4 % · WR 29 %"))
    ]
)

# Le denominateur du test hors echantillon, declare AVANT que la donnee
# existe. Six regles, donc un seuil de Benjamini-Hochberg au rang 1 a
# 0,05/6 = 0,0083.
DENOMINATEUR = len(REGLES)


def par_cle(cle: str) -> RegleLLM | None:
    return next((r for r in REGLES if r.cle == cle), None)


def empreinte_du_registre() -> str:
    """L'empreinte de TOUTE la declaration. Un test la verrouille.

    La changer exige d'incrementer `VERSION`, ce qui repart d'un denominateur
    neuf et d'un journal qui distingue les deux regimes. Sans ce verrou,
    « ajuster legerement un parametre » suffirait a transformer
    retroactivement un echec en succes.
    """
    return hashlib.sha256(
        "|".join(f"{r.cle}:{r.empreinte()}" for r in REGLES).encode()
    ).hexdigest()[:16]
