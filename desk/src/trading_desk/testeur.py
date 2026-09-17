"""Le testeur : une strategie, passee dans tous les sens.

Quatre etages, et ils ne se valent pas. Les nommer separement est le point du
module : « teste » ne veut rien dire tant qu'on n'a pas dit a quel etage.

    BACKTEST         rejouee sur l'historique. En ECHANTILLON si les donnees
                     ont servi a la trouver, ce qui est presque toujours vrai.
    HORS_ECHANTILLON le meme backtest, borne a des barres POSTERIEURES a une
                     date de declaration. C'est le seul etage qui prouve
                     quelque chose sur l'historique.
    PAPER            le desk tourne, execution simulee contre le carnet reel.
                     Mesure la plomberie, la latence et le glissement — pas
                     l'edge.
    REEL             argent reel. **Refuse par ce module.**

────────────────────────────────────────────────────────────────────────────
  POURQUOI LE TESTEUR NE PASSE PAS D'ORDRE REEL
────────────────────────────────────────────────────────────────────────────

Le briefing demande les quatre etages, y compris « real trading ». Le
quatrieme est declare, decrit, et **refuse ici**.

Ce n'est pas de la timidite : c'est que passer en reel n'est pas un mode de
test, c'est une decision d'exploitation. Elle passe par la configuration du
desk (`DeskMode.LIVE`), qui exige quatre conditions simultanees — testnet
desactive, portefeuille agent, aucun droit de retrait, signataire distinct du
compte maitre — verifiees au demarrage.

Un testeur qui saurait ouvrir cette porte la contournerait : on aurait deux
chemins vers l'argent reel, dont un ecrit pour experimenter. Le jour ou l'un
des deux oublie une verification, ce sera celui-la.

Le testeur rend donc, pour l'etage reel, **ce qui manque pour y aller** — ce
qui est utile — et jamais un ordre.

────────────────────────────────────────────────────────────────────────────
  CE QUE LE TESTEUR MESURE, ET CE QU'IL NE PEUT PAS MESURER
────────────────────────────────────────────────────────────────────────────

Il croise une strategie avec des actifs, des echelles et des parametres, et
rend une CAMPAGNE : une grille de resultats notes et juges.

**Une campagne est un balayage.** Croiser trois actifs et quatre echelles
produit douze cellules, donc douze hypotheses, donc un denominateur de douze.
Le module l'inscrit avec la campagne plutot que de laisser l'appelant s'en
souvenir — c'est la meme lecon que le registre de l'atelier, et elle est
encore plus facile a oublier ici parce que la grille est commode.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence

RACINE = Path(__file__).resolve().parents[2]
DONNEES = RACINE / "data"
CAMPAGNES = DONNEES / "campagnes_testeur.jsonl"

ETAGES = ("backtest", "hors_echantillon", "paper", "reel")

# Les echelles que le briefing met en priorite : moins sensibles au bruit
# micro que le 15 m, plus de barres que le journalier.
INTERVALLES_DEFAUT = ("1h", "4h", "12h")
ACTIFS_DEFAUT = ("BTC", "ETH", "SOL")


@dataclass(frozen=True)
class Cellule:
    actif: str
    intervalle: str
    parametres: dict[str, Any]
    trades: int
    net_usd: float
    note: dict[str, Any] | None
    erreur: str = ""

    @property
    def deployable(self) -> bool:
        return bool((self.note or {}).get("deployable"))


@dataclass
class Campagne:
    """Tout ce qui a ete teste sur UNE strategie, en une fois."""

    strategie: str
    etage: str
    cellules: list[Cellule] = field(default_factory=list)
    lance_ms: int = 0
    equite: float = 1000.0
    depuis_ms: int | None = None          # borne pour l'etage hors echantillon
    refus: str = ""                       # pourquoi l'etage n'a pas tourne

    @property
    def denominateur(self) -> int:
        """Le nombre d'hypotheses que cette campagne a depensees.

        Toutes les cellules, pas seulement celles qui ont abouti : une cellule
        qui echoue sur des donnees absentes n'a pas ete testee, mais une
        cellule qui rend zero trade a bien ete essayee.
        """
        return sum(1 for c in self.cellules if not c.erreur)

    def en_dict(self) -> dict[str, Any]:
        return {
            "lance_ms": self.lance_ms or int(time.time() * 1000),
            "strategie": self.strategie, "etage": self.etage,
            "equite": self.equite, "depuis_ms": self.depuis_ms,
            "refus": self.refus,
            "denominateur": self.denominateur,
            "cellules": [
                {"actif": c.actif, "intervalle": c.intervalle,
                 "parametres": c.parametres, "trades": c.trades,
                 "net_usd": c.net_usd, "note": c.note, "erreur": c.erreur}
                for c in self.cellules
            ],
            "deployables": sum(1 for c in self.cellules if c.deployable),
        }


def _limites(max_stop_bps: float | None):
    from .risk.limits import RiskLimits
    return (RiskLimits() if max_stop_bps is None
            else RiskLimits(max_stop_distance_bps=Decimal(str(max_stop_bps))))


def _cellule(nom: str, actif: str, intervalle: str, params: dict[str, Any],
             *, equite: float, max_stop_bps: float | None,
             depuis_ms: int | None) -> Cellule:
    from .backtest.data import DataUnavailable, load_from_file
    from .backtest.engine import run_backtest
    from .backtest.strategies import BASELINES, Inverse
    from .scorer import noter

    try:
        bars = load_from_file(
            str(RACINE / "data" / f"{actif}_{intervalle}_real.json"),
            actif, intervalle)
    except (DataUnavailable, FileNotFoundError) as exc:
        return Cellule(actif, intervalle, params, 0, 0.0, None,
                       erreur=f"données absentes : {str(exc)[:60]}")

    if depuis_ms is not None:
        bars = [b for b in bars if b.ts_ms >= depuis_ms]
        if len(bars) < 60:
            return Cellule(actif, intervalle, params, 0, 0.0, None,
                           erreur=f"{len(bars)} barres après la déclaration, "
                                  f"il en faut 60")

    # Une strategie « inverse:X » est construite par enveloppe plutot que par
    # une entree du catalogue : elle n'est pas une strategie de plus, c'est la
    # meme vue a l'envers, et lui donner sa propre entree doublerait le
    # catalogue sans rien ajouter.
    if nom.startswith("inverse:"):
        interne = nom.split(":", 1)[1]
        if interne not in BASELINES:
            return Cellule(actif, intervalle, params, 0, 0.0, None,
                           erreur=f"stratégie inconnue : {interne}")
        fabrique = lambda: Inverse(BASELINES[interne](**params))  # noqa: E731
    elif nom in BASELINES:
        fabrique = lambda: BASELINES[nom](**params)  # noqa: E731
    else:
        return Cellule(actif, intervalle, params, 0, 0.0, None,
                       erreur=f"stratégie inconnue : {nom}")

    try:
        r = run_backtest(bars, fabrique(), limits=_limites(max_stop_bps),
                         interval=intervalle,
                         initial_equity_usd=Decimal(str(equite)))
    except Exception as exc:
        return Cellule(actif, intervalle, params, 0, 0.0, None,
                       erreur=f"{type(exc).__name__} : {str(exc)[:60]}")

    n = noter(r, bars, equite=equite)
    return Cellule(actif, intervalle, params, len(r.trades),
                   float(r.net_pnl_usd), n.en_dict())


def tester(nom: str, *, actifs: Sequence[str] = ACTIFS_DEFAUT,
           intervalles: Sequence[str] = INTERVALLES_DEFAUT,
           parametres: dict[str, Any] | None = None,
           etage: str = "backtest", equite: float = 1000.0,
           max_stop_bps: float | None = 1600.0,
           depuis_ms: int | None = None) -> Campagne:
    """Croise une strategie avec des actifs et des echelles.

    `parametres=None` prend les DEFAUTS PAR ECHELLE de la strategie — ceux qui
    convertissent son horizon documente en barres. Passer un dictionnaire les
    remplace entierement, pour toutes les echelles : c'est ce qu'on veut quand
    on teste un reglage precis, et ce qu'on ne veut pas quand on compare des
    echelles entre elles.
    """
    from .backtest.strategies import parametres as defauts_echelle

    if etage not in ETAGES:
        raise ValueError(f"étage inconnu : {etage!r} (attendu {ETAGES})")

    c = Campagne(strategie=nom, etage=etage, equite=equite,
                 depuis_ms=depuis_ms, lance_ms=int(time.time() * 1000))

    if etage == "reel":
        # **Le seul etage que ce module refuse.** Voir l'en-tete : passer en
        # reel n'est pas un mode de test, c'est une decision d'exploitation,
        # et un second chemin vers l'argent reel est un chemin de trop.
        c.refus = (
            "le testeur ne passe aucun ordre réel. Le mode LIVE se règle dans "
            "la configuration du desk et exige quatre conditions vérifiées au "
            "démarrage : testnet désactivé, adresse de portefeuille agent, "
            "aucun droit de retrait, signataire distinct du compte maître.")
        return c

    if etage == "paper":
        # Le paper trading n'est pas un backtest accelere : il demande que le
        # desk TOURNE, avec ses flux, son moteur de risque et son journal. Le
        # simuler ici rendrait un chiffre qui aurait l'air d'un resultat de
        # paper trading sans en etre un.
        c.refus = (
            "le paper trading se fait en lançant le desk (mode PAPER), pas "
            "depuis le testeur : il mesure la plomberie, la latence et le "
            "glissement réels, qu'un backtest ne peut pas produire. Le "
            "testeur couvre les étages « backtest » et « hors_echantillon ».")
        return c

    if etage == "hors_echantillon" and depuis_ms is None:
        c.refus = ("un test hors échantillon exige une date de déclaration : "
                   "sans borne, il rejoue les données qui ont servi à trouver "
                   "la stratégie et ne prouve rien.")
        return c

    for a in actifs:
        for i in intervalles:
            params = (dict(parametres) if parametres is not None
                      else defauts_echelle(nom.split(":", 1)[-1], i))
            c.cellules.append(_cellule(
                nom, a, i, params, equite=equite,
                max_stop_bps=max_stop_bps, depuis_ms=depuis_ms))
    return c


def inscrire(campagne: Campagne, chemin: Path | None = None) -> Path:
    """Enregistre la campagne ENTIERE, cellules ratees comprises.

    C'est le denominateur du testeur. Une campagne dont on ne garderait que
    les cellules interessantes transformerait « la meilleure de douze » en
    « une strategie a p = 0,02 » — exactement ce que le registre de l'atelier
    existe pour empecher, un etage plus haut.
    """
    p = chemin or CAMPAGNES
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(campagne.en_dict(), ensure_ascii=False) + "\n")
    return p


def campagnes(chemin: Path | None = None) -> list[dict[str, Any]]:
    p = chemin or CAMPAGNES
    if not p.exists():
        return []
    out = []
    for ligne in p.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            d = json.loads(ligne)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("strategie"):
            out.append(d)
    return out


def par_strategie(chemin: Path | None = None) -> dict[str, dict[str, Any]]:
    """Tout ce qui a ete teste, regroupe par strategie.

    C'est ce que la bibliotheque affiche : une recette et l'historique complet
    de ce qu'on lui a fait subir.
    """
    out: dict[str, dict[str, Any]] = {}
    for c in campagnes(chemin):
        d = out.setdefault(str(c["strategie"]), {
            "campagnes": 0, "cellules": 0, "denominateur": 0,
            "deployables": 0, "etages": {}, "derniere_ms": 0})
        d["campagnes"] += 1
        d["cellules"] += len(c.get("cellules") or [])
        d["denominateur"] += int(c.get("denominateur") or 0)
        d["deployables"] += int(c.get("deployables") or 0)
        etage = str(c.get("etage"))
        d["etages"][etage] = d["etages"].get(etage, 0) + 1
        d["derniere_ms"] = max(d["derniere_ms"], int(c.get("lance_ms") or 0))
    return out
