"""Le générateur, le testeur, la bibliothèque — et ce qu'ils ne doivent pas faire.

Ces trois modules partagent un danger : ils rendent facile de produire
beaucoup de candidates et de n'en regarder que les meilleures. Les tests
protègent donc d'abord **les compteurs**, pas les fonctionnalités.

- Le générateur inscrit ce qu'il a PRODUIT, pas ce qu'il a retenu.
- Le testeur inscrit la campagne ENTIÈRE, cellules ratées comprises.
- Le testeur ne passe **aucun ordre réel**, et le dit.
- Une source non sondée n'est pas une source indisponible.
"""

from __future__ import annotations

import json

import pytest

from trading_desk import generateur as gen
from trading_desk import testeur as ts
from trading_desk.biblio import Ticket


def _parent(**kw):
    base = dict(cle="t", strategie="supertrend", actif="BTC", intervalle="1h",
                parametres={"atr_period": 10, "mult": 3.0, "time_stop": 72})
    base.update(kw)
    return Ticket(**base)


# ─────────────────────────────── le générateur compte ce qu'il produit

def test_le_lot_inscrit_les_ECARTEES_aussi(tmp_path):
    """**Le chiffre qui rend le reste interprétable.**

    Un générateur qui sort cinq cents variantes et en garde trois n'a pas
    trouvé trois stratégies : il a tiré cinq cents fois. Un journal qui
    n'inscrirait que les retenues transformerait « trois sur cinq cents » en
    « trois trouvailles ».
    """
    fichier = tmp_path / "lots.jsonl"
    parent = _parent()
    connus = {t.empreinte() for t in gen.deriver(parent, "parametres")}
    lot = gen.depuis_derivation(parent, "parametres", connus=connus)

    assert lot.produits > 0
    assert lot.ecartes == lot.produits, "toutes étaient déjà connues"
    assert lot.tickets == []

    gen.inscrire_lot(lot, fichier)
    inscrit = json.loads(fichier.read_text().strip())
    assert inscrit["produits"] == lot.produits
    assert inscrit["retenus"] == 0
    assert inscrit["motifs_ecart"], "et le motif de l'écart est inscrit"


def test_le_bilan_met_les_PRODUITES_avant_les_retenues(tmp_path):
    fichier = tmp_path / "lots.jsonl"
    gen.inscrire_lot(gen.depuis_derivation(_parent(), "parametres"), fichier)
    b = gen.bilan(fichier)
    assert b["total"]["produits"] >= b["total"]["retenus"]


def test_une_derivation_ne_bouge_qu_une_DIMENSION():
    """Chaque dérivation répond à une question précise. Les combiner
    produirait beaucoup de candidates et aucune réponse."""
    p = _parent()
    for t in gen.deriver(p, "actif", actifs=["ETH", "SOL"]):
        assert t.strategie == p.strategie and t.intervalle == p.intervalle
        assert t.parametres == p.parametres
    for t in gen.deriver(p, "intervalle", intervalles=["4h"]):
        assert t.actif == p.actif and t.parametres == p.parametres


def test_l_inversion_change_la_STRATEGIE_pas_les_parametres():
    inv = gen.deriver(_parent(), "inversion")
    assert len(inv) == 1
    assert inv[0].strategie == "inverse:supertrend"
    assert inv[0].parametres == _parent().parametres


def test_une_derivation_conserve_l_empreinte_de_RECETTE():
    """La filiation vit dans la note libre, pas dans un champ de l'empreinte.

    Deux desks qui écrivent la même recette par des chemins différents doivent
    produire la même empreinte, sinon la déduplication à l'import ne marche
    plus.
    """
    p = _parent()
    d = gen.deriver(p, "actif", actifs=["ETH"])[0]
    jumeau = Ticket(cle=d.cle, strategie=d.strategie, actif=d.actif,
                    intervalle=d.intervalle, parametres=d.parametres)
    assert d.empreinte() == jumeau.empreinte()
    assert p.empreinte() in d.note_libre


