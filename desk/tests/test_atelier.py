"""L'atelier : une machine à chercher des stratégies, donc à en inventer.

Ces tests ne vérifient pas qu'on trouve quelque chose — c'est une mesure, pas
une propriété. Ils verrouillent les trois choses qui, en cassant, feraient de
ce panneau un générateur d'illusions avec une jolie interface :

- le registre doit être en AJOUT SEUL : un registre où les ratages
  disparaissent transforme « la meilleure de cinquante » en « p = 0,02 » ;
- la correction doit porter sur TOUT le registre, jamais sur la ligne qu'on
  regarde ;
- un essai relancé ne doit pas compter comme une hypothèse de plus, le moteur
  étant déterministe.

Plus la barrière d'entrée : rien de ce que le navigateur envoie ne doit
atteindre une ligne de commande sans avoir été retrouvé dans un catalogue lu
depuis le code.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from trading_desk import atelier
from trading_desk.api import recherche

RACINE = Path(__file__).resolve().parents[1]


def _ligne(signature: str, p: float | None, net: float = 0.0,
           ms: int = 0, **extra) -> dict:
    return {"essai_ms": ms, "signature": signature, "strategie": "ema_cross",
            "actif": "BTC", "intervalle": "1d", "parametres": {"fast": 20},
            "net_usd": net, "trades": 10, "rejets": 0, "barres": 500,
            "equite": 1000.0, "tirages": 2000, "p": p, **extra}


# ------------------------------------------------------------- le catalogue

def test_le_catalogue_des_parametres_vient_des_signatures():
    """Une liste recopiée dérive : on ajoute un paramètre à une stratégie, le
    formulaire ne le propose pas, et personne ne s'en aperçoit — un
    formulaire incomplet ressemble à un formulaire complet."""
    import inspect

    from trading_desk.backtest.strategies import BASELINES

    for nom, cls in BASELINES.items():
        attendus = {c for c, param in inspect.signature(cls.__init__).parameters.items()
                    if c != "self" and isinstance(param.default, (int, float))
                    and not isinstance(param.default, bool)}
        assert set(atelier.parametres_reglables(nom)) == attendus, nom


def test_les_parametres_non_numeriques_sont_ecartes():
    """`regime_switch` prend deux SOUS-STRATÉGIES en arguments. Un formulaire
    ne compose pas des objets, et en proposer un champ vide serait pire que
    de ne rien proposer."""
    reglables = atelier.parametres_reglables("regime_switch")
    assert "tendance" not in reglables and "retour" not in reglables
    assert "adx_period" in reglables


def test_les_defauts_suivent_l_intervalle():
    """55 barres de canal Turtle sur du 4 h font neuf jours — ce n'est plus la
    règle des Turtles, et le formulaire l'aurait présentée comme telle."""
    assert atelier.defauts("turtle_breakout", "1d")["entry_period"] == 55
    assert atelier.defauts("turtle_breakout", "4h")["entry_period"] == 55 * 6


def test_le_catalogue_ne_propose_que_les_donnees_presentes():
    """Offrir une cellule sans barres produirait un essai qui échoue — et un
    échec de fichier manquant se lit comme un échec de stratégie quand il
    arrive dans un tableau de résultats."""
    dispo = atelier.combinaisons_disponibles()
    assert dispo, "le dépôt livre des barres"
    for actif, intervalles in dispo.items():
        for i in intervalles:
            assert (atelier.DONNEES / f"{actif}_{i}_real.json").exists()


# ---------------------------------------------------------- la normalisation

def test_les_parametres_sont_ecretes_a_leurs_bornes():
    """Le formulaire vient du navigateur, et le serveur n'écoute que
    127.0.0.1 — ce qui veut dire joignable par tout ce qui tourne sur la
    machine. Une période de dix millions de barres n'planterait pas, elle
    occuperait la machine assez longtemps pour que le collecteur perde des
    messages."""
    p = atelier.normaliser("ema_cross", "1d", {"fast": 10_000_000, "atr_stop": -5})
    assert p["fast"] == atelier.BORNES["fast"][1]
    assert p["atr_stop"] == atelier.BORNES["atr_stop"][0]


def test_un_parametre_inconnu_est_ignore_pas_fatal():
    """Le formulaire et le code peuvent diverger le temps d'un rechargement
    de page ; refuser tout l'essai pour un champ de trop transformerait une
    broutille en panne."""
    p = atelier.normaliser("ema_cross", "1d", {"fast": 10, "nimportequoi": 3})
    assert p["fast"] == 10 and "nimportequoi" not in p


