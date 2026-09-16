"""L'atelier : fabriquer une strategie, l'essayer, et garder la trace de TOUT.

Ce module est la machine a chercher des strategies. C'est aussi, par
construction, une machine a fabriquer des faux positifs — et c'est pour ca
qu'il est ecrit comme il est ecrit.

**Le probleme, en un chiffre.** Essayer cinquante combinaisons et garder la
meilleure donne, sur du bruit pur, une meilleure cellule a p ~ 0,02. Elle
aura l'air excellente. Elle ne vaudra rien. Ce depot a deja paye cette
lecon : quatre-vingt-quatre cellules de la grille de robustesse, dix-huit a
p < 0,05, quatre virgule deux attendues par pur hasard, zero survivant apres
correction. Un atelier qui laisserait classer les essais par rendement sans
rien dire d'autre serait un generateur d'illusions avec une jolie interface.

Trois proprietes le rendent honnete, et aucune n'est optionnelle :

**1. Le registre est en AJOUT SEUL.** Un essai inscrit compte, gagnant ou
perdant. C'est la meme regle que le journal des deblocages, et pour la meme
raison : un registre qu'on peut nettoyer ne mesure plus rien, il documente
les essais dont on se souvient avec plaisir. Le nombre d'essais tentes est
la donnee qui rend le meilleur d'entre eux interpretable.

**2. La correction porte sur TOUT le registre.** Benjamini-Hochberg est
applique a l'ensemble des combinaisons distinctes essayees, pas a celle
qu'on regarde. Corriger une cellule sur elle-meme sous-estime le nombre
d'hypotheses testees, donc le nombre de faux positifs attendus — c'est
l'erreur exacte que `--from-json` de la grille existe pour empecher.

**3. Un essai repete n'est pas une hypothese de plus.** Le moteur est
deterministe : memes barres, memes parametres, meme resultat. Relancer une
combinaison ne la teste pas deux fois. Le criblage compte donc les
SIGNATURES distinctes, et garde le resultat le plus recent de chacune.

**Ce que l'atelier ne fait pas.** Il ne passe aucun ordre, ne touche pas au
desk et n'ecrit que dans `data/`. Aucune combinaison, aussi belle soit-elle,
n'est branchee sur quoi que ce soit par ce module : le passage d'un essai a
une regle deployee demande un test HORS echantillon, et c'est une decision
humaine.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

from .backtest.strategies import BASELINES, parametres
from .epreuves import Verdict, nets_par_mois, soumettre
from .scorer import noter

RACINE = Path(__file__).resolve().parents[2]
DONNEES = RACINE / "data"
REGISTRE = DONNEES / "registre_atelier.jsonl"

# Le nombre de tirages fixe le PLANCHER de p a 1/(D+1). En dessous de 200, un
# essai ne peut pas descendre sous 0,005 et un criblage sur quelques dizaines
# de combinaisons devient aveugle avant meme de commencer.
TIRAGES_MIN, TIRAGES_DEFAUT, TIRAGES_MAX = 200, 2000, 20000

# D'ou vient la candidate. L'idee est de Flo, qui tague la provenance de
# chacune de ses recettes ; elle vaut plus ici que chez lui, parce que le
# DENOMINATEUR est par origine.
#
# Cinq cents cellules produites par un generateur et trois idees tapees a la
# main ne sont pas le meme espace d'hypotheses. Les corriger ensemble est faux
# dans les deux sens : ca punit les trois idees reflechies, qui se retrouvent
# a porter le poids statistique de cinq cents essais qu'elles n'ont pas
# demandes, et ca absout les cinq cents, noyees dans un denominateur ou la
# correction au rang 1 devient si laxiste qu'elle ne rejette plus rien.
#
# Consequence pratique : une strategie importee de l'exterieur ne pollue pas
# le denominateur des notres, et inversement. C'est ce qui rend l'echange de
# recettes possible sans casser la statistique de personne.
ORIGINES = ("main", "balayage", "llm", "externe")
ORIGINE_DEFAUT = "main"

# Bornes par NOM de parametre. Elles ne sont pas cosmetiques : le formulaire
# vient du navigateur, et le serveur n'ecoute que 127.0.0.1 — ce qui veut dire
# joignable par tout ce qui tourne sur la machine, y compris un autre onglet.
# Une periode de dix millions de barres ne planterait pas, elle occuperait la
# machine assez longtemps pour que le collecteur perde des messages.
BORNES: dict[str, tuple[float, float]] = {
    "fast": (1, 500), "slow": (2, 2000), "medium": (2, 1000),
    "entry_period": (2, 2000), "exit_period": (2, 2000),
    "lookback": (2, 5000), "period": (2, 500),
    "atr_period": (2, 500), "rsi_period": (2, 500), "adx_period": (2, 500),
    "low": (0, 100), "high": (0, 100), "exit_level": (0, 100),
    "rsi_seuil": (0, 100), "adx_tendance": (0, 100), "adx_range": (0, 100),
    "atr_stop": (0.1, 20), "atr_target": (0.1, 50), "atr_equilibre": (0.1, 20),
}
BORNE_PAR_DEFAUT = (1, 5000)


# ------------------------------------------------------------------ catalogue

def parametres_reglables(nom: str) -> dict[str, dict[str, Any]]:
    """Les parametres d'une strategie, LUS depuis sa signature.

    Une liste recopiee a la main derive : on ajoute un parametre a une
    strategie, le formulaire ne le propose pas, et personne ne s'en apercoit
    parce qu'un formulaire incomplet ressemble a un formulaire.

    Les parametres qui ne sont pas des nombres sont ecartes : `regime_switch`
    prend deux SOUS-STRATEGIES en arguments, et un formulaire ne compose pas
    des objets.
    """
    cls = BASELINES[nom]
    out: dict[str, dict[str, Any]] = {}
    for champ, p in inspect.signature(cls.__init__).parameters.items():
        if champ == "self" or not isinstance(p.default, (int, float)):
            continue
        if isinstance(p.default, bool):
            continue
        bas, haut = BORNES.get(champ, BORNE_PAR_DEFAUT)
        out[champ] = {
            "defaut": p.default,
            "entier": isinstance(p.default, int),
            "min": bas,
            "max": haut,
        }
    return out


def defauts(nom: str, intervalle: str) -> dict[str, Any]:
    """Les defauts de la strategie POUR CET INTERVALLE.

    `parametres()` convertit les horizons documentes en jours vers des
    barres. Proposer 55 barres de canal Turtle sur du 4 h donnerait neuf
    jours — ce n'est plus la regle des Turtles, et le formulaire l'aurait
    presente comme telle.
    """
    base = {c: d["defaut"] for c, d in parametres_reglables(nom).items()}
    base.update({c: v for c, v in parametres(nom, intervalle).items() if c in base})
    return base


def combinaisons_disponibles() -> dict[str, list[str]]:
    """Les (actif, intervalle) qui ont des barres SUR CETTE MACHINE.

    Le formulaire ne propose que ce qui existe. Offrir une cellule sans
    donnees produirait un essai qui echoue, et un echec de fichier manquant
    se lit comme un echec de strategie quand il arrive dans un tableau de
    resultats.
    """
    out: dict[str, set[str]] = {}
    for f in sorted(DONNEES.glob("*_*_real.json")):
        morceaux = f.stem.split("_")
        if len(morceaux) != 3 or morceaux[2] != "real":
            continue
        actif, intervalle = morceaux[0], morceaux[1]
        out.setdefault(actif, set()).add(intervalle)
    return {a: sorted(i) for a, i in sorted(out.items())}


def catalogue() -> dict[str, Any]:
    """Tout ce dont le formulaire a besoin, et rien qu'il ait a deviner."""
    return {
        "strategies": {
            nom: {
                "resume": (cls.__doc__ or "").strip().split("\n")[0][:180],
                "parametres": parametres_reglables(nom),
            }
            for nom, cls in BASELINES.items()
        },
        "donnees": combinaisons_disponibles(),
        "tirages": {"defaut": TIRAGES_DEFAUT,
                    "min": TIRAGES_MIN, "max": TIRAGES_MAX},
    }