def test_le_fichier_FORCE_l_origine_externe(tmp_path):
    """Même raison qu'à l'import de bibliothèque : une recette venue
    d'ailleurs ne rejoint pas le dénominateur des idées du desk."""
    f = tmp_path / "recettes.jsonl"
    f.write_text(json.dumps({"strategie": "ema_cross", "actif": "BTC",
                             "intervalle": "1d", "parametres": {"fast": 20},
                             "origine": "main"}) + "\n", encoding="utf-8")
    lot = gen.depuis_fichier(f)
    assert lot.produits == 1
    assert lot.tickets[0].origine == "externe"


def test_une_ligne_illisible_est_COMPTEE_puis_ecartee(tmp_path):
    """Elle a été produite : ne pas la compter ferait croire que le fichier
    était plus propre qu'il ne l'est."""
    f = tmp_path / "r.jsonl"
    f.write_text("{pas du json\n" + json.dumps(
        {"strategie": "ema_cross", "parametres": {}}) + "\n", encoding="utf-8")
    lot = gen.depuis_fichier(f)
    assert lot.produits == 2 and lot.ecartes == 1


# ───────────────────── une source non sondée n'est pas indisponible

def test_non_sondee_n_est_pas_indisponible():
    """« Indisponible » est une mesure, « pas mesuré » une absence de mesure.

    Les afficher pareil ferait lire « rien trouvé sur GitHub » là où la vérité
    est « on n'a pas regardé ».
    """
    hors_ligne = {s.cle: s for s in gen.sources(sonder=False)}
    assert hors_ligne["github"].disponible is False
    assert hors_ligne["github"].sondee is False
    assert hors_ligne["catalogue"].sondee is True, (
        "une source hors ligne est connue sans sonde")


def test_les_sources_hors_ligne_sont_TOUJOURS_disponibles():
    """Le chemin réaliste pour les stratégies externes est `fichier` : on
    télécharge ailleurs, on dépose un JSONL. Il ne doit dépendre d'aucun
    réseau."""
    hors_ligne = {s.cle for s in gen.sources(sonder=False) if s.disponible}
    assert {"catalogue", "derivation", "fichier"} <= hors_ligne


# ──────────────────────────────── le testeur ne passe aucun ordre réel

def test_l_etage_REEL_est_refuse_et_dit_pourquoi():
    """**Un second chemin vers l'argent réel est un chemin de trop.**

    Passer en réel n'est pas un mode de test, c'est une décision
    d'exploitation : elle passe par la configuration du desk, qui vérifie
    quatre conditions au démarrage. Un testeur qui saurait ouvrir cette porte
    la contournerait.
    """
    c = ts.tester("supertrend", etage="reel")
    assert c.cellules == [], "aucune cellule, donc aucun ordre"
    assert c.refus
    assert "aucun ordre réel" in c.refus
    assert "LIVE" in c.refus and "agent" in c.refus


def test_le_testeur_n_importe_RIEN_qui_passe_des_ordres():
    """Si un jour il importait de quoi agir, ce test tomberait."""
    import inspect
    src = inspect.getsource(ts)
    for interdit in ("OrderManager", "Pupitre", "flatten", "submit_reduce",
                     "hyperliquid_client", "exchange_pour"):
        assert interdit not in src, f"{interdit} n'a rien à faire dans le testeur"


def test_l_etage_PAPER_renvoie_vers_le_desk():
    """Le paper trading mesure la plomberie, la latence et le glissement
    réels. Le simuler ici rendrait un chiffre qui aurait l'air d'un résultat
    de paper trading sans en être un."""
    c = ts.tester("supertrend", etage="paper")
    assert c.cellules == []
    assert "mode PAPER" in c.refus


def test_le_hors_echantillon_EXIGE_une_date():
    c = ts.tester("supertrend", etage="hors_echantillon")
    assert c.cellules == []
    assert "date de déclaration" in c.refus


def test_un_etage_inconnu_leve():
    with pytest.raises(ValueError, match="étage inconnu"):
        ts.tester("supertrend", etage="au_pif")


# ───────────────────── le testeur inscrit la campagne entière