def test_un_entier_reste_entier():
    p = atelier.normaliser("ema_cross", "1d", {"fast": 12.7})
    assert p["fast"] == 13 and isinstance(p["fast"], int)


def test_la_signature_ne_depend_pas_de_l_ordre_des_cles():
    """Elle sert à COMPTER les hypothèses. Une signature qui changerait avec
    l'ordre d'un dictionnaire ferait passer une relance pour une hypothèse
    neuve, et gonflerait le dénominateur du criblage."""
    a = atelier.signature("ema_cross", "BTC", "1d", {"fast": 10, "slow": 40})
    b = atelier.signature("ema_cross", "BTC", "1d", {"slow": 40, "fast": 10})
    assert a == b
    assert a != atelier.signature("ema_cross", "BTC", "4h", {"fast": 10, "slow": 40})
    assert a != atelier.signature("ema_cross", "BTC", "1d", {"fast": 11, "slow": 40})


# ------------------------------------------------------------- le registre

def test_le_registre_est_en_ajout_seul(tmp_path):
    """LA propriété de ce fichier.

    Un registre qu'on peut nettoyer ne mesure plus rien : il documente les
    essais dont on se souvient avec plaisir. Le nombre d'essais tentés est la
    seule donnée qui rende le meilleur d'entre eux interprétable.
    """
    reg = tmp_path / "r.jsonl"
    atelier.inscrire(_ligne("aaa", 0.4, ms=1), reg)
    atelier.inscrire(_ligne("bbb", 0.02, ms=2), reg)
    atelier.inscrire(_ligne("aaa", 0.4, ms=3), reg)
    assert len(reg.read_text().splitlines()) == 3
    assert len(atelier.lire(reg)) == 3


def test_une_ligne_tronquee_est_sautee_pas_fatale(tmp_path):
    """Un fichier en ajout seul peut finir par une ligne coupée si le
    processus est tué en pleine écriture. Perdre le registre entier pour ça
    serait absurde."""
    reg = tmp_path / "r.jsonl"
    atelier.inscrire(_ligne("aaa", 0.4), reg)
    with reg.open("a") as f:
        f.write('{"signature": "bbb", "net_u')
    assert len(atelier.lire(reg)) == 1


def test_une_relance_n_est_pas_une_hypothese_de_plus(tmp_path):
    """Le moteur est déterministe : mêmes barres, mêmes paramètres, même
    résultat. Compter les relances gonflerait le dénominateur et rendrait la
    correction plus sévère qu'elle ne doit l'être — une erreur dans l'autre
    sens, mais une erreur."""
    reg = tmp_path / "r.jsonl"
    for i in range(5):
        atelier.inscrire(_ligne("aaa", 0.4, net=float(i), ms=i), reg)
    gardees = atelier.dernier_par_signature(atelier.lire(reg))
    assert len(gardees) == 1
    assert gardees[0]["net_usd"] == 4.0, "la plus récente"


# --------------------------------------------- la correction sur TOUT le tas

def test_la_correction_porte_sur_tout_le_registre(tmp_path):
    """LE test de ce fichier.

    Une cellule à p = 0,02 survit seule et ne survit plus dès qu'elle est
    accompagnée. C'est exactement ce que le panneau doit montrer, et ce qu'un
    classement par rendement seul cacherait.
    """
    reg = tmp_path / "r.jsonl"
    atelier.inscrire(_ligne("seule", 0.02, net=100.0, ms=1), reg)
    a = recherche.atelier(reg)
    assert a["criblage"]["nb_survivants"] == 1

    for i in range(9):
        atelier.inscrire(_ligne(f"bruit{i}", 0.5, net=-10.0, ms=10 + i), reg)
    b = recherche.atelier(reg)
    assert b["combinaisons"] == 10
    assert b["criblage"]["testees"] == 10
    assert b["criblage"]["nb_survivants"] == 0, (
        "p = 0,02 sur dix tests ne survit pas — c'est tout le sujet")
    assert b["classement"][0]["signature"] == "seule", "le net la garde en tête"
    assert b["classement"][0]["survit_bh"] is False