# ------------------------------------------------------------- normalisation

def normaliser(nom: str, intervalle: str, choix: dict[str, Any]) -> dict[str, Any]:
    """Les parametres retenus : defauts de l'intervalle, ecretes aux bornes.

    Un parametre inconnu est IGNORE, pas rejete. Le formulaire et le code
    peuvent diverger le temps d'un rechargement de page, et refuser tout
    l'essai pour un champ de trop transformerait une broutille en panne.
    """
    reglables = parametres_reglables(nom)
    retenus = defauts(nom, intervalle)
    for champ, valeur in (choix or {}).items():
        if champ not in reglables:
            continue
        try:
            v = float(valeur)
        except (TypeError, ValueError):
            continue
        d = reglables[champ]
        v = max(d["min"], min(d["max"], v))
        retenus[champ] = round(v) if d["entier"] else float(v)
    return retenus


def signature(nom: str, actif: str, intervalle: str,
              params: dict[str, Any]) -> str:
    """L'identite d'une COMBINAISON, stable d'une execution a l'autre.

    Elle sert a compter les hypotheses : deux essais de meme signature ne
    sont pas deux tests, le moteur etant deterministe. Elle est courte parce
    qu'elle s'affiche, et prise sur un JSON trie parce qu'un dictionnaire
    n'a pas d'ordre garanti d'un processus a l'autre.
    """
    charge = json.dumps(
        {"s": nom, "a": actif, "i": intervalle,
         "p": {k: params[k] for k in sorted(params)}},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(charge.encode()).hexdigest()[:12]


# -------------------------------------------------------------------- essai

def essayer(nom: str, actif: str, intervalle: str, *,
            params: dict[str, Any] | None = None,
            tirages: int = TIRAGES_DEFAUT,
            equite: float = 1000.0,
            max_stop_bps: float | None = None,
            origine: str = ORIGINE_DEFAUT) -> dict[str, Any]:
    """Une combinaison, contre son modele nul. Rend la ligne du registre.

    Le modele nul est le cœur : il compare la strategie a des versions
    d'elle-meme qui entrent AU HASARD, avec les memes formes d'entree et les
    memes durees. Sans lui, un net positif ne dit pas si c'est le signal qui
    rapporte ou le simple fait d'etre en position sur un marche qui monte.
    """
    from .backtest.data import load_from_file
    from .backtest.engine import run_backtest
    from .backtest.null_model import randomization_test
    from .risk.limits import RiskLimits

    if nom not in BASELINES:
        raise ValueError(f"strategie inconnue : {nom}")
    if origine not in ORIGINES:
        raise ValueError(f"origine inconnue : {origine!r} (attendu {ORIGINES})")
    params = normaliser(nom, intervalle, params or {})
    tirages = max(TIRAGES_MIN, min(TIRAGES_MAX, int(tirages)))

    bars = load_from_file(str(DONNEES / f"{actif}_{intervalle}_real.json"),
                          actif, intervalle)
    limites = (RiskLimits() if max_stop_bps is None
               else RiskLimits(max_stop_distance_bps=Decimal(str(max_stop_bps))))
    obs = run_backtest(bars, BASELINES[nom](**params), limits=limites,
                       interval=intervalle,
                       initial_equity_usd=Decimal(str(equite)))

    ligne: dict[str, Any] = {
        "essai_ms": int(time.time() * 1000),
        "signature": signature(nom, actif, intervalle, params),
        "strategie": nom, "actif": actif, "intervalle": intervalle,
        "parametres": params,
        "origine": origine,
        "net_usd": float(obs.net_pnl_usd),
        "trades": len(obs.trades),
        "rejets": obs.rejected_by_risk,
        # La decomposition mensuelle est inscrite pour que l'epreuve du
        # retrait d'un mois soit rejouable depuis le registre seul, sans
        # relancer le backtest. C'est ce qui permet de juger a posteriori une
        # ligne ecrite il y a des semaines.
        "mois": nets_par_mois(obs.trades),
        # La note du scorer, inscrite AVEC l'essai. Elle ne decide de rien —
        # l'epreuve reste la porte — mais la recalculer plus tard exigerait de
        # relire les barres, et une ligne de registre doit pouvoir se lire
        # seule.
        "note": noter(obs, bars, equite=equite).en_dict(),
        "barres": len(bars),
        "equite": float(equite),
        "tirages": tirages,
        "p": None, "percentile": None, "hasard_moyen": None, "verdict": None,
    }
    # Le code qui a produit la ligne. Le moteur est deterministe A VERSION
    # DONNEE : sans ce champ, deux lignes de meme signature et de resultats
    # differents seraient inexplicables.
    try:
        from .version import version
        ligne["version"] = version()
    except Exception:
        ligne["version"] = None

    if obs.trades and tirages > 0:
        nul = randomization_test(bars, BASELINES[nom](**params), obs,
                                 draws=tirages, limits=limites,
                                 interval=intervalle,
                                 initial_equity_usd=Decimal(str(equite)))
        ligne.update({"p": float(nul.p_value),
                      "percentile": float(nul.percentile),
                      "hasard_moyen": float(nul.null_mean_usd),
                      "hasard_p5": float(nul.null_p5_usd),
                      "hasard_p95": float(nul.null_p95_usd),
                      "verdict": nul.verdict,
                      "trades_hasard": float(nul.mean_trades_random)})
    else:
        # Zero trade n'est pas un mauvais resultat, c'est une ABSENCE de
        # resultat : la strategie n'a jamais pris position sur ces barres.
        # Lui donner un p la ferait entrer dans le criblage comme une
        # hypothese testee, et gonflerait le denominateur avec du vide.
        ligne["raison_sans_p"] = ("aucun trade : rien a comparer au hasard"
                                  if not obs.trades else "tirages nuls")
    return ligne


# ----------------------------------------------------------------- registre

def inscrire(ligne: dict[str, Any], registre: Path | None = None) -> Path:
    """Ajoute au registre. **Jamais de reecriture, jamais de suppression.**

    C'est la propriete qui rend le classement lisible : le denominateur du
    criblage est le nombre d'essais reellement tentes. Un registre ou les
    ratages disparaissent transformerait « la meilleure de cinquante » en
    « une strategie a p = 0,02 ».
    """
    chemin = registre or REGISTRE
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with chemin.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
    return chemin


def lire(registre: Path | None = None) -> list[dict[str, Any]]:
    """Le registre, ligne a ligne. Une ligne illisible est SAUTEE, pas fatale.

    Un fichier en ajout seul peut se terminer par une ligne tronquee si le
    processus est tue en plein ecriture. Perdre le registre entier pour ca
    serait absurde.
    """
    chemin = registre or REGISTRE
    if not chemin.exists():
        return []
    out = []
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            entree = json.loads(ligne)
        except ValueError:
            continue
        if isinstance(entree, dict) and entree.get("signature"):
            out.append(entree)
    return out


def dernier_par_signature(essais: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Une ligne par COMBINAISON, la plus recente.

    Le moteur est deterministe : relancer une combinaison ne la teste pas
    une deuxieme fois. Compter les repetitions comme des hypotheses
    gonflerait le denominateur du criblage et rendrait la correction plus
    severe qu'elle ne doit l'etre — ce qui est une erreur dans l'autre sens,
    mais une erreur quand meme.
    """
    par_cle: dict[str, dict[str, Any]] = {}
    for e in sorted(essais, key=lambda x: int(x.get("essai_ms", 0))):
        par_cle[e["signature"]] = e
    return list(par_cle.values())


def voisines(essais: list[dict[str, Any]], origine: str) -> list[dict[str, Any]]:
    """Les autres combinaisons du registre essayees SOUS LA MEME ORIGINE.

    Une ligne sans origine est une ligne ecrite avant que le champ existe. On
    la rattache a `main` plutot que de l'ignorer : l'ignorer retirerait des
    hypotheses reellement testees du denominateur, ce qui rendrait la
    correction plus laxiste — exactement l'erreur que le registre en ajout
    seul existe pour empecher.
    """
    return [e for e in dernier_par_signature(essais)
            if e.get("origine", ORIGINE_DEFAUT) == origine]


def juger(ligne: dict[str, Any], *, registre: Path | None = None,
          essais: list[dict[str, Any]] | None = None,
          classe: str = "prix_mono") -> Verdict:
    """Le verdict des sept epreuves, avec le denominateur du registre.

    `essais` permet de juger sans relire le fichier — utile quand on classe
    tout le registre d'un coup, ou l'on paierait sinon une lecture par ligne.
    """
    tous = essais if essais is not None else lire(registre)
    origine = ligne.get("origine", ORIGINE_DEFAUT)
    return soumettre(ligne, voisines=voisines(tous, origine), classe=classe)


def classement(registre: Path | None = None,
               essais: list[dict[str, Any]] | None = None
               ) -> list[dict[str, Any]]:
    """Tout le registre, juge, la plus prometteuse en tete.

    **L'ordre n'est pas le rendement.** Classer par net mettrait en tete la
    meilleure de trente-cinq combinaisons sur du bruit, ce qui est le
    generateur d'illusions que l'atelier existe pour ne pas etre. L'ordre est
    d'abord l'etat du verdict, et le rendement ne departage que des candidates
    de meme etat.
    """
    tous = essais if essais is not None else lire(registre)
    rang = {"RETENUE": 0, "INCOMPLETE": 1, "REFUSEE": 2}
    sorties = []
    for ligne in dernier_par_signature(tous):
        verdict = juger(ligne, essais=tous)
        sorties.append({**ligne, "verdict_epreuves": verdict.en_dict(),
                        "resume_epreuves": verdict.resume()})
    sorties.sort(key=lambda x: (rang.get(x["verdict_epreuves"]["etat"], 3),
                                -(x.get("net_usd") or 0.0)))
    return sorties