def test_la_campagne_inscrit_les_cellules_RATEES(tmp_path):
    """Une campagne dont on ne garderait que les cellules intéressantes
    transformerait « la meilleure de douze » en « une stratégie à p = 0,02 »."""
    fichier = tmp_path / "c.jsonl"
    c = ts.tester("supertrend", actifs=["BTC", "ACTIF_INEXISTANT"],
                  intervalles=["1h"])
    assert len(c.cellules) == 2
    ratees = [x for x in c.cellules if x.erreur]
    assert ratees, "l'actif inexistant produit une cellule en erreur"

    ts.inscrire(c, fichier)
    d = json.loads(fichier.read_text().strip())
    assert len(d["cellules"]) == 2, "les deux sont inscrites"
    assert d["denominateur"] == 1, (
        "mais seule celle qui a tourné compte comme hypothèse")


def test_les_parametres_par_defaut_sont_PAR_ECHELLE():
    """« time-stop 72h » vaut 72 barres en 1 h et 3 barres en journalier.

    Sans cette conversion, comparer une même règle sur deux échelles compare
    deux règles différentes.
    """
    from trading_desk.backtest.strategies import parametres
    assert parametres("supertrend", "1h")["time_stop"] == 72
    assert parametres("supertrend", "12h")["time_stop"] == 6
    assert parametres("supertrend", "1d")["time_stop"] == 3


def test_des_parametres_explicites_remplacent_les_defauts():
    c = ts.tester("supertrend", actifs=["BTC"], intervalles=["1h", "12h"],
                  parametres={"atr_period": 7, "mult": 2.0})
    for x in c.cellules:
        assert x.parametres == {"atr_period": 7, "mult": 2.0}, (
            "le même réglage partout, y compris entre échelles")


def test_une_strategie_inverse_se_teste_sans_entree_au_catalogue():
    """Elle n'est pas une stratégie de plus : c'est la même vue à l'envers.
    Lui donner sa propre entrée doublerait le catalogue sans rien ajouter."""
    from trading_desk.backtest.strategies import BASELINES
    assert "inverse:supertrend" not in BASELINES
    c = ts.tester("inverse:supertrend", actifs=["BTC"], intervalles=["1h"])
    assert len(c.cellules) == 1 and not c.cellules[0].erreur
    assert c.cellules[0].trades > 0


def test_le_bilan_du_generateur_compte_les_familles(tmp_path):
    """Produire n'est pas questionner.

    Cinq derivees de parametres sur une meme cellule sont cinq candidates et
    UNE hypothese. Le bilan doit montrer les deux nombres : « produites »
    seul ferait croire a cinq trouvailles, « familles » seul cacherait
    l'ampleur de la recherche de reglages.
    """
    from trading_desk import generateur as gen
    from trading_desk.biblio import Ticket

    chemin = tmp_path / "lots.jsonl"
    lot = gen.Lot(source="derivation", parent="ema_cross", derivation="parametres")
    for i in range(5):
        lot.tickets.append(Ticket(
            cle=f"d{i}", strategie="ema_cross", actif="SOL", intervalle="4h",
            parametres={"fast": 18 + i, "slow": 50}, origine="main"))
    lot.produits = 5
    gen.inscrire_lot(lot, chemin)

    b = gen.bilan(chemin)
    assert b["total"]["produits"] == 5
    assert b["total"]["familles"] == 1, (
        "cinq reglages d'une meme cellule sont une hypothese, pas cinq")


def test_le_bilan_separe_les_familles_de_cellules_distinctes(tmp_path):
    from trading_desk import generateur as gen
    from trading_desk.biblio import Ticket

    chemin = tmp_path / "lots.jsonl"
    lot = gen.Lot(source="catalogue", parent=None, derivation=None)
    for actif in ("BTC", "ETH", "SOL"):
        lot.tickets.append(Ticket(
            cle=f"c{actif}", strategie="ema_cross", actif=actif,
            intervalle="4h", parametres={"fast": 20}, origine="main"))
    lot.produits = 3
    gen.inscrire_lot(lot, chemin)

    assert gen.bilan(chemin)["total"]["familles"] == 3