def test_les_deux_denominateurs_sont_affiches(tmp_path):
    """`essais` compte les lancements, `combinaisons` les hypothèses.

    Le premier seul gonflerait la sévérité apparente du criblage ; le second
    seul cacherait qu'on a relancé dix fois la même cellule.
    """
    reg = tmp_path / "r.jsonl"
    for i in range(4):
        atelier.inscrire(_ligne("aaa", 0.4, ms=i), reg)
    atelier.inscrire(_ligne("bbb", 0.4, ms=9), reg)
    a = recherche.atelier(reg)
    assert (a["essais"], a["combinaisons"], a["repetitions"]) == (5, 2, 3)


def test_une_cellule_sans_trade_n_entre_pas_dans_le_denominateur(tmp_path):
    """Zéro trade n'est pas un mauvais résultat, c'est une ABSENCE de
    résultat : la stratégie n'a jamais pris position. Lui donner un p la
    ferait entrer dans le criblage et gonflerait le dénominateur avec du
    vide — ce qui rendrait la correction plus sévère pour les autres."""
    reg = tmp_path / "r.jsonl"
    atelier.inscrire(_ligne("vraie", 0.02, net=50.0, ms=1), reg)
    atelier.inscrire({**_ligne("vide", None, ms=2), "trades": 0,
                      "raison_sans_p": "aucun trade"}, reg)
    a = recherche.atelier(reg)
    assert a["combinaisons"] == 2, "elle figure au classement"
    assert a["criblage"]["testees"] == 1, "mais pas parmi les hypothèses testées"


def test_un_registre_absent_dit_quoi_faire(tmp_path):
    """Un artefact absent est une information, pas une panne."""
    a = recherche.atelier(tmp_path / "jamais.jsonl")
    assert a["disponible"] is False
    assert "atelier.py" in a["commande"]
    assert a["catalogue"]["strategies"], "le formulaire reste utilisable"


# ------------------------------------------------------------ un vrai essai

def test_un_essai_reel_produit_une_ligne_complete():
    """Le moteur, pour de vrai, sur les barres du dépôt."""
    ligne = atelier.essayer("ema_cross", "BTC", "1d", tirages=atelier.TIRAGES_MIN)
    assert ligne["trades"] > 0
    assert 0.0 <= ligne["p"] <= 1.0
    assert ligne["verdict"] in {"BAT LE HASARD", "NON DISTINGUABLE",
                                "PIRE QUE LE HASARD"}
    assert ligne["signature"] == atelier.signature(
        "ema_cross", "BTC", "1d", ligne["parametres"])
    assert ligne["tirages"] == atelier.TIRAGES_MIN


def test_le_meme_essai_rend_exactement_le_meme_resultat():
    """Le déterminisme est ce qui autorise à ne garder qu'une ligne par
    signature. S'il tombait, deux relances donneraient deux nets différents
    et le registre se contredirait sans que rien ne le dise."""
    a = atelier.essayer("ema_cross", "BTC", "1d", tirages=atelier.TIRAGES_MIN)
    b = atelier.essayer("ema_cross", "BTC", "1d", tirages=atelier.TIRAGES_MIN)
    assert a["net_usd"] == b["net_usd"]
    assert a["p"] == b["p"]
    assert a["signature"] == b["signature"]


def test_les_tirages_sont_bornes():
    """Le nombre de tirages fixe le PLANCHER de p à 1/(D+1). En dessous de
    200, un essai ne peut pas descendre sous 0,005 et un criblage sur
    quelques dizaines de combinaisons devient aveugle avant de commencer."""
    ligne = atelier.essayer("ema_cross", "BTC", "1d", tirages=1)
    assert ligne["tirages"] == atelier.TIRAGES_MIN


def test_une_strategie_inconnue_est_refusee():
    with pytest.raises(ValueError, match="inconnue"):
        atelier.essayer("martingale_magique", "BTC", "1d")


# ------------------------------------------------- la barrière de lancement
#
#  Le lanceur est le seul chemin du dépôt qui crée un processus à partir
#  d'une requête HTTP. L'atelier lui ajoute une forme nouvelle — stratégie,
#  tickers, échelles, paramètres flottants — et donc une surface nouvelle.
#  Rien de ce que le navigateur envoie ne doit atteindre une ligne de
#  commande sans avoir été retrouvé dans un catalogue lu depuis le code.

def _lanceur():
    from trading_desk.api.campagnes import Lanceur
    from trading_desk.api.state import DeskState
    from trading_desk.config import Settings
    from trading_desk.storage import SqliteStore
    return Lanceur(DeskState(Settings(), SqliteStore(":memory:")))


