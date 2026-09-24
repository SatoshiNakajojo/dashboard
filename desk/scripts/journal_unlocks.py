#!/usr/bin/env python3
"""La seule question qu'aucun test historique ne peut trancher.

    python3 scripts/journal_unlocks.py                  # inscrire
    python3 scripts/journal_unlocks.py --resoudre       # relever le score

Six contrôles ont survécu : dénominateurs aberrants, jackknife par jeton,
coupe temporelle, neutralisation du marché, décalage calendaire brut, et
décalage calendaire sur le rendement net. C'est tout ce qu'on peut demander
à 886 événements passés.

**Et ils partagent tous le même défaut, qui ne se corrige pas.** Ils ont été
construits, ajustés et relus en connaissant les données. Chaque décision de
méthode — la fenêtre J-7/J-1, les bornes des tranches, la durée de six jours
— a été prise par quelqu'un qui avait déjà vu le résultat, moi. Rien
n'indique que j'aie triché ; tout indique que je ne peux pas le prouver.

Une seule chose le peut : **prédire avant de savoir**.

## Ce que ce journal fait, et pourquoi il est ennuyeux

Il écrit les positions à prendre AVANT que la fenêtre ne s'ouvre, dans un
fichier qui ne se réécrit pas. Puis, des semaines plus tard, il relève ce
qui s'est passé.

C'est délibérément primitif, et trois propriétés comptent plus que le
confort :

**Le journal est en AJOUT SEUL.** Une prédiction inscrite compte, gagnante
ou perdante. Un journal qu'on peut nettoyer ne mesure plus rien — il ne fait
que documenter les trades dont on se souvient avec plaisir.

**La règle est figée dans chaque ligne.** Fenêtre, tranche, couverture,
version : tout est recopié dans l'entrée. Si je change la méthode dans six
semaines, les anciennes prédictions gardent l'ancienne règle et le score
reste comparable. Sans ça, « ajuster légèrement le seuil » suffirait à
transformer rétroactivement un échec en succès.

**Le protocole de notation est figé LUI AUSSI**, dans `trading_desk.pronostic`,
et son empreinte est recopiée dans chaque ligne. C'est la moitié qui manquait
: savoir d'avance ce qu'on inscrit ne sert à rien si l'on choisit après coup
comment le compter.

## Ce qui a changé en v3, et pourquoi

**On inscrit TOUT l'avenir du calendrier, plus seulement les trente
prochains jours.** L'horizon de trente jours faisait dépendre la
pré-inscription d'un rituel hebdomadaire qui, sur le VPS, n'a jamais tourné :
un oubli de trois semaines et les positions de ces trois semaines n'étaient
inscrites nulle part. Inscrire tout l'avenir d'un coup rend la preuve
indépendante de la régularité de l'exploitant — la date du commit git en
fait foi.

Le prix à payer est réel et il est noté dans chaque ligne : `horizon_j`, le
nombre de jours entre l'inscription et l'entrée. Un déblocage annoncé pour
2028 peut être repoussé, et sa part de l'offre recalculée. Cela ajoute du
BRUIT, jamais du biais — une date qui bouge ne bouge pas dans le sens du
prix — donc l'effet est de diluer, pas de flatter. Le relevé affiche le
détail par horizon pour que la dilution se voie.

## Ce qu'il faudra pour conclure

Le repère n'est PAS zéro, et c'est le point le plus important de ce fichier.
Vendre à découvert un altcoin au hasard pendant six jours, couvert en BTC,
rapportait +123,5 bps sur la période historique. Un relevé qui compare la
moyenne du journal à zéro mesure la dérive des altcoins, pas les déblocages.
`trading_desk.pronostic` porte le bras de hasard qui sert de repère, et le
relevé ci-dessous le recalcule sur la période que le journal a réellement
traversée.

L'excès à battre est de +218,9 bps, avec un écart-type de 1 131 bps par
position. Il faut donc **103 positions closes pour avoir une chance sur
deux de conclure, et 210 pour en avoir quatre sur cinq**. L'ancien chiffre
annoncé ici — « cinquante » — répondait à une question plus facile.

Et le calendrier du 18 septembre 2026 ne contient que 176 événements futurs
éligibles. Quatre chances sur cinq sont donc hors d'atteinte sans élargir la
couverture : 68 jetons au calendrier, 234 perpétuels cotés. C'est le rituel
hebdomadaire qui rafraîchit ce calendrier, et c'est pour ça qu'il compte.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import statistics as st
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

# IPv4 D'ABORD. La route IPv6 du VPS est cassee : elle etablit le TCP puis
# meurt sur la poignee de main TLS, et TOUTES les sources se mettent a
# repondre « SSL: UNEXPECTED_EOF_WHILE_READING » en meme temps. La raison,
# la mesure et le choix de reordonner plutot que de filtrer sont dans
# `trading_desk/reseau.py`.
from trading_desk.reseau import appliquer as _ipv4_d_abord  # noqa: E402

from trading_desk import pronostic
from trading_desk.backtest.data import fetch_hyperliquid
from trading_desk.deblocages import (
    DEBLOCAGE_AVANCE_J,
    DEBLOCAGE_DUREE_J,
    DEBLOCAGE_PART_MAX,
    DEBLOCAGE_PART_MIN,
    deblocages_retenus,
)

JOUR_MS = 86_400_000

# La règle, figée. Toute modification incrémente la VERSION, et les entrées
# des versions antérieures restent jugées sur la leur — sinon « ajuster
# légèrement le seuil » transformerait un échec passé en succès.
VERSION = 3
REFERENCE = pronostic.REFERENCE

# **La règle n'est PAS définie ici.** Elle vient de
# `sentinelle.triggers`, qui en est la seule source. Ce script inscrit des
# positions ; le déclencheur en réveille le desk ; `valider_unlocks.py` les
# a mesurées. Trois lecteurs, une définition.
#
# La duplication n'est pas une crainte théorique, elle a mordu deux fois :
# `poolage` et `decalage_calendaire` ordonnaient différemment la
# déduplication et le filtre de débordement, et la v1 de ce journal a
# inscrit XPL deux fois et un déblocage de 65 % de l'offre. Une copie dérive
# un jour, et la dérive ne se voit jamais dans les chiffres — elle se voit
# des mois plus tard, dans un score hors échantillon qui ne mesure pas la
# stratégie qu'on croyait.
ENTREE_J = -DEBLOCAGE_AVANCE_J
SORTIE_J = ENTREE_J + DEBLOCAGE_DUREE_J


def empreinte_calendrier(unlocks: dict) -> str:
    """De QUEL calendrier cette prédiction est sortie.

    Un déblocage lointain peut être reporté. Sans cette empreinte, on ne
    saurait pas, dans deux ans, si l'entrée vient d'un calendrier qui
    annonçait déjà cette date ou d'une révision ultérieure — et « la date
    avait bougé » deviendrait une excuse disponible après coup pour écarter
    les positions perdantes.
    """
    charge = json.dumps(unlocks, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(charge.encode()).hexdigest()[:16]


def a_prendre(unlocks: dict, maintenant_ms: int, horizon_j: int | None = None,
              univers: set[str] | None = None) -> list[dict]:
    """Les déblocages dont la fenêtre d'entrée n'est pas encore ouverte.

    `horizon_j` à `None` prend TOUT l'avenir du calendrier : c'est le mode
    normal depuis la v3. Le borner ne servait qu'à limiter la taille du
    fichier, et coûtait la pré-inscription de tout ce qui tombait pendant un
    oubli du rituel.

    On ne retient QUE les événements encore à venir. Un déblocage dont
    l'entrée est déjà passée serait une prédiction faite après coup, ce qui
    est exactement ce que ce journal existe pour rendre impossible.

    **Un seul événement par fenêtre et par jeton.** La validation applique
    `sans_chevauchement` : deux déblocages à trois jours d'écart produisent
    des fenêtres qui se recouvrent, donc une position tenue une fois et
    comptée deux. Sans cette règle ici, le journal inscrirait deux lignes
    là où la stratégie validée n'en prend qu'une, et le score hors
    échantillon porterait sur autre chose que ce qui a été mesuré.
    """
    calendrier = empreinte_calendrier(unlocks)
    protocole = pronostic.empreinte()
    out = []
    for symbole, bruts in sorted(unlocks.items()):
        if univers is not None and symbole not in univers:
            continue
        for e in deblocages_retenus(bruts):
            entree = e["ts_ms"] + ENTREE_J * JOUR_MS
            if entree <= maintenant_ms:
                continue
            if horizon_j is not None and entree > maintenant_ms + horizon_j * JOUR_MS:
                continue
            out.append({
                "version": VERSION, "symbole": symbole,
                "deblocage_ms": e["ts_ms"], "part_offre": e["part_offre"],
                "entree_ms": entree, "sortie_ms": e["ts_ms"] + SORTIE_J * JOUR_MS,
                "sens": "COURT", "reference": REFERENCE,
                "inscrit_ms": maintenant_ms,
                # Le nombre de jours de préavis. Une prédiction écrite sept
                # jours à l'avance et une écrite huit cents jours à l'avance
                # sont toutes deux hors échantillon, mais pas de la même
                # qualité : le relevé les sépare.
                "horizon_j": (entree - maintenant_ms) // JOUR_MS,
                "calendrier": calendrier,
                "protocole": protocole,
            })
    return out


def univers_hyperliquid() -> set[str] | None:
    """Les perpétuels réellement cotés. `None` si l'API est injoignable.

    Un déblocage sur un jeton qu'on ne peut pas vendre à découvert n'est pas
    une position, c'est une ligne dans un fichier. L'inscrire gonflerait le
    journal de prédictions que personne n'aurait pu prendre, et le score
    hors échantillon mesurerait un portefeuille imaginaire.

    En cas d'échec on renvoie `None` plutôt qu'un ensemble vide : un réseau
    coupé ne doit pas se traduire par « aucun jeton n'est cotable ».
    """
    import urllib.request
    try:
        req = urllib.request.Request(
            "https://api.hyperliquid.xyz/info",
            data=json.dumps({"type": "meta"}).encode(),
            headers={"Content-Type": "application/json"})
        meta = json.loads(urllib.request.urlopen(req, timeout=20).read())
        return {a["name"] for a in meta["universe"]}
    except Exception:
        return None


def purger_version(journal: Path, version: int) -> tuple[bool, str]:
    """Retire les entrées d'une version — **et refuse dès qu'une est close**.

    Le principe d'ajout seul existe pour empêcher une chose précise :
    effacer une prédiction parce qu'elle a perdu. Ce refus doit être
    structurel, pas une promesse — donc la fonction vérifie elle-même
    qu'AUCUNE fenêtre de la version visée n'est close. Tant que rien n'est
    arrivé, il n'y a aucun résultat sur lequel sélectionner, et retirer des
    lignes écrites sous une règle mal implémentée ne peut pas flatter le
    score.

    Une seconde après la clôture de la première fenêtre, ce n'est plus vrai
    et la fonction refuse — définitivement.
    """
    if not journal.exists():
        return False, "journal inexistant"
    lignes = [json.loads(x) for x in journal.read_text().splitlines() if x.strip()]
    vises = [x for x in lignes if x["version"] == version]
    if not vises:
        return False, f"aucune entrée en v{version}"
    maintenant = int(time.time() * 1000)
    closes = [x for x in vises if x["sortie_ms"] < maintenant]
    if closes:
        return False, (
            f"REFUS : {len(closes)} fenêtre(s) de la v{version} sont déjà "
            "closes.\n  Leur résultat existe, et le retirer serait "
            "sélectionner sur l'issue.\n  C'est exactement ce que le journal "
            "interdit.")
    restant = [x for x in lignes if x["version"] != version]
    journal.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n"
                               for x in restant))
    return True, f"{len(vises)} entrée(s) v{version} retirées, aucune close"


def inscrire(nouvelles: list[dict], journal: Path) -> int:
    """Ajoute les prédictions absentes. **Jamais de réécriture.**

    La clé d'unicité est (version, jeton, date de déblocage) : relancer le
    script deux fois le même jour ne doit pas dupliquer une position, mais
    ne doit pas non plus effacer ce qui est déjà inscrit.

    Un déblocage REPORTÉ arrive donc sous une autre clé et s'ajoute, sans
    effacer l'ancienne ligne. Les deux comptent. C'est volontaire : retirer
    la ligne devenue caduque supposerait de décider, après avoir vu le prix,
    laquelle des deux dates était la bonne.
    """
    lignes = []
    if journal.exists():
        lignes = [json.loads(x) for x in journal.read_text().splitlines() if x.strip()]
    connues = {(x["version"], x["symbole"], x["deblocage_ms"]) for x in lignes}
    ajouts = [n for n in nouvelles
              if (n["version"], n["symbole"], n["deblocage_ms"]) not in connues]
    journal.parent.mkdir(parents=True, exist_ok=True)
    with journal.open("a") as f:
        for n in ajouts:
            f.write(json.dumps(n, ensure_ascii=False) + "\n")
    return len(ajouts)


def lire(journal: Path) -> list[dict]:
    if not journal.exists():
        return []
    out = []
    for ligne in journal.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if ligne:
            try:
                out.append(json.loads(ligne))
            except ValueError:
                # Une ligne illisible est ignorée, jamais fatale : le journal
                # est la preuve, et une preuve qu'on ne peut plus ouvrir du
                # tout serait pire qu'une preuve amputée d'une ligne.
                continue
    return out


def carnets(symboles: set[str], jours: int) -> dict[str, dict[int, float]]:
    """Un carnet de clôtures par jeton, un seul appel réseau chacun.

    **Le cache disque de `fetch_hyperliquid` n'expire jamais** : sa clé est
    (actif, échelle, nombre de jours), donc deux relevés du même jeton au
    même horizon relisent indéfiniment le premier téléchargement. Pour un
    relevé hebdomadaire c'est un piège parfait — il continuerait à noter les
    positions sur les prix du jour où on l'a lancé la première fois, sans
    que rien ne le signale. D'où un dossier de cache DATÉ : frais chaque
    jour, gratuit si l'on relance dans la journée.
    """
    jour = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    cache = Path(".cache") / f"journal-{jour}"
    out: dict[str, dict[int, float]] = {}
    for s in sorted(symboles):
        try:
            bars = fetch_hyperliquid(s, "1d", days=jours, cache_dir=cache)
        except Exception:
            # Jeton délisté, réseau coupé, réponse inattendue : la ligne
            # devient incalculable, pas le relevé entier impossible.
            # `noter` compte les absents et les annonce.
            continue
        out[s] = {b.ts_ms // JOUR_MS: float(b.close) for b in bars}
    return out


def noter(lignes: list[dict], carnets_: dict[str, dict[int, float]],
          maintenant_ms: int) -> dict:
    """Le score, comparé au bras de hasard de la période traversée.

    Le repère n'est pas zéro. Une vente à découvert d'altcoin couverte en
    BTC gagne ou perd de l'argent selon le marché traversé, déblocage ou
    pas : `pronostic.bras_de_hasard` prend les mêmes jetons, le même
    effectif, la même durée, et tire les dates DANS LA FENÊTRE QUE LE
    JOURNAL A TRAVERSÉE. C'est ça que la règle doit battre.

    Un jeton dont la période offre moins de `JOURS_MIN_POUR_LE_HASARD` jours
    cotés est écarté des DEUX bras. L'écarter d'un seul comparerait deux
    portefeuilles différents.
    """
    closes = [x for x in lignes if int(x.get("sortie_ms", 0)) <= maintenant_ms]
    if not closes:
        return {"closes": 0, "notees": 0, "sans_prix": 0, "mesures": {}}

    jours = [int(x["entree_ms"]) // JOUR_MS for x in closes]
    bornes = (min(jours), max(int(x["sortie_ms"]) // JOUR_MS for x in closes))
    ref = carnets_.get(REFERENCE)

    resultats: dict[str, dict] = {}
    for mesure in (pronostic.BRUT, pronostic.NET):
        couverture = ref if mesure == pronostic.NET else None
        if mesure == pronostic.NET and not couverture:
            continue
        obs: list[tuple[dict, float]] = []
        candidats = []
        sans_prix = 0
        for x in closes:
            prix = carnets_.get(x["symbole"])
            if not prix:
                sans_prix += 1
                continue
            elig = pronostic.jours_eligibles(prix, reference=couverture,
                                             bornes=bornes)
            if len(elig) < pronostic.JOURS_MIN_POUR_LE_HASARD:
                sans_prix += 1
                continue
            r = pronostic.rendement(prix, int(x["entree_ms"]) // JOUR_MS,
                                    reference=couverture)
            if r is None:
                sans_prix += 1
                continue
            obs.append((x, r))
            candidats.append((prix, elig))
        if not obs:
            resultats[mesure] = {"n": 0, "sans_prix": sans_prix}
            continue
        valeurs = [r for _, r in obs]
        nuls = pronostic.bras_de_hasard(candidats, reference=couverture)
        moyenne = sum(valeurs) / len(valeurs)
        hasard = sum(nuls) / len(nuls) if nuls else 0.0
        resultats[mesure] = {
            "n": len(valeurs), "sans_prix": sans_prix,
            "observe_bps": moyenne, "hasard_bps": hasard,
            "exces_bps": moyenne - hasard,
            "p": pronostic.p_unilateral(moyenne, nuls),
            "ecart_type_bps": st.stdev(valeurs) if len(valeurs) > 1 else 0.0,
            "part_gagnante": sum(1 for v in valeurs if v > 0) / len(valeurs),
            "lignes": obs,
        }
    return {"closes": len(closes), "bornes": bornes, "mesures": resultats}


def _par_horizon(obs: list[tuple[dict, float]]) -> list[tuple[str, int, float]]:
    """Le détail par préavis. Une prédiction à huit cents jours dilue.

    Les bornes sont rondes et posées ici une fois pour toutes : les choisir
    au vu des résultats reviendrait à découper jusqu'à trouver la tranche
    qui gagne.
    """
    tranches = [("≤ 30 j", 0, 30), ("31-180 j", 31, 180),
                ("181-365 j", 181, 365), ("> 365 j", 366, 10**9)]
    out = []
    for nom, bas, haut in tranches:
        lot = [r for x, r in obs if bas <= int(x.get("horizon_j", 0)) <= haut]
        if lot:
            out.append((nom, len(lot), sum(lot) / len(lot)))
    return out


def resoudre(journal: Path, *, jours: int = 400) -> None:
    """Relève ce que les prédictions closes ont réellement donné."""
    lignes = lire(journal)
    if not lignes:
        print(f"\n  {journal} est vide ou absent. Lancez le script sans "
              "`--resoudre` pour inscrire les premières positions.\n")
        return
    maintenant = int(time.time() * 1000)
    closes = [x for x in lignes if int(x.get("sortie_ms", 0)) <= maintenant]
    attendu = pronostic.attendu()

    print(f"\n  JOURNAL HORS ÉCHANTILLON — règle v{VERSION}, "
          f"protocole {pronostic.empreinte()}")
    print("  " + "=" * 74)
    print(f"  {'positions inscrites':<34} {len(lignes):>6}")
    print(f"  {'dont la fenêtre est close':<34} {len(closes):>6}")
    if not closes:
        prochaine = min(int(x["sortie_ms"]) for x in lignes)
        quand = dt.datetime.fromtimestamp(prochaine / 1000, dt.UTC)
        print(f"  {'première clôture':<34} {quand:%Y-%m-%d}")
        print("\n  Rien à relever pour l'instant. C'est normal et c'est le "
              "principe :\n  une prédiction ne compte que lorsqu'elle est "
              "faite avant les faits.\n")
        return

    symboles = {x["symbole"] for x in closes} | {REFERENCE}
    score = noter(closes, carnets(symboles, jours), maintenant)
    mesures = score["mesures"]
    # LES POSITIONS PERDUES SE COMPTENT, TOUJOURS. Un relevé qui n'afficherait
    # que celles qu'il a su valoriser serait un relevé de survivants : un
    # jeton délisté après une chute est précisément le cas où la position
    # aurait gagné, et le taire flatterait ou plomberait le score sans qu'on
    # puisse savoir lequel.
    perdues = max((m.get("sans_prix", 0) for m in mesures.values()), default=len(closes))
    if not mesures or all(m.get("n", 0) == 0 for m in mesures.values()):
        print(f"  {'prix indisponibles':<34} {perdues:>6}")
        print("\n  Aucune position n'a pu être valorisée. Vérifiez l'accès à\n"
              "  api.hyperliquid.xyz, puis relancez.\n")
        return

    principal = mesures.get(pronostic.MESURE_PRIMAIRE) or {}
    if not principal.get("n"):
        # La mesure primaire est le net de BTC : sans le carnet de la
        # référence elle n'existe pas. Le brut s'afficherait quand même, et le
        # verdict porterait alors sur zéro position tout en montrant douze
        # lignes — l'écran dirait deux choses contradictoires.
        print(f"\n  La mesure primaire ({pronostic.MESURE_PRIMAIRE}) est "
              f"indisponible : le carnet de\n  {REFERENCE} manque, et sans lui "
              "la couverture ne se calcule pas. Rien n'est\n  conclu — le brut "
              "seul n'est pas la mesure déclarée.\n")
        return
    obs = principal.get("lignes") or []
    if obs:
        print("  " + "-" * 74)
        for x, r in obs[-15:]:
            jour = dt.datetime.fromtimestamp(x["entree_ms"] / 1000, dt.UTC)
            print(f"  {x['symbole']:<9} {x['part_offre']:>6.1%}  "
                  f"{jour:%Y-%m-%d}  préavis {int(x.get('horizon_j', 0)):>4} j"
                  f"  {r:>+9.1f} bps")
        if len(obs) > 15:
            print(f"  … {len(obs) - 15} plus anciennes non affichées")

    print("  " + "-" * 74)
    for mesure in (pronostic.NET, pronostic.BRUT):
        m = mesures.get(mesure)
        if not m or not m.get("n"):
            continue
        marque = "  <- primaire" if mesure == pronostic.MESURE_PRIMAIRE else ""
        print(f"  {mesure.upper():<10} n={m['n']:<4} observé "
              f"{m['observe_bps']:>+8.1f}   hasard {m['hasard_bps']:>+8.1f}   "
              f"excès {m['exces_bps']:>+8.1f} bps{marque}")
        print(f"  {'':<10} p={m['p']:.4f}   gagnantes {m['part_gagnante']:.1%}"
              f"   écart-type {m['ecart_type_bps']:.0f} bps")
        if m.get("sans_prix"):
            print(f"  {'':<10} {m['sans_prix']} position(s) sans prix "
                  "exploitable — comptées nulle part")

    detail = _par_horizon(obs)
    if len(detail) > 1:
        print("  " + "-" * 74)
        print("  par préavis (le préavis long dilue, il ne biaise pas)")
        for nom, n, moy in detail:
            print(f"    {nom:<12} n={n:<4} {moy:>+9.1f} bps")

    print("  " + "-" * 74)
    print(f"  attendu (en échantillon, même bande, même fenêtre) "
          f"{attendu['exces_bps']:>+8.1f} bps")
    n = principal.get("n", 0)
    print(f"  avancement  {n}/{attendu['n_pour_50']} pour une chance sur deux"
          f"   ·   {n}/{attendu['n_pour_80']} pour quatre sur cinq")
    print("  " + "-" * 74)

    if n < attendu["n_pour_50"]:
        print(f"  VERDICT : AUCUN. {n} positions sur {attendu['n_pour_50']} "
              "nécessaires pour avoir\n  ne serait-ce qu'une chance sur deux "
              "de trancher. Avec un écart-type de\n  "
              f"{attendu['ecart_type_bps']:.0f} bps par position, tout ce qui "
              "se lit ci-dessus est du bruit,\n  quelle que soit son allure.\n")
    elif principal.get("p", 1.0) <= pronostic.ALPHA:
        print(f"  VERDICT : l'excès sur le hasard tient hors échantillon "
              f"(p={principal['p']:.4f}).\n  C'est le seul résultat de ce "
              "dépôt qui n'ait pas été mesuré en\n  connaissant les données.\n")
    else:
        print(f"  VERDICT : l'excès ne se distingue pas du hasard "
              f"(p={principal.get('p', 1.0):.4f}) sur\n  {n} positions. "
              "L'effet historique ne s'est pas reproduit.\n")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--unlocks", default="data/unlocks.json")
    p.add_argument("--journal", default="data/journal_unlocks.jsonl")
    p.add_argument("--horizon", type=int, default=None,
                   help="borner l'inscription aux N prochains jours. Par "
                        "défaut tout l'avenir du calendrier est inscrit.")
    p.add_argument("--jours", type=int, default=400,
                   help="profondeur d'historique à télécharger au relevé")
    p.add_argument("--resoudre", action="store_true",
                   help="relever le résultat des fenêtres closes")
    p.add_argument("--purger-version", type=int, default=None,
                   help="retirer les entrées d'une version dont AUCUNE "
                        "fenêtre n'est close ; refusé sinon")
    args = p.parse_args()

    # La preference reseau s'installe ICI, pas a l'import : un
    # module qu'on importe pour l'inspecter ne doit pas changer la
    # resolution DNS de tout le processus.
    _ipv4_d_abord()

    journal = Path(args.journal)
    if args.resoudre:
        resoudre(journal, jours=args.jours)
        return 0
    if args.purger_version is not None:
        ok, message = purger_version(journal, args.purger_version)
        print(f"\n  {message}\n")
        return 0 if ok else 1

    chemin = Path(args.unlocks)
    if not chemin.exists():
        print(f"\n  {chemin} introuvable. Lancez d'abord "
              "`python3 scripts/fetch_unlocks.py`.\n", file=sys.stderr)
        return 2
    unlocks = json.loads(chemin.read_text())
    maintenant = int(time.time() * 1000)
    univers = univers_hyperliquid()
    if univers is None:
        print("  API Hyperliquid injoignable : les jetons non cotables ne "
              "peuvent pas\n  être écartés. Réessayez plutôt que d'inscrire "
              "des positions imprenables.\n", file=sys.stderr)
        return 1
    prises = a_prendre(unlocks, maintenant, args.horizon, univers)
    ajouts = inscrire(prises, journal)

    portee = (f"{args.horizon} prochains jours" if args.horizon is not None
              else "tout l'avenir du calendrier")
    print(f"\n  POSITIONS À VENIR — règle v{VERSION}, {portee}")
    print("  " + "=" * 74)
    # La règle active, imprimée à chaque exécution. Elle est lue depuis
    # `sentinelle.triggers`, donc ce qui s'affiche est ce qui s'applique —
    # pas une phrase recopiée qui pourrait mentir après une modification.
    print(f"  Vendre à découvert à J{ENTREE_J}, racheter à J{SORTIE_J}, "
          f"adossé à {REFERENCE}.")
    print(f"  Déblocages retenus : de {DEBLOCAGE_PART_MIN:.0%} à "
          f"{DEBLOCAGE_PART_MAX:.0%} de l'offre, un seul par "
          f"{DEBLOCAGE_DUREE_J} jours.")
    print(f"  Protocole de notation {pronostic.empreinte()} — "
          f"{pronostic.attendu()['n_pour_50']} positions pour une chance sur "
          "deux de conclure.\n")
    if not prises:
        print("  Aucun déblocage éligible à venir dans le calendrier.\n")
        return 0
    for x in sorted(prises, key=lambda v: v["entree_ms"])[:25]:
        d = dt.datetime.fromtimestamp(x["entree_ms"] / 1000, dt.UTC)
        f = dt.datetime.fromtimestamp(x["sortie_ms"] / 1000, dt.UTC)
        print(f"  {x['symbole']:<9} {x['part_offre']:>6.1%}   "
              f"entrée {d:%Y-%m-%d}   sortie {f:%Y-%m-%d}   "
              f"préavis {x['horizon_j']:>4} j")
    if len(prises) > 25:
        print(f"  … {len(prises) - 25} autres, plus lointaines")
    print("  " + "-" * 74)
    print(f"  {len(prises)} position(s), dont {ajouts} nouvellement inscrite(s) "
          f"dans\n  {journal} (ajout seul).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
