"""Le generateur : fabriquer des candidates, et COMPTER ce qu'on a fabrique.

Un generateur de strategies est, par construction, une machine a fabriquer des
faux positifs. Ce module est ecrit autour de cette phrase.

**Le chiffre qui rend le reste interpretable n'est pas le nombre de bonnes
candidates trouvees, c'est le nombre TOTAL produit.** Un generateur qui sort
cinq cents variantes et en garde trois n'a pas trouve trois strategies : il a
tire cinq cents fois. Le registre de l'atelier corrige deja par origine ; ce
module fournit l'autre moitie de l'information, en inscrivant le lot entier.

────────────────────────────────────────────────────────────────────────────
  LES SOURCES, ET CE QU'ELLES PEUVENT VRAIMENT
────────────────────────────────────────────────────────────────────────────

Le briefing demande de s'appuyer sur « internet, GitHub, reseaux sociaux ».
Mesure du 17 septembre 2026 depuis cette machine :

    api.hyperliquid.xyz          200    le marche
    api.github.com               200    mais borne au depot de la session
    raw.githubusercontent.com    301    idem
    www.tradingview.com          000    injoignable
    reddit.com                   000    injoignable

Le mandataire de sortie borne GitHub aux depots configures : une recherche de
code renvoie « sessions are bound to their configured repositories ».

**Un adaptateur indisponible le DIT, il ne rend pas une liste vide.** Une
liste vide se lirait comme « aucune strategie trouvee sur GitHub », ce qui est
un resultat ; l'indisponibilite est une absence de mesure. Confondre les deux
est le defaut que ce depot traque partout ailleurs.

Le chemin realiste pour les strategies externes est donc `fichier` : on
telecharge ailleurs, on depose un JSONL, on importe. C'est moins seduisant
qu'un robot qui ratisse GitHub, et c'est ce qui marche.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from .biblio import Ticket

RACINE = Path(__file__).resolve().parents[2]
DONNEES = RACINE / "data"
LOTS = DONNEES / "lots_generes.jsonl"

# Les facons de deriver une recette. Chacune repond a une question differente,
# et c'est pour ca qu'elles sont nommees plutot que melangees dans un « muter ».
DERIVATIONS = ("parametres", "actif", "intervalle", "inversion")

# L'amplitude des perturbations de parametres. Plus large que le pas du relief
# (10 %), parce que le relief interroge le VOISINAGE d'un reglage tandis que
# la derivation cherche un reglage DIFFERENT.
AMPLITUDES = (0.25, 0.50)


# Le motif exact pose par `sources(sonder=False)`. Il vaut mieux qu'une chaine
# libre : l'ecran doit pouvoir DISTINGUER « mesure indisponible » de « pas
# mesure », et comparer une chaine a la main finirait par diverger.
NON_SONDE = "non sondé"


@dataclass(frozen=True)
class Source:
    cle: str
    quoi: str
    disponible: bool
    motif: str = ""

    @property
    def sondee(self) -> bool:
        """A-t-on REELLEMENT verifie, ou seulement supposé ?

        « Indisponible » et « pas mesuré » ne sont pas la meme chose, et les
        afficher pareil ferait lire une absence de mesure comme un resultat.
        C'est le defaut que ce depot traque partout ailleurs, applique ici a
        une ligne de tableau.
        """
        return self.motif != NON_SONDE


@dataclass
class Lot:
    """Un lot de candidates, avec son compte COMPLET.

    `produits` compte tout ce que la generation a fabrique, y compris ce qui a
    ete ecarte. C'est lui qui rend le lot interpretable — un lot dont on ne
    garderait que les retenues raconterait qu'on a eu de la chance.
    """

    source: str
    parent: str | None
    derivation: str | None
    tickets: list[Ticket] = field(default_factory=list)
    produits: int = 0
    ecartes: int = 0
    motifs_ecart: dict[str, int] = field(default_factory=dict)
    genere_ms: int = 0

    def en_dict(self) -> dict[str, Any]:
        return {
            "genere_ms": self.genere_ms or int(time.time() * 1000),
            "source": self.source, "parent": self.parent,
            "derivation": self.derivation,
            "produits": self.produits, "retenus": len(self.tickets),
            "ecartes": self.ecartes, "motifs_ecart": self.motifs_ecart,
            "tickets": [t.en_dict() for t in self.tickets],
        }


# ──────────────────────────────────────────────────────── les sources

def _joignable(url: str, delai: float = 8.0) -> tuple[bool, str]:
    """Sonde une URL. Rend (joignable, motif d'echec).

    On sonde REELLEMENT plutot que de supposer : une liste de sources codee en
    dur qui se declarerait disponible ferait echouer le generateur au moment
    de s'en servir, avec un message sans rapport.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "desk/1.0"})
        with urllib.request.urlopen(req, timeout=delai) as r:
            return (200 <= r.status < 400), f"HTTP {r.status}"
    except urllib.error.HTTPError as exc:
        corps = ""
        try:
            corps = json.loads(exc.read().decode())["message"][:110]
        except Exception:
            pass
        return False, f"HTTP {exc.code}" + (f" — {corps}" if corps else "")
    except Exception as exc:
        return False, f"{type(exc).__name__} : {str(exc)[:70]}"


def sources(sonder: bool = True) -> list[Source]:
    """Les sources, avec leur disponibilite REELLE si on sonde.

    `sonder=False` pour les tests et les machines hors ligne : la sonde coute
    quelques secondes et ne doit pas rendre le module inutilisable sans
    reseau.
    """
    out = [
        Source("catalogue", "les stratégies déjà codées dans le dépôt",
               True, "toujours disponible, hors ligne"),
        Source("derivation", "dériver une recette existante", True,
               "toujours disponible, hors ligne"),
        Source("fichier", "importer un JSONL de recettes déposé à la main",
               True, "toujours disponible, hors ligne"),
    ]
    if not sonder:
        out += [Source("github", "recherche de code sur GitHub", False,
                       NON_SONDE),
                Source("web", "pages publiques de stratégies", False,
                       NON_SONDE)]
        return out

    ok, motif = _joignable(
        "https://api.github.com/search/repositories?q=backtest&per_page=1")
    out.append(Source("github", "recherche de code sur GitHub", ok, motif))
    ok2, motif2 = _joignable("https://www.tradingview.com/")
    out.append(Source("web", "pages publiques de stratégies", ok2, motif2))
    return out


# ────────────────────────────────────────────────────── les derivations

def _perturber(params: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for cle, valeur in sorted(params.items()):
        if not isinstance(valeur, (int, float)) or isinstance(valeur, bool):
            continue
        entier = isinstance(valeur, int)
        for amp in AMPLITUDES:
            for sens in (-1, 1):
                v = valeur * (1 + sens * amp)
                if entier:
                    v = int(round(v))
                    if v < 1 or v == valeur:
                        continue
                elif abs(v - valeur) < 1e-12:
                    continue
                out.append({**params, cle: v})
    return out


def deriver(parent: Ticket, quoi: str, *,
            actifs: Sequence[str] = (), intervalles: Sequence[str] = ()
            ) -> list[Ticket]:
    """Les derivees d'un ticket, selon une seule dimension a la fois.

    Une seule dimension, parce que chaque derivation repond a une question
    precise : « d'autres reglages marchent-ils ? », « la recette tient-elle
    sur un autre actif ? », « a une autre echelle ? », « et a l'envers ? ».
    Les combiner produirait beaucoup de candidates et aucune reponse.
    """
    if quoi not in DERIVATIONS:
        raise ValueError(f"dérivation inconnue : {quoi!r} (attendu {DERIVATIONS})")

    base = dict(parent.__dict__)
    base.pop("cle", None)
    out: list[Ticket] = []

    if quoi == "parametres":
        for p in _perturber(parent.parametres):
            out.append(Ticket(**{**base, "parametres": p,
                                 "cle": f"{parent.strategie}_"
                                        f"{parent.actif.lower()}_"
                                        f"{parent.intervalle}"}))
    elif quoi == "actif":
        for a in actifs:
            if a == parent.actif:
                continue
            out.append(Ticket(**{**base, "actif": a,
                                 "cle": f"{parent.strategie}_{a.lower()}_"
                                        f"{parent.intervalle}"}))
    elif quoi == "intervalle":
        for i in intervalles:
            if i == parent.intervalle:
                continue
            out.append(Ticket(**{**base, "intervalle": i,
                                 "cle": f"{parent.strategie}_"
                                        f"{parent.actif.lower()}_{i}"}))
    elif quoi == "inversion":
        out.append(Ticket(**{
            **base, "strategie": f"inverse:{parent.strategie}",
            "cle": f"inverse_{parent.strategie}_{parent.actif.lower()}_"
                   f"{parent.intervalle}",
            "signal": f"l'inverse de : {parent.signal}"[:200],
        }))

    # La filiation est portee par la note libre plutot que par un champ, pour
    # que l'empreinte du ticket reste celle de la RECETTE : deux desks qui
    # ecrivent la meme recette par des chemins differents doivent produire la
    # meme empreinte, sinon la deduplication a l'import ne marche plus.
    return [Ticket(**{**t.__dict__,
                      "note_libre": f"dérivée ({quoi}) de {parent.empreinte()}"})
            for t in out]


# ─────────────────────────────────────────────────────── la generation

def depuis_catalogue(actifs: Sequence[str], intervalles: Sequence[str],
                     *, auteur: str = "") -> Lot:
    """Une candidate par (strategie du catalogue x actif x intervalle).

    C'est la source la plus honnete du generateur : elle ne trouve rien, elle
    ENUMERE. Le denominateur est donc exact et connu d'avance.
    """
    from .atelier import defauts
    from .backtest.strategies import BASELINES

    lot = Lot(source="catalogue", parent=None, derivation=None,
              genere_ms=int(time.time() * 1000))
    for nom in sorted(BASELINES):
        for a in actifs:
            for i in intervalles:
                lot.produits += 1
                try:
                    params = defauts(nom, i)
                except Exception as exc:
                    lot.ecartes += 1
                    lot.motifs_ecart["paramètres par défaut indisponibles"] = \
                        lot.motifs_ecart.get(
                            "paramètres par défaut indisponibles", 0) + 1
                    del exc
                    continue
                lot.tickets.append(Ticket(
                    cle=f"{nom}_{a.lower()}_{i}", strategie=nom, actif=a,
                    intervalle=i, parametres=params, origine="balayage",
                    auteur=auteur, inscrit_ms=lot.genere_ms,
                    note_libre="énumération du catalogue"))
    return lot


def depuis_derivation(parent: Ticket, quoi: str, *,
                      actifs: Sequence[str] = (),
                      intervalles: Sequence[str] = (),
                      connus: set[str] | None = None) -> Lot:
    """Les derivees d'un parent, en ecartant celles deja connues.

    Ecarter un doublon n'est PAS gratuit : la candidate a quand meme ete
    produite, donc elle compte dans `produits`. Ne compter que les nouvelles
    ferait croire que le generateur explore alors qu'il repasse au meme
    endroit.
    """
    connus = connus or set()
    lot = Lot(source="derivation", parent=parent.empreinte(), derivation=quoi,
              genere_ms=int(time.time() * 1000))
    for t in deriver(parent, quoi, actifs=actifs, intervalles=intervalles):
        lot.produits += 1
        if t.empreinte() in connus:
            lot.ecartes += 1
            lot.motifs_ecart["déjà au registre"] = \
                lot.motifs_ecart.get("déjà au registre", 0) + 1
            continue
        lot.tickets.append(t)
        connus.add(t.empreinte())
    return lot


def depuis_fichier(chemin: Path, *, auteur: str = "") -> Lot:
    """Ingere un JSONL de recettes deposé a la main.

    **Le chemin realiste pour les strategies externes.** Le mandataire de
    sortie de cette machine borne GitHub aux depots configures ; on telecharge
    donc ailleurs et on depose le fichier ici.

    L'origine est forcee a `externe`, comme a l'import de bibliotheque et pour
    la meme raison : une recette venue d'ailleurs ne doit pas rejoindre le
    denominateur des idees du desk.
    """
    lot = Lot(source="fichier", parent=None, derivation=None,
              genere_ms=int(time.time() * 1000))
    if not chemin.exists():
        lot.motifs_ecart["fichier absent"] = 1
        return lot
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        lot.produits += 1
        try:
            d = json.loads(ligne)
        except ValueError:
            lot.ecartes += 1
            lot.motifs_ecart["ligne illisible"] = \
                lot.motifs_ecart.get("ligne illisible", 0) + 1
            continue
        if not isinstance(d, dict) or not d.get("strategie"):
            lot.ecartes += 1
            lot.motifs_ecart["sans stratégie"] = \
                lot.motifs_ecart.get("sans stratégie", 0) + 1
            continue
        t = Ticket.de_dict(d)
        lot.tickets.append(Ticket(**{**t.__dict__, "origine": "externe",
                                     "auteur": auteur or t.auteur}))
    return lot


def inscrire_lot(lot: Lot, chemin: Path | None = None) -> Path:
    """Enregistre le lot ENTIER, retenues et ecartees.

    C'est le denominateur du generateur. Un journal qui n'inscrirait que les
    retenues transformerait « trois sur cinq cents » en « trois trouvailles ».
    """
    p = chemin or LOTS
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(lot.en_dict(), ensure_ascii=False) + "\n")
    return p


def lots(chemin: Path | None = None) -> list[dict[str, Any]]:
    p = chemin or LOTS
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
        if isinstance(d, dict) and d.get("source"):
            out.append(d)
    return out


def bilan(chemin: Path | None = None) -> dict[str, Any]:
    """Ce que le generateur a produit EN TOUT, par source.

    Le chiffre a lire en premier est `produits`, pas `retenus`.
    """
    par_source: dict[str, dict[str, int]] = {}
    for l in lots(chemin):
        d = par_source.setdefault(str(l.get("source")),
                                  {"lots": 0, "produits": 0, "retenus": 0,
                                   "ecartes": 0})
        d["lots"] += 1
        d["produits"] += int(l.get("produits") or 0)
        d["retenus"] += int(l.get("retenus") or 0)
        d["ecartes"] += int(l.get("ecartes") or 0)
    total = {
        "lots": sum(d["lots"] for d in par_source.values()),
        "produits": sum(d["produits"] for d in par_source.values()),
        "retenus": sum(d["retenus"] for d in par_source.values()),
        "ecartes": sum(d["ecartes"] for d in par_source.values()),
    }
    return {"par_source": par_source, "total": total}