def _lanceur_en_mode(mode):
    from types import SimpleNamespace

    from trading_desk.api.campagnes import Lanceur
    return Lanceur(SimpleNamespace(settings=SimpleNamespace(mode=mode)))


def test_une_strategie_inventee_ne_lance_rien():
    r = _lanceur().lancer_atelier({"strategie": "; rm -rf /",
                                   "actifs": ["BTC"], "intervalles": ["1d"]})
    assert r["lance"] is False
    assert "inconnue" in r["raison"]


def test_un_actif_absent_du_disque_ne_lance_rien():
    """Un nom d'actif qui n'a pas de barres ici ne doit pas devenir un
    argument : il produirait un essai qui échoue, et un échec de fichier
    manquant se lit comme un échec de stratégie."""
    r = _lanceur().lancer_atelier({"strategie": "ema_cross",
                                   "actifs": ["../../etc/passwd"],
                                   "intervalles": ["1d"]})
    assert r["lance"] is False
    assert "aucun actif valide" in r["raison"]


def test_un_intervalle_absent_d_un_seul_actif_fait_refuser():
    """L'intervalle doit exister pour TOUS les tickers cochés.

    Le tolérer pour certains produirait un balayage dont les cellules
    manquantes ne se verraient nulle part — et un dénominateur qu'on croit
    connaître. `APE` n'a que du journalier ; `BTC` a du 4 h.
    """
    dispo = atelier.combinaisons_disponibles()
    if "APE" not in dispo or "4h" in dispo.get("APE", []):
        pytest.skip("le dépôt ne livre plus le cas asymétrique attendu")
    r = _lanceur().lancer_atelier({"strategie": "ema_cross",
                                   "actifs": ["BTC", "APE"],
                                   "intervalles": ["4h"]})
    assert r["lance"] is False
    assert "aucun intervalle commun" in r["raison"]


def test_aucun_essai_pendant_que_le_desk_fabrique_des_ordres():
    """Même refus que pour une campagne, et pour la même raison : un essai
    sature le processeur une dizaine de secondes, et le pupitre en mode PAPER
    décide sur le carnet de l'instant."""
    from trading_desk.contracts.common import DeskMode

    for mode in (DeskMode.PAPER, DeskMode.TESTNET, DeskMode.LIVE):
        r = _lanceur_en_mode(mode).lancer_atelier(
            {"strategie": "ema_cross", "actifs": ["BTC"], "intervalles": ["1d"]})
        assert r["lance"] is False
        assert "carnet" in r["raison"]


def test_les_parametres_envoyes_sont_ecretes_dans_la_commande(monkeypatch):
    """La ligne de commande construite ne doit porter que des valeurs bornées.

    On intercepte le démarrage plutôt que de lancer un processus : ce qui est
    testé ici est la COMMANDE, pas le fait qu'elle tourne.
    """
    lanceur = _lanceur()
    vues = {}
    monkeypatch.setattr(type(lanceur), "_demarrer",
                        lambda self, cle, cmd: vues.update(cle=cle, cmd=cmd)
                        or {"lance": True})
    lanceur.lancer_atelier({
        "strategie": "ema_cross", "actifs": ["BTC"], "intervalles": ["1d"],
        "parametres": {"fast": 10 ** 9, "inconnu": 3, "atr_stop": "; whoami"},
        "tirages": 10 ** 9,
    })
    assert vues["cle"] == "atelier"
    cmd = vues["cmd"]
    assert f"fast={atelier.BORNES['fast'][1]}" in cmd
    assert not any("inconnu" in x for x in cmd), "un champ inconnu n'entre pas"
    assert not any("whoami" in x for x in cmd), "une valeur non numérique non plus"
    assert cmd[cmd.index("--tirages") + 1] == str(atelier.TIRAGES_MAX)


def test_un_essai_en_cours_porte_un_titre_lisible(monkeypatch):
    """L'atelier n'est pas dans `CATALOGUE` — il n'a pas la forme d'une
    campagne. Sans cas explicite, un essai en cours s'afficherait sans titre,
    donc comme un lancement dont on ne sait pas ce qu'il est."""
    lanceur = _lanceur()
    monkeypatch.setattr(type(lanceur), "_demarrer",
                        lambda self, cle, cmd: setattr(self, "cle", cle)
                        or {"lance": True})
    lanceur.lancer_atelier({"strategie": "ema_cross", "actifs": ["BTC"],
                            "intervalles": ["1d"]})
    assert lanceur.snapshot()["titre"] == "Essai d'atelier"


