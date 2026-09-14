"""Lecture des artefacts de recherche, pour l'interface de supervision.

Ce module ne calcule aucun resultat neuf et n'ouvre aucune connexion. Il lit
ce que les campagnes ont laisse sur le disque et le rend affichable. La regle
qui le gouverne tient en une phrase : **un artefact absent est une information,
pas une panne.** Chaque section renvoie donc `disponible` et, quand elle vaut
faux, la raison — le fichier attendu, et la commande qui le produit.

C'est la difference entre un tableau de bord et un decor. Un panneau vide qui
n'explique pas son vide finit par etre lu comme « tout va bien ».

Deux precautions valent d'etre dites :

**Le cache est indexe sur la date de modification.** Le flux SSE demande
l'etat chaque seconde ; relire 400 ko de JSON a ce rythme ferait de la
supervision la principale charge de la machine.

**Le criblage verifie qu'il pouvait voir.** Un test de randomisation a D
tirages a un plancher de p a `1/(D+1)`. Benjamini-Hochberg exige `alpha/m` au
rang 1. Quand le plancher est au-dessus de ce seuil, aucune cellule ne peut
survivre quelle que soit la donnee : annoncer « zero survivant » serait alors
un faux negatif de mesure, pas un resultat de marche. Le cas s'est produit
pour de vrai — `baselines/grille.json` a ete produit a 200 tirages.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..sentinelle.validation import benjamini_hochberg

RACINE = Path(__file__).resolve().parents[3]
BASELINES = RACINE / "baselines"
DONNEES = RACINE / "data"
ALPHA = 0.05

_cache: dict[Path, tuple[float, Any]] = {}


def _lire_json(chemin: Path) -> tuple[Any, dict[str, Any]]:
    """Renvoie `(contenu, meta)`. `contenu` vaut None si le fichier manque.

    `meta` porte toujours de quoi afficher un panneau honnete : le chemin
    relatif attendu et, quand le fichier existe, sa date.
    """
    rel = str(chemin.relative_to(RACINE)) if chemin.is_relative_to(RACINE) else str(chemin)
    if not chemin.exists():
        return None, {"fichier": rel, "disponible": False,
                      "raison": f"{rel} absent de cette machine"}
    try:
        mtime = chemin.stat().st_mtime
    except OSError as exc:
        return None, {"fichier": rel, "disponible": False, "raison": str(exc)}

    vu = _cache.get(chemin)
    if vu is None or vu[0] != mtime:
        try:
            contenu = json.loads(chemin.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            return None, {"fichier": rel, "disponible": False,
                          "raison": f"{rel} illisible : {exc}"}
        _cache[chemin] = (mtime, contenu)
        vu = _cache[chemin]

    return vu[1], {
        "fichier": rel,
        "disponible": True,
        "date": datetime.fromtimestamp(mtime, UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "octets": chemin.stat().st_size,
    }


def _tirages(cellules: list[dict]) -> int | None:
    """Le nombre de tirages du modele nul, **s'il est inscrit dans l'artefact**.

    Il n'est pas deduit. La tentation etait forte — `p = (k+1)/(D+1)`, donc le
    plus petit p observe ressemble au plancher — et elle est fausse : le plus
    petit p observe MAJORE le plancher sans le determiner, puisque rien
    n'oblige une cellule a saturer. L'essai du 9 septembre 2026 l'a montre
    sans ambiguite : la campagne « direction » des declencheurs, tournee a
    2 000 tirages, affichait un plus petit p de 0,008 ; la deduction en tirait
    125 tirages, un plancher de 0,008, et declarait aveugle un criblage qui
    concluait pour de bon a l'absence d'edge directionnel.

    Se tromper dans ce sens est le pire des deux : cela transforme une
    refutation solide en « on ne sait pas ». Un artefact muet reste donc muet.
    """
    inscrits = {c["tirages"] for c in cellules if isinstance(c.get("tirages"), int)}
    return inscrits.pop() if len(inscrits) == 1 else None


def _criblage(cellules: list[dict], champ_p: str, *, alpha: float = ALPHA) -> dict[str, Any]:
    """Le verdict d'une campagne, lu comme un criblage et non comme n resultats.

    Trois chiffres, et le troisieme decide : combien de cellules battent le
    hasard, combien on en attendait sans aucun signal, et combien survivent a
    la correction. Le quatrieme les encadre : le test pouvait-il voir.

    **Ce que le plancher de p interdit exactement.** Benjamini-Hochberg retient
    les k plus petites valeurs telles que `p_(i) <= alpha * i / m`. Avec un
    plancher `f = 1/(D+1)`, la condition au rang i devient `f <= alpha * i / m`,
    donc il faut `i >= f * m / alpha` cellules **toutes au plancher** pour que
    quoi que ce soit survive. Deux consequences, et il faut les distinguer :

    - `f > alpha` : meme si les m cellules etaient toutes au plancher, aucune
      ne passerait. Le criblage ne peut RIEN rejeter — c'est l'aveuglement.
    - `ceil(f * m / alpha) > 1` : une cellule isolee ne peut pas survivre. Le
      criblage peut voir un effet large, pas un edge unique. C'est le cas de
      `baselines/grille.json`, tourne a 200 tirages : il faudrait huit cellules
      simultanement au plancher, et une strategie qui ne marche que sur une
      cellule serait invisible par construction.

    Ces deux verdicts ne sont rendus que si l'artefact inscrit son nombre de
    tirages. Sinon on le dit, et on s'arrete la.
    """
    testees = [c for c in cellules if isinstance(c.get(champ_p), (int, float))]
    if not testees:
        return {"cellules": len(cellules), "testees": 0, "bruts": 0,
                "attendues": 0.0, "survivants": [], "nb_survivants": 0,
                "resolution": "aucune cellule exploitable"}

    ps = [float(c[champ_p]) for c in testees]
    garde = benjamini_hochberg(ps, alpha)
    survivants = [c for c, k in zip(testees, garde, strict=True) if k]
    m = len(testees)
    seuil_rang1 = alpha / m
    draws = _tirages(testees)

    verdict = {
        "cellules": len(cellules),
        "testees": m,
        "bruts": sum(1 for p in ps if p < alpha),
        "attendues": round(alpha * m, 1),
        "survivants": sorted(survivants, key=lambda c: c[champ_p])[:8],
        "nb_survivants": len(survivants),
        "pires": sum(1 for p in ps if p > 1 - alpha),
        "p_min": round(min(ps), 5),
        "seuil_rang1": round(seuil_rang1, 5),
        "tirages": draws,
        "aveugle": False,
    }

    if draws is None:
        verdict["resolution"] = (
            "nombre de tirages non inscrit dans l'artefact : ce résultat ne "
            "peut pas être qualifié. Relancer la campagne pour l'inscrire."
        )
        return verdict

    plancher = 1 / (draws + 1)
    minimum = -(-plancher * m // alpha)          # plafond entier
    verdict.update({
        "plancher": round(plancher, 6),
        "cellules_minimum": int(minimum),
        "aveugle": plancher > alpha,
        "tirages_requis": int(1 / seuil_rang1),
    })
    if plancher > alpha:
        verdict["resolution"] = (
            f"{draws} tirages : plancher de p à {plancher:.4f}, au-dessus de "
            f"α = {alpha}. Aucune cellule ne peut survivre, quelle que soit "
            f"la donnée."
        )
    elif minimum > 1:
        verdict["resolution"] = (
            f"{draws} tirages : il faudrait {int(minimum)} cellules toutes au "
            f"plancher pour qu'une seule survive. Un edge isolé est invisible "
            f"ici — il faudrait {int(1 / seuil_rang1)} tirages."
        )
    else:
        verdict["resolution"] = (
            f"{draws} tirages : la résolution permet de rejeter une cellule "
            f"isolée. Ce verdict porte sur la donnée."
        )
    return verdict


# --------------------------------------------------------------- campagnes

# `question` n'est pas decoratif. Une cellule qui survit en AMPLITUDE dit
# qu'il se passe quelque chose, pas dans quel sens : on ne peut pas la trader.
# Les additionner aux survivants directionnels produirait « 66 cellules
# survivent » sur un projet dont toutes les campagnes de direction concluent a
# zero. C'est la confusion que le README traite comme la faute a ne pas
# commettre, et l'interface l'a commise le 9 septembre 2026 avant ce champ.
_CAMPAGNES = (
    ("grille.json", "Stratégies classiques", "p", "rendement",
     "5 stratégies × 7 actifs × 2 intervalles, chacune contre son modèle nul",
     "python scripts/robustness_grid.py --draws 2000"),
    ("grille_switch.json", "Régime commuté", "p", "rendement",
     "la même grille pour `regime_switch`, ajoutée après coup",
     "python scripts/robustness_grid.py --strategies regime_switch --draws 2000"),
    ("declencheurs.json", "Déclencheurs — direction", "p_direction", "direction",
     "les 7 déclencheurs de la Sentinelle prédisent-ils le SENS",
     "python scripts/valider_declencheurs.py"),
    ("declencheurs.json", "Déclencheurs — amplitude", "p_amplitude", "amplitude",
     "prédisent-ils qu'il se PASSE quelque chose — sans dire dans quel sens",
     "python scripts/valider_declencheurs.py"),
    ("declencheurs_horizons_longs.json", "Horizons longs — amplitude",
     "p_amplitude", "amplitude", "la même question de 24 h à 336 h",
     "python scripts/valider_declencheurs.py --horizons-longs"),
    # La seule campagne du dépôt qui ait conclu à un edge DIRECTIONNEL. Elle
    # n'écrit son artefact que si on le lui demande — d'où le `--out` dans la
    # commande affichée : sans lui, ce panneau reste vide alors que le
    # résultat existe.
    # Deux entrees pour un seul fichier, et l'ordre compte : le test POOLÉ
    # d'abord, parce que c'est celui qui repond a l'hypothese sous sa forme
    # reelle. L'hypothese posee d'avance est « un deblocage fait baisser le
    # prix » — un effet COMMUN a tous les jetons. Le criblage par jeton
    # l'evalue 269 fois separement puis corrige sur 269 tests : si l'effet
    # est reel mais modeste, chaque jeton manque de puissance, aucune cellule
    # ne passe, et la correction conclut « rien » sur une hypothese qu'elle
    # n'a jamais testee sous sa forme reelle. Le poolage fait 16 tests sur
    # des effectifs de plusieurs centaines.
    #
    # N'afficher que le second annoncerait la mort du seul edge directionnel
    # du depot. N'afficher que le premier cacherait que le criblage par jeton
    # ne trouve rien. Les deux, dans cet ordre.
    (("unlocks.json", "poolage"), "Déblocages — test poolé", "p", "direction",
     "tous les jetons ensemble : le marché vend-il AVANT la date "
     "(J-7 → J-1, sens court)",
     "python scripts/valider_unlocks.py --unlocks data/unlocks.json "
     "--tirages 2000 --out baselines/unlocks.json"),
    (("unlocks.json", "cellules"), "Déblocages — criblage par jeton",
     "p_direction", "direction",
     "la même hypothèse jeton par jeton, où chacun manque de puissance",
     "python scripts/valider_unlocks.py --unlocks data/unlocks.json "
     "--tirages 2000 --out baselines/unlocks.json"),
)

# Ce qui peut porter un ordre : un rendement qui bat le hasard, ou un sens
# predit. L'amplitude ne le peut pas.
TRADABLES = ("rendement", "direction")


def campagnes() -> list[dict[str, Any]]:
    """Les campagnes de validation, chacune avec son verdict recalculé.

    Recalcule plutot que relu : les nombres affiches doivent venir du fichier
    present sur cette machine, pas d'une prose ecrite a une autre date. Quand
    les deux divergent, c'est le fichier qui a raison sur ce qu'il contient.
    """
    out: list[dict[str, Any]] = []
    for nom, titre, champ, question, quoi, commande in _CAMPAGNES:
        # Un artefact porte soit une liste de cellules, soit un objet nomme
        # dont on lit une clé. Le second existe parce qu'un fichier peut
        # contenir DEUX tests de la meme hypothese a des puissances
        # differentes.
        fichier, clef = nom if isinstance(nom, tuple) else (nom, None)
        contenu, meta = _lire_json(BASELINES / fichier)
        entree = {"titre": titre, "quoi": quoi, "commande": commande,
                  "question": question, "tradable": question in TRADABLES, **meta}
        if clef and isinstance(contenu, dict):
            contenu = contenu.get(clef)
        elif clef and contenu is not None:
            entree.update({
                "disponible": False,
                "raison": f"{meta['fichier']} est au format d'avant le "
                          f"9 septembre 2026 (liste nue) et ne porte pas "
                          f"« {clef} ». Relancer la campagne.",
            })
            out.append(entree)
            continue

        if isinstance(contenu, list) and contenu:
            entree.update(_criblage(contenu, champ))
        elif contenu is not None:
            entree.update({"disponible": False,
                           "raison": f"{meta['fichier']} ne contient pas de cellules"})
        out.append(entree)
    return out


# -------------------------------------------------------------- stratégies

def strategies() -> dict[str, Any]:
    """L'inventaire des stratégies, et ce que la grille en a fait.

    L'inventaire vient du code — `BASELINES` est la source, pas une liste
    recopiee — et le bilan vient de la grille. Une strategie presente dans le
    code mais absente de la grille est signalee : c'est du code jamais
    confronte au hasard, et cela se voit.
    """
    from ..backtest.strategies import BASELINES as CATALOGUE

    grille, meta = _lire_json(BASELINES / "grille.json")
    switch, _ = _lire_json(BASELINES / "grille_switch.json")
    cellules = (grille or []) + (switch or [])

    crible = _criblage(cellules, "p") if cellules else {}
    survivants = {(c["strategie"], c["actif"], c["intervalle"])
                  for c in crible.get("survivants", [])}

    lignes = []
    for nom, cls in CATALOGUE.items():
        miennes = [c for c in cellules if c.get("strategie") == nom]
        testees = [c for c in miennes if isinstance(c.get("p"), (int, float))]
        gagnantes = [c for c in miennes if (c.get("net_usd") or 0) > 0]
        pires = [c for c in testees if c["p"] > 1 - ALPHA]
        doc = (cls.__doc__ or "").strip().split("\n")[0]
        lignes.append({
            "nom": nom,
            "resume": doc[:160],
            "cellules": len(miennes),
            "testees": len(testees),
            "gagnantes": len(gagnantes),
            "net_median": _mediane([float(c["net_usd"]) for c in miennes]),
            "p_min": min((c["p"] for c in testees), default=None),
            "pires_que_hasard": len(pires),
            "survit_bh": any(k[0] == nom for k in survivants),
            "jamais_testee": not miennes,
        })
    lignes.sort(key=lambda x: (not x["survit_bh"], x["p_min"] if x["p_min"] is not None else 1))
    return {**meta, "strategies": lignes, "criblage": crible,
            "actifs": sorted({c["actif"] for c in cellules if "actif" in c}),
            "intervalles": sorted({c["intervalle"] for c in cellules if "intervalle" in c})}


def _mediane(valeurs: list[float]) -> float | None:
    if not valeurs:
        return None
    v = sorted(valeurs)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


# -------------------------------------------------------------- navigation

def navigation(chemin: Path | None = None) -> dict[str, Any]:
    """Le journal hors echantillon des deblocages.

    C'est ce qui ressemble le plus a des positions ouvertes, et la nuance
    compte : **aucun ordre n'est passe.** Ce sont des predictions datees,
    inscrites AVANT les faits et impossibles a modifier apres — d'ou le format
    `jsonl` en ajout seul. Une prediction qu'on peut reecrire ne prouve rien.
    """
    p = chemin or DONNEES / "journal_unlocks.jsonl"
    rel = str(p.relative_to(RACINE)) if p.is_relative_to(RACINE) else str(p)
    if not p.exists():
        return {"disponible": False, "fichier": rel,
                "raison": f"{rel} absent — le journal vit sur la machine qui "
                          "lance la collecte hebdomadaire",
                "commande": "python scripts/journal_unlocks.py --inscrire",
                "positions": []}

    entrees = []
    for ligne in p.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            entrees.append(json.loads(ligne))
        except ValueError:
            continue

    maintenant = int(datetime.now(UTC).timestamp() * 1000)
    ouvertes = [e for e in entrees if int(e.get("sortie_ms", 0)) > maintenant]
    closes = [e for e in entrees if int(e.get("sortie_ms", 0)) <= maintenant]
    a_venir = [e for e in ouvertes if int(e.get("entree_ms", 0)) > maintenant]

    def _jour(ms: Any) -> str:
        try:
            return datetime.fromtimestamp(int(ms) / 1000, UTC).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            return "?"

    positions = [
        {
            "symbole": e.get("symbole"),
            "sens": e.get("sens"),
            "part_offre": e.get("part_offre"),
            "deblocage": _jour(e.get("deblocage_ms")),
            "entree": _jour(e.get("entree_ms")),
            "sortie": _jour(e.get("sortie_ms")),
            "inscrit": _jour(e.get("inscrit_ms")),
            "reference": e.get("reference"),
            "version": e.get("version"),
            "etat": ("close" if int(e.get("sortie_ms", 0)) <= maintenant
                     else "en cours" if int(e.get("entree_ms", 0)) <= maintenant
                     else "à venir"),
        }
        for e in sorted(entrees, key=lambda x: int(x.get("entree_ms", 0)))
    ]

    return {
        "disponible": True,
        "fichier": rel,
        "date": datetime.fromtimestamp(p.stat().st_mtime, UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "inscrites": len(entrees),
        "ouvertes": len(ouvertes),
        "a_venir": len(a_venir),
        "closes": len(closes),
        # Le releve du resultat demande le cours a deux dates : c'est un appel
        # reseau, donc il n'a pas sa place dans un serveur d'interface qui doit
        # repondre en millisecondes et rester utilisable hors ligne. Le journal
        # affiche donc les positions et leur etat ; le verdict reste au script.
        "resolution": "python scripts/journal_unlocks.py --resoudre",
        # Sous 50 fenetres closes, `--resoudre` REFUSE de conclure. L'interface
        # affiche la meme barre : elle ne doit pas laisser croire qu'un verdict
        # approche quand il est encore hors de portee.
        "seuil_conclusion": 50,
        "prochaine_fermeture": min((_jour(e.get("sortie_ms")) for e in ouvertes),
                                   default=None),
        "versions": sorted({e.get("version") for e in entrees if e.get("version")}),
        "positions": positions,
    }


# -------------------------------------------------------------- télémétrie

FLUX = ("trades", "book", "bbo", "ctx")


def telemetrie(racine: Path | str | None) -> dict[str, Any]:
    """La collecte de microstructure : ce qui est reellement sur le disque.

    L'enregistreur est le seul systeme du depot qui tourne en continu, et il
    tourne sur le VPS. Vu depuis une autre machine, ce panneau dira
    legitimement « racine absente » : ce n'est pas une panne, c'est que la
    collecte se passe ailleurs.

    On compte les fichiers et les octets sans les ouvrir. Lire l'en-tete de
    chaque Parquet demanderait `pyarrow` cote serveur d'interface, et le depot
    tient a ce que cette dependance reste confinee a `enregistreur/`.
    """
    if not racine:
        return {"disponible": False,
                "raison": "aucune racine de collecte configurée "
                          "(DESK_ENREGISTREUR_RACINE)",
                "actifs": []}
    r = Path(racine)
    if not r.is_dir():
        return {"disponible": False, "racine": str(r),
                "raison": f"{r} introuvable — la collecte tourne sur une autre machine",
                "actifs": []}

    actifs = []
    total_octets = 0
    total_fichiers = 0
    dernier = 0.0
    for dossier in sorted(x for x in r.iterdir() if x.is_dir()):
        par_flux: dict[str, dict[str, Any]] = {}
        for fichier in dossier.rglob("*.parquet"):
            nom = fichier.name.split("_")
            flux = nom[1] if len(nom) > 2 and nom[1] in FLUX else "?"
            try:
                st = fichier.stat()
            except OSError:
                continue
            e = par_flux.setdefault(flux, {"flux": flux, "fichiers": 0, "octets": 0,
                                           "partiels": 0, "dernier": 0.0})
            e["fichiers"] += 1
            e["octets"] += st.st_size
            e["partiels"] += 1 if fichier.parent.name == "partiel" else 0
            e["dernier"] = max(e["dernier"], st.st_mtime)
            total_octets += st.st_size
            total_fichiers += 1
            dernier = max(dernier, st.st_mtime)
        if not par_flux:
            continue
        actifs.append({
            "actif": dossier.name,
            "flux": [
                {**e, "dernier": datetime.fromtimestamp(e["dernier"], UTC)
                 .strftime("%Y-%m-%d %H:%M UTC")}
                for e in sorted(par_flux.values(), key=lambda x: x["flux"])
            ],
            "octets": sum(e["octets"] for e in par_flux.values()),
        })

    maintenant = datetime.now(UTC).timestamp()
    return {
        "disponible": True,
        "racine": str(r),
        "actifs": actifs,
        "fichiers": total_fichiers,
        "octets": total_octets,
        "flux_attendus": list(FLUX),
        "dernier": datetime.fromtimestamp(dernier, UTC).strftime("%Y-%m-%d %H:%M UTC")
        if dernier else None,
        "silence_s": int(maintenant - dernier) if dernier else None,
    }


# ------------------------------------------------------------ consommation

_POLITIQUES = {
    "uniforme": "Opus partout — la référence, et la plus chère",
    "economique": "Haiku partout — le plancher de coût",
    "diversifie": "Haiku pour lire, Opus pour décider",
}


def consommation() -> dict[str, Any]:
    """Ce que coûte une décision, et ce qu'on obtient pour ce prix.

    Un desk agentique se juge sur deux axes que rien n'oblige a aller
    ensemble : le cout par cycle, et le nombre de mandats emis. Le second a
    valu zero sur toute la campagne du 8 septembre. Afficher le premier sans
    le second donnerait un tableau de bord de consommation d'essence pour un
    appareil qui n'a pas decolle.
    """
    pol, meta_pol = _lire_json(BASELINES / "politiques.json")
    qual, meta_qual = _lire_json(BASELINES / "qualite_diversifie.json")

    politiques = []
    for p in (pol or []):
        agents = p.get("agents") or {}
        politiques.append({
            "politique": p.get("politique"),
            "quoi": _POLITIQUES.get(str(p.get("politique")), ""),
            "cycles": p.get("cycles"),
            "cout_total": p.get("cout_total"),
            "cout_par_cycle": p.get("cout_par_cycle"),
            "non_tarifes": p.get("appels_non_tarifes"),
            "etapes": p.get("etapes") or {},
            "agents": [
                {
                    "agent": nom,
                    "appels": a.get("appels"),
                    "valides_pct": a.get("valides_pct"),
                    "abstentions_pct": a.get("abstentions_pct"),
                    "cout_par_appel": a.get("cout_par_appel"),
                    "p95_ms": a.get("p95_ms"),
                    "modeles": a.get("modeles") or [],
                }
                for nom, a in sorted(agents.items())
            ],
        })

    qualite = {}
    if isinstance(qual, dict):
        # Le fichier porte le nom de la politique en clé de premier niveau.
        for nom, bloc in qual.items():
            if not isinstance(bloc, dict):
                continue
            entrees = bloc.get("entrees") or []
            scores = [float(e["conviction"]) for e in entrees
                      if _flottant(e.get("conviction")) is not None]
            qualite = {
                "politique": nom,
                "cycles": bloc.get("cycles"),
                "cout_total": bloc.get("cout_total"),
                "emis": bloc.get("emis"),
                "rejetes": bloc.get("rejetes"),
                "esperance_emis": bloc.get("esperance_emis"),
                "esperance_rejets": bloc.get("esperance_rejets"),
                "discrimination": bloc.get("discrimination"),
                "etapes": bloc.get("etapes") or {},
                "scores": _histogramme(scores),
                "score_max": max(scores) if scores else None,
                "score_median": _mediane(scores),
                "issues": _compte(e.get("outcome") for e in entrees),
                "arrets": _compte(e.get("reason", "").split(" ")[0] for e in entrees),
            }
            break

    return {
        "politiques": politiques, "politiques_meta": meta_pol,
        "qualite": qualite, "qualite_meta": meta_qual,
        # Le seuil du portier. Tant que le score plafonne dessous, le desk ne
        # peut rien emettre — et c'est la seule ligne qui explique les zeros
        # de tous les autres panneaux.
        "seuil_conviction": 0.60,
    }


def _flottant(x: Any) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _compte(valeurs) -> dict[str, int]:
    out: dict[str, int] = {}
    for v in valeurs:
        if v:
            out[str(v)] = out.get(str(v), 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1])[:8])


def _histogramme(scores: list[float], pas: float = 0.05) -> list[dict[str, Any]]:
    """La distribution des scores, par tranches de 0,05.

    C'est la forme qui informe, pas la moyenne : un desk dont tous les scores
    se serrent a 0,50 n'a pas le meme probleme qu'un desk qui en produit a
    0,20 et a 0,58. Le premier n'evalue rien, le second evalue et refuse.
    """
    if not scores:
        return []
    seaux: dict[int, int] = {}
    for s in scores:
        seaux[int(s / pas)] = seaux.get(int(s / pas), 0) + 1
    return [{"borne": round(k * pas, 2), "n": n} for k, n in sorted(seaux.items())]


# ------------------------------------------------------------------- vols

def vols(store: Any) -> dict[str, Any]:
    """Les mandats émis, les exécutions, et le P&L réalisé.

    Ce panneau existe pour afficher un vide qui a une cause. Au 9 septembre
    2026 le desk n'a emis **aucun** mandat : 19 setups proposes sur 31
    cycles, 19 arretes a la porte du score. Une courbe de P&L plate a zero
    suggererait qu'on a trade sans rien gagner ; la verite est qu'on n'a pas
    trade, et c'est une information differente.

    **Convention de la courbe.** Le P&L realise se calcule en flux de
    tresorerie : une vente credite, un achat debite, les frais debitent
    toujours. Tant que le compte revient a plat, ce cumul EST le P&L realise.
    Position ouverte, il ne l'est pas — le panneau le dit alors plutot que
    d'afficher un chiffre qui melange du realise et du cout d'entree.
    """
    fills = list(store.recent_fills(500))
    mandats = list(store.recent_mandates(50))
    arrets = list(store.recent_halts(20))

    chronologie = sorted(fills, key=lambda f: f["ts_ms"])
    cumul = 0.0
    courbe: list[dict[str, Any]] = []
    net_taille: dict[str, float] = {}
    frais = 0.0
    for f in chronologie:
        taille = _flottant(f.get("size")) or 0.0
        prix = _flottant(f.get("price")) or 0.0
        cout = _flottant(f.get("fee_usd")) or 0.0
        achat = str(f.get("side", "")).upper() in ("BUY", "LONG", "B")
        cumul += (-taille * prix if achat else taille * prix) - cout
        frais += cout
        actif = str(f.get("asset"))
        net_taille[actif] = net_taille.get(actif, 0.0) + (taille if achat else -taille)
        courbe.append({"ts_ms": f["ts_ms"], "pnl_usd": round(cumul, 4)})

    ouvertes = {a: t for a, t in net_taille.items() if abs(t) > 1e-12}

    return {
        "mandats": len(mandats),
        "executions": len(fills),
        "frais_usd": round(frais, 4),
        "pnl_realise_usd": round(cumul, 4) if fills and not ouvertes else None,
        "pnl_indisponible": bool(ouvertes),
        "positions_ouvertes": sorted(ouvertes),
        "courbe": courbe,
        "derniers_mandats": [
            {"id": m["mandate_id"], "ts_ms": m["ts_ms"],
             "bias": (m["payload"] or {}).get("bias"),
             "universe": (m["payload"] or {}).get("universe")}
            for m in mandats[:10]
        ],
        "dernieres_executions": fills[:25],
        "arrets": arrets[:5],
        "aucun_vol": not fills,
        "pourquoi": (
            "Aucun ordre n'a jamais été passé. Le desk s'arrête au portier du "
            "score : sur la campagne du 8 septembre, 19 setups proposés, "
            "19 arrêtés, 0 mandat émis."
        ) if not fills else "",
    }


# ---------------------------------------------------------------- pré-vol

def prevol(*, verdict_risque: dict[str, Any] | None = None,
           telemetrie_: dict[str, Any] | None = None,
           navigation_: dict[str, Any] | None = None,
           consommation_: dict[str, Any] | None = None,
           vols_: dict[str, Any] | None = None,
           campagnes_: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """La liste de vérifications avant décollage.

    Elle remplace le panneau « trades en cours », et fait mieux que lui : elle
    dit POURQUOI il n'y en a pas. Chaque ligne porte un etat — `ok`, `attente`
    ou `bloc` — et la difference entre les deux derniers est celle qui compte.
    Une attente se resout avec du temps ; un blocage demande une decision.

    On ne recalcule rien ici : chaque ligne cite le panneau qui la produit.
    Une checklist qui reinterprete les regles finit par diverger du systeme
    qu'elle est censee surveiller.
    """
    lignes: list[dict[str, Any]] = []

    def ajouter(cle: str, titre: str, etat: str, detail: str, panneau: str) -> None:
        lignes.append({"cle": cle, "titre": titre, "etat": etat,
                       "detail": detail, "panneau": panneau})

    # 1. Un edge mesuré, corrigé pour tests multiples.
    campagnes_ = campagnes_ or []
    vivantes = [c for c in campagnes_ if c.get("disponible")]
    tradables = [c for c in vivantes if c.get("tradable")]
    survivants = sum(int(c.get("nb_survivants") or 0) for c in tradables)
    amplitude = sum(int(c.get("nb_survivants") or 0)
                    for c in vivantes if not c.get("tradable"))
    # Une campagne « non qualifiée » est celle dont l'artefact n'inscrit pas
    # son nombre de tirages : son zéro ne prouve rien, mais ne réfute rien non
    # plus. La distinguer d'un vrai zéro évite les deux erreurs symétriques —
    # croire à un edge absent, et jeter une réfutation solide.
    muettes = [c for c in tradables if c.get("tirages") is None]
    borgnes = [c for c in tradables if c.get("cellules_minimum", 1) > 1]
    if not vivantes:
        ajouter("edge", "Un edge DIRECTIONNEL survivant à la correction", "bloc",
                "aucune campagne lisible sur cette machine", "SOUFFLERIE")
    elif survivants:
        ajouter("edge", "Un edge DIRECTIONNEL survivant à la correction", "ok",
                f"{survivants} cellule(s) survivent à Benjamini-Hochberg sur "
                f"le rendement ou le sens", "SOUFFLERIE")
    elif muettes or borgnes:
        detail = "zéro survivant, mais "
        if borgnes:
            detail += (f"{len(borgnes)} campagne(s) trop peu résolue(s) pour "
                       f"détecter une cellule isolée")
        if muettes:
            detail += (" et " if borgnes else "")
            detail += f"{len(muettes)} sans nombre de tirages inscrit"
        ajouter("edge", "Un edge DIRECTIONNEL survivant à la correction", "attente",
                detail, "SOUFFLERIE")
    else:
        ajouter("edge", "Un edge DIRECTIONNEL survivant à la correction", "bloc",
                "zéro survivant, sur des campagnes assez résolues pour "
                "conclure : c'est une réfutation, pas une lacune", "SOUFFLERIE")

    # 1 bis. L'amplitude, qui est reelle et qui ne se trade pas seule.
    if amplitude:
        ajouter("amplitude", "Un effet d'amplitude mesuré", "ok",
                f"{amplitude} cellule(s) survivent — il se passe quelque chose "
                f"après un déclencheur, mais rien ne dit dans quel sens. "
                f"Ça ne porte pas un ordre directionnel.", "SOUFFLERIE")

    # 2. La validation hors échantillon, qui est la seule qui compte vraiment.
    nav = navigation_ or {}
    if not nav.get("disponible"):
        ajouter("hors_echantillon", "Validation hors échantillon", "attente",
                str(nav.get("raison", "journal absent")), "NAVIGATION")
    else:
        closes, seuil = int(nav.get("closes", 0)), int(nav.get("seuil_conclusion", 50))
        if closes >= seuil:
            ajouter("hors_echantillon", "Validation hors échantillon", "ok",
                    f"{closes} fenêtres closes, le verdict est calculable",
                    "NAVIGATION")
        else:
            ajouter("hors_echantillon", "Validation hors échantillon", "attente",
                    f"{closes}/{seuil} fenêtres closes — la première se ferme le "
                    f"{nav.get('prochaine_fermeture', '?')}", "NAVIGATION")

    # 3. Le portier du score : la cause directe des zéros partout ailleurs.
    conso = consommation_ or {}
    q = conso.get("qualite") or {}
    seuil_c = conso.get("seuil_conviction", 0.60)
    if q:
        smax = q.get("score_max")
        if q.get("emis"):
            ajouter("portier", "Le portier du score laisse passer", "ok",
                    f"{q['emis']} mandat(s) émis sur {q.get('cycles')} cycles",
                    "CONSOMMATION")
        elif smax is not None:
            ajouter("portier", "Le portier du score laisse passer", "bloc",
                    f"score maximum {smax:.2f} sur {q.get('rejetes')} évaluations, "
                    f"seuil {seuil_c:.2f} — jamais atteint", "CONSOMMATION")
        else:
            ajouter("portier", "Le portier du score laisse passer", "bloc",
                    "aucun score relevé", "CONSOMMATION")
    else:
        ajouter("portier", "Le portier du score laisse passer", "attente",
                "aucune campagne de qualité sur cette machine", "CONSOMMATION")

    # 4. La collecte, seul système réellement en marche.
    tel = telemetrie_ or {}
    if not tel.get("disponible"):
        ajouter("collecte", "Collecte de microstructure", "attente",
                str(tel.get("raison", "racine non configurée")), "TÉLÉMÉTRIE")
    else:
        silence = tel.get("silence_s")
        etat = "ok" if silence is not None and silence < 3600 else "attente"
        ajouter("collecte", "Collecte de microstructure", etat,
                f"{tel.get('fichiers', 0)} fichiers, {len(tel.get('actifs', []))} "
                f"actifs, dernier écrit {tel.get('dernier') or 'jamais'}",
                "TÉLÉMÉTRIE")

    # 5. Le moteur de risque, tel qu'il se prononce à l'instant.
    v = verdict_risque or {}
    bloquants = list(v.get("blocking") or [])
    if v.get("halted"):
        ajouter("risque", "Invariants de risque", "bloc",
                f"desk arrêté : {v.get('halt_reason') or 'motif inconnu'}", "PRÉ-VOL")
    elif bloquants:
        ajouter("risque", "Invariants de risque", "bloc",
                f"{len(bloquants)} invariant(s) en défaut : "
                + ", ".join(bloquants[:4]), "PRÉ-VOL")
    else:
        ajouter("risque", "Invariants de risque", "ok",
                "tous les invariants passent", "PRÉ-VOL")

    # 6. Le vol lui-même.
    vv = vols_ or {}
    if vv.get("aucun_vol"):
        ajouter("vol", "Ordres passés", "bloc", str(vv.get("pourquoi", "")), "VOLS")
    else:
        ajouter("vol", "Ordres passés", "ok",
                f"{vv.get('executions')} exécutions, {vv.get('mandats')} mandats",
                "VOLS")

    return lignes


def tout(store: Any = None, racine_collecte: Path | str | None = None) -> dict[str, Any]:
    """L'ensemble des panneaux, en un appel. Aucun effet de bord, aucun réseau."""
    camp = campagnes()
    tel = telemetrie(racine_collecte)
    nav = navigation()
    conso = consommation()
    v = vols(store) if store is not None else {"aucun_vol": True, "executions": 0,
                                               "mandats": 0, "courbe": [],
                                               "pourquoi": "aucun stockage attaché"}
    return {
        "campagnes": camp,
        "strategies": strategies(),
        "telemetrie": tel,
        "navigation": nav,
        "consommation": conso,
        "vols": v,
        "prevol": prevol(telemetrie_=tel, navigation_=nav, consommation_=conso,
                         vols_=v, campagnes_=camp),
    }