# ---------------------------------------------------------------- l'écran

def _ui(nom: str) -> str:
    return (RACINE / "src" / "trading_desk" / "ui" / nom).read_text(encoding="utf-8")


def test_l_ecran_affiche_le_verdict_AU_DESSUS_du_classement():
    """L'ordre des panneaux est le sujet.

    Un classement par rendement placé avant le verdict se lit comme un
    palmarès ; placé après, il se lit comme ce qu'il est — des cellules dont
    on sait déjà combien on en attendait par hasard.
    """
    html = _ui("index.html")
    assert html.index('id="atVerdict"') < html.index('id="atClassement"')


def test_l_ecran_dit_le_nombre_attendu_par_hasard():
    """Le chiffre qu'on oublie, et celui qui décide."""
    js = _ui("desk.js")
    assert "attendues par hasard" in js
    assert "survivantes après BH" in js


def test_l_intro_de_l_atelier_annonce_le_danger():
    """Un panneau qui laisse classer par rendement sans le dire serait un
    générateur d'illusions avec une jolie interface."""
    html = _ui("index.html")
    bloc = html[html.index('id="sec-atelier"'):html.index('id="sec-consommation"')]
    assert "faux positifs" in bloc
    assert "ajout seul" in bloc


def test_le_formulaire_ne_code_en_dur_aucune_strategie():
    """Il vient du catalogue. Ajouter une stratégie au code doit la faire
    apparaître sans toucher à cette page.

    La vérification porte sur le BLOC de l'atelier, pas sur tout le fichier :
    d'autres panneaux ont de bonnes raisons de nommer une stratégie dans un
    commentaire — celui des règles figées explique pourquoi `tsmom` a été
    écarté du registre. Élargir la recherche à tout le fichier ferait
    échouer ce test sur de la prose, ce qui n'est pas ce qu'il surveille.
    """
    js = _ui("desk.js")
    debut = js.index("/* ---------- ATELIER ---------- */")
    bloc = js[debut:js.index("/* ---------- CONSOMMATION ---------- */", debut)]
    assert "atCat" in bloc, "on regarde bien le bloc de l'atelier"
    for nom in ("ema_cross", "tsmom", "turtle_breakout"):
        assert nom not in bloc, f"« {nom} » est écrit en dur dans le formulaire"


def test_la_regle_deployee_n_entre_pas_dans_le_selecteur_de_courbe():
    """La courbe d'équité rejoue un backtest de bougies ; une règle
    événementielle n'en a pas.

    L'offrir dans ce sélecteur produisait un « Backtest en cours… » qui ne
    finissait jamais — un écran qui ment sur ce qu'il est en train de faire.
    """
    js = _ui("desk.js")
    bloc = js[js.index("function preparerSelecteurs"):]
    bloc = bloc[:bloc.index("\n}")]
    assert "deployee" in bloc, "le sélecteur doit écarter la règle déployée"


def test_l_atelier_part_sur_BTC_pas_sur_le_premier_par_ordre_alphabetique():
    """APE arrive premier alphabétiquement et personne n'en a la référence
    en tête. BTC est l'actif sur lequel toutes les campagnes ont été lues."""
    js = _ui("desk.js")
    assert 'dispos.includes("BTC")' in js


def test_l_atelier_part_sur_le_journalier_pas_sur_le_15_minutes():
    """Un balayage en 15 minutes occupe la machine sans que personne l'ait
    demandé, et 1d est l'échelle sur laquelle les campagnes ont été lues.
    Le premier de la liste triée serait 15m."""
    assert 'communs.includes("1d")' in _ui("desk.js")


# ─────────────────────────────────────── la provenance, et son dénominateur

def test_une_origine_inconnue_est_refusee():
    """Le champ ne sert à rien s'il accepte n'importe quelle valeur.

    Un registre où l'origine est libre laisserait s'installer `llm`, `LLM`,
    `ia` et `gpt` comme quatre espaces d'hypothèses distincts alors que c'est
    le même — et la correction deviendrait quatre fois trop laxiste.
    """
    with pytest.raises(ValueError, match="origine inconnue"):
        atelier.essayer("ema_cross", "BTC", "1d", origine="ia_maison")


def test_le_denominateur_est_par_origine(tmp_path: Path):
    """La propriété entière du bloc, en un test.

    Trois idées tapées à la main ne doivent pas porter le poids statistique de
    trois cents cellules générées qu'elles n'ont pas demandées. Et les trois
    cents ne doivent pas être absoutes par un dénominateur où la correction au
    rang 1 devient si laxiste qu'elle ne rejette plus rien.
    """
    registre = tmp_path / "registre.jsonl"
    a_la_main = {"signature": "main1", "origine": "main", "p": 0.004,
                 "tirages": 2000, "trades": 60, "rejets": 2, "net_usd": 120.0,
                 "mois": {"2026-01": 40.0, "2026-02": 45.0, "2026-03": 35.0}}
    atelier.inscrire(a_la_main, registre)
    for i in range(300):
        atelier.inscrire({"signature": f"llm{i}", "origine": "llm",
                          "p": 0.30, "tirages": 2000, "trades": 60,
                          "rejets": 2, "net_usd": 5.0}, registre)

    verdict = atelier.juger(a_la_main, registre=registre)
    fond = next(e for e in verdict.epreuves if e.cle == "denominateur")
    assert fond.etat == "reussie", (
        "les 300 cellules générées ne doivent pas peser sur l'idée tapée à "
        f"la main — motif rendu : {fond.motif}")
    # Une famille pour l'idee a la main ; les trois cents cellules llm sont
    # dans une AUTRE origine, donc hors de ce denominateur-ci.
    assert "1 famille(s)" in fond.motif


def test_une_ligne_sans_origine_est_rattachee_a_main(tmp_path: Path):
    """Les lignes écrites avant que le champ existe comptent quand même.

    Les ignorer retirerait des hypothèses réellement testées du dénominateur,
    ce qui rendrait la correction plus laxiste — l'erreur exacte que le
    registre en ajout seul existe pour empêcher.
    """
    registre = tmp_path / "registre.jsonl"
    atelier.inscrire({"signature": "vieille", "p": 0.2, "tirages": 2000}, registre)
    atelier.inscrire({"signature": "neuve", "origine": "main", "p": 0.2,
                      "tirages": 2000}, registre)
    assert len(atelier.voisines(atelier.lire(registre), "main")) == 2


def test_le_classement_ne_met_pas_le_rendement_en_tete(tmp_path: Path):
    """Classer par net remettrait le générateur d'illusions aux commandes.

    C'est la tentation permanente d'un tableau de résultats : la colonne qui
    donne envie est le rendement, et c'est précisément celle qui ne doit pas
    décider de l'ordre.
    """
    registre = tmp_path / "registre.jsonl"
    # Riche mais refusée : 70 % de refus du moteur de risque.
    atelier.inscrire({"signature": "riche", "origine": "main", "p": 0.004,
                      "tirages": 2000, "trades": 84, "rejets": 197,
                      "net_usd": 9000.0,
                      "mois": {"2026-01": 3000.0, "2026-02": 3000.0,
                               "2026-03": 3000.0}}, registre)
    # Modeste mais complète.
    atelier.inscrire({"signature": "sobre", "origine": "main", "p": 0.004,
                      "tirages": 2000, "trades": 60, "rejets": 2,
                      "net_usd": 120.0,
                      "mois": {"2026-01": 40.0, "2026-02": 45.0,
                               "2026-03": 35.0}}, registre)

    ordre = atelier.classement(registre)
    assert ordre[0]["signature"] == "sobre"
    assert ordre[0]["verdict_epreuves"]["etat"] == "RETENUE"
    assert ordre[1]["verdict_epreuves"]["fatale"] == "refus"


def test_la_decomposition_mensuelle_est_inscrite_au_registre():
    """Sans elle, l'épreuve du retrait serait indisponible sur chaque ligne,
    donc tout le registre serait INCOMPLETE à perpétuité."""
    ligne = atelier.essayer("turtle_breakout", "BTC", "1d", tirages=200)
    assert ligne["origine"] == "main"
    assert isinstance(ligne["mois"], dict) and ligne["mois"]
    assert all(len(cle) == 7 and cle[4] == "-" for cle in ligne["mois"])
    # La somme des mois est le net : si elle dérivait, le retrait mesurerait
    # une part d'autre chose.
    assert sum(ligne["mois"].values()) == pytest.approx(ligne["net_usd"], abs=1e-6)
