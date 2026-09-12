"""Tests de l'interface : les panneaux de recherche et les courbes.

Deux d'entre eux valent d'etre lus avant les autres, parce qu'ils fixent des
erreurs commises en construisant ces panneaux le 9 septembre 2026 :

- `test_un_criblage_muet_ne_declare_pas_de_verdict_de_resolution` : la premiere
  version DEDUISAIT le nombre de tirages du plus petit p observe, et declarait
  « aveugle » une campagne qui concluait pour de bon a l'absence d'edge
  directionnel. Transformer une refutation solide en « on ne sait pas » est la
  pire des deux erreurs possibles ;
- `test_une_courbe_sans_trade_est_signalee` : avec le plafond de stop par
  defaut, `tsmom BTC 1d` fait zero trade. La courbe plate qui en resulte,
  tracee a cote de « detenir BTC », se lit « la strategie a perdu » alors
  qu'elle n'a jamais pris de position.
"""

from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from trading_desk.api import recherche
from trading_desk.api.server import create_app
from trading_desk.api.state import DeskState
from trading_desk.config import Settings
from trading_desk.contracts.common import DeskMode
from trading_desk.storage import SqliteStore


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(DeskState(Settings(), SqliteStore(":memory:"))))


# --------------------------------------------------------------------------
#  Le criblage, et ce qu'il a le droit d'affirmer
# --------------------------------------------------------------------------

def _cellules(ps, tirages=None):
    return [{"strategie": "s", "actif": "A", "intervalle": "1d",
             "net_usd": 1.0, "p": p,
             **({"tirages": tirages} if tirages is not None else {})}
            for p in ps]


def test_un_criblage_muet_ne_declare_pas_de_verdict_de_resolution():
    """Sans nombre de tirages inscrit, on ne dit RIEN sur la resolution.

    La tentation etait de le deduire du plus petit p. C'est faux : le plus
    petit p observe MAJORE le plancher sans le determiner, puisque rien
    n'oblige une cellule a saturer.
    """
    v = recherche._criblage(_cellules([0.008] + [0.4] * 97), "p")
    assert v["tirages"] is None
    assert v["aveugle"] is False, "un artefact muet n'est pas un artefact aveugle"
    assert "plancher" not in v
    assert "non inscrit" in v["resolution"]


def test_un_criblage_trop_peu_resolu_le_dit_avec_le_nombre_requis():
    """200 tirages sur 70 cellules : un edge isole est invisible."""
    v = recherche._criblage(_cellules([0.005] + [0.4] * 69, tirages=200), "p")
    assert v["tirages"] == 200
    assert v["cellules_minimum"] > 1
    assert v["aveugle"] is False, "un plancher sous alpha n'interdit pas tout"
    assert "1400" in v["resolution"], "le nombre de tirages requis doit figurer"


def test_un_criblage_au_plancher_au_dessus_d_alpha_est_aveugle():
    """Avec 10 tirages, le plancher vaut 0,09 : rien ne peut jamais survivre."""
    v = recherche._criblage(_cellules([0.0909] * 20, tirages=10), "p")
    assert v["aveugle"] is True
    assert v["nb_survivants"] == 0
    assert "quelle que soit la donnée" in v["resolution"]


def test_une_campagne_assez_resolue_conclut_pour_de_bon():
    v = recherche._criblage(_cellules([0.0005] + [0.4] * 97, tirages=2000), "p")
    assert v["aveugle"] is False
    assert v["cellules_minimum"] == 1
    assert v["nb_survivants"] == 1
    assert "porte sur la donnée" in v["resolution"]


def test_le_criblage_affiche_l_attendu_du_hasard():
    """Trois cellules a p < 0,05 sur 60 ne sont pas une decouverte."""
    v = recherche._criblage(_cellules([0.01, 0.02, 0.04] + [0.4] * 57, tirages=2000), "p")
    assert v["bruts"] == 3
    assert v["attendues"] == 3.0
    assert v["nb_survivants"] == 0


# --------------------------------------------------------------------------
#  Amplitude et direction ne s'additionnent pas
# --------------------------------------------------------------------------

def test_l_amplitude_ne_compte_pas_comme_un_edge_directionnel():
    """Une cellule qui survit en amplitude ne dit pas dans quel sens.

    Les additionner produirait « 66 cellules survivent » sur un projet dont
    toutes les campagnes de direction concluent a zero.
    """
    campagnes = [
        {"disponible": True, "question": "amplitude", "tradable": False,
         "nb_survivants": 59, "tirages": 2000, "cellules_minimum": 1},
        {"disponible": True, "question": "direction", "tradable": True,
         "nb_survivants": 0, "tirages": 2000, "cellules_minimum": 1},
    ]
    lignes = {x["cle"]: x for x in recherche.prevol(campagnes_=campagnes)}
    assert lignes["edge"]["etat"] == "bloc"
    assert "réfutation" in lignes["edge"]["detail"]
    assert lignes["amplitude"]["etat"] == "ok"
    assert "sens" in lignes["amplitude"]["detail"]


def test_toutes_les_campagnes_declarent_leur_question():
    questions = {c["question"] for c in recherche.campagnes()}
    assert questions <= {"rendement", "direction", "amplitude"}
    assert "direction" in questions and "amplitude" in questions


# --------------------------------------------------------------------------
#  Un artefact absent est une information, pas une panne
# --------------------------------------------------------------------------

def test_un_artefact_absent_donne_la_commande_qui_le_produit():
    manquantes = [c for c in recherche.campagnes() if not c.get("disponible")]
    for c in manquantes:
        assert c["raison"], "l'absence doit etre expliquee"
        assert c["commande"].startswith("python "), "et reparable"


def test_la_telemetrie_absente_ne_ressemble_pas_a_une_panne(tmp_path):
    vide = recherche.telemetrie(None)
    assert vide["disponible"] is False
    assert "configurée" in vide["raison"]
    assert vide["actifs"] == []

    ailleurs = recherche.telemetrie(tmp_path / "nulle-part")
    assert ailleurs["disponible"] is False
    assert "autre machine" in ailleurs["raison"]


def test_la_telemetrie_compte_les_fichiers_par_flux(tmp_path):
    for flux in ("trades", "book"):
        (tmp_path / "BTC").mkdir(exist_ok=True)
        (tmp_path / "BTC" / f"BTC_{flux}_2026-09-08.parquet").write_bytes(b"x" * 10)
    (tmp_path / "BTC" / "partiel").mkdir()
    (tmp_path / "BTC" / "partiel" / "BTC_trades_2026-09-09_1200.parquet").write_bytes(b"y")

    t = recherche.telemetrie(tmp_path)
    assert t["disponible"] and t["fichiers"] == 3
    btc = t["actifs"][0]
    par_flux = {f["flux"]: f for f in btc["flux"]}
    assert par_flux["trades"]["fichiers"] == 2
    assert par_flux["trades"]["partiels"] == 1, "les segments non compactes se comptent"
    assert par_flux["book"]["fichiers"] == 1


def test_le_journal_absent_pointe_vers_la_machine_qui_le_tient(tmp_path):
    n = recherche.navigation(tmp_path / "rien.jsonl")
    assert n["disponible"] is False
    assert "collecte hebdomadaire" in n["raison"]
    assert n["positions"] == []


def test_le_journal_classe_les_positions_par_etat(tmp_path):
    j = tmp_path / "journal.jsonl"
    jour = 86_400_000
    maintenant = 1_788_000_000_000
    lignes = [
        # close : la fenetre de sortie est passee
        {"version": 2, "symbole": "AAA", "deblocage_ms": maintenant - 30 * jour,
         "part_offre": 0.05, "entree_ms": maintenant - 37 * jour,
         "sortie_ms": maintenant - 24 * jour, "sens": "COURT",
         "reference": "BTC", "inscrit_ms": maintenant - 40 * jour},
        # a venir : l'entree n'a pas encore eu lieu
        {"version": 2, "symbole": "BBB", "deblocage_ms": maintenant + 30 * jour,
         "part_offre": 0.03, "entree_ms": maintenant + 23 * jour,
         "sortie_ms": maintenant + 36 * jour, "sens": "COURT",
         "reference": "BTC", "inscrit_ms": maintenant},
    ]
    j.write_text("\n".join(json.dumps(x) for x in lignes), encoding="utf-8")

    n = recherche.navigation(j)
    assert n["disponible"] and n["inscrites"] == 2
    assert n["closes"] == 1 and n["a_venir"] == 1
    etats = {p["symbole"]: p["etat"] for p in n["positions"]}
    assert etats == {"AAA": "close", "BBB": "à venir"}
    assert n["seuil_conclusion"] == 50, "le journal refuse de conclure sous 50"


def test_le_journal_ne_conclut_pas_sous_le_seuil(tmp_path):
    n = recherche.navigation(tmp_path / "rien.jsonl")
    lignes = {x["cle"]: x for x in recherche.prevol(navigation_=n)}
    assert lignes["hors_echantillon"]["etat"] == "attente"


# --------------------------------------------------------------------------
#  Le vide du P&L doit avoir une cause affichee
# --------------------------------------------------------------------------

def test_aucun_vol_effectue_est_dit_avec_sa_cause():
    v = recherche.vols(SqliteStore(":memory:"))
    assert v["aucun_vol"] is True
    assert v["executions"] == 0
    assert v["courbe"] == []
    assert "19 arrêtés" in v["pourquoi"], "le vide doit citer sa cause mesuree"
    assert v["pnl_realise_usd"] is None, "pas de zero trompeur"


def test_le_pnl_realise_se_tait_tant_qu_une_position_est_ouverte():
    """Un cumul de tresorerie n'est un P&L realise que compte a plat."""
    from decimal import Decimal

    from trading_desk.contracts import Side
    from trading_desk.contracts.orders import Fill

    store = SqliteStore(":memory:")
    store.write_fill(Fill(fill_id="1", cloid=None, ts_ms=1, asset="BTC",
                          side=Side.LONG, size=Decimal("1"),
                          price=Decimal("100"), fee_usd=Decimal("1")))
    v = recherche.vols(store)
    assert v["pnl_indisponible"] is True
    assert v["pnl_realise_usd"] is None
    assert v["positions_ouvertes"] == ["BTC"]

    store.write_fill(Fill(fill_id="2", cloid=None, ts_ms=2, asset="BTC",
                          side=Side.SHORT, size=Decimal("1"),
                          price=Decimal("110"), fee_usd=Decimal("1")))
    v = recherche.vols(store)
    assert v["pnl_indisponible"] is False
    assert v["pnl_realise_usd"] == pytest.approx(8.0), "110 - 100 - 2 de frais"


# --------------------------------------------------------------------------
#  Les courbes contre HODL
# --------------------------------------------------------------------------

def test_une_courbe_sans_trade_est_signalee(client):
    """Zero trade produit une courbe plate qui n'est pas un resultat."""
    r = client.get("/api/courbe", params={"strategie": "tsmom", "actif": "BTC",
                                          "intervalle": "1d"})
    assert r.status_code == 200
    d = r.json()
    assert d["sans_trade"] is False and d["trades"] > 0, (
        "le plafond de stop des campagnes doit etre applique, sinon `tsmom` "
        "fait zero trade et la courbe plate se lit comme une defaite"
    )
    assert d["plafond_stop_bps"] == 5000.0


def test_la_courbe_reproduit_la_grille_validee(client):
    """La courbe rejouee doit donner le meme net que `baselines/grille.json`.

    C'est la garantie que l'interface montre le systeme mesure, et non une
    variante due a des parametres differents.
    """
    grille = json.loads((recherche.BASELINES / "grille.json").read_text())
    cible = next(c for c in grille
                 if c["strategie"] == "tsmom" and c["actif"] == "BTC"
                 and c["intervalle"] == "1d")
    d = client.get("/api/courbe", params={"strategie": "tsmom", "actif": "BTC",
                                          "intervalle": "1d"}).json()
    net = d["strategie_finale"] - d["equite_initiale"]
    assert net == pytest.approx(cible["net_usd"], rel=1e-6)
    assert d["trades"] == cible["trades"]


def test_la_courbe_garde_ses_extremes_en_sous_echantillonnant(client):
    """Un `[::pas]` naif sauterait par-dessus le creux d'un drawdown."""
    from trading_desk.api.server import MAX_POINTS, _echantillonner

    class _B:
        def __init__(self, t): self.ts_ms = t

    n = 5_000
    creux = 1_234
    courbe = [100.0] * n
    courbe[creux] = 1.0
    courbe[creux + 1] = 900.0
    bars = [_B(i) for i in range(n)]

    pts = _echantillonner(courbe, bars)
    assert len(pts) <= MAX_POINTS + 2
    valeurs = [p["v"] for p in pts]
    assert 1.0 in valeurs, "le minimum doit survivre au sous-echantillonnage"
    assert 900.0 in valeurs, "le maximum aussi"
    assert [p["ts_ms"] for p in pts] == sorted(p["ts_ms"] for p in pts)


def test_une_strategie_inconnue_est_refusee_sans_deviner(client):
    assert client.get("/api/courbe", params={"strategie": "martingale"}).status_code == 404


def test_un_fichier_de_bougies_absent_dit_comment_le_produire(client):
    r = client.get("/api/courbe", params={"strategie": "tsmom", "actif": "ZZZ"})
    assert r.status_code == 404
    assert "fetch_candles" in r.json()["detail"]


# --------------------------------------------------------------------------
#  L'assemblage
# --------------------------------------------------------------------------

def test_le_panneau_complet_ne_touche_ni_reseau_ni_modele(client, monkeypatch):
    """`/api/recherche` doit rester utilisable hors ligne.

    Un tableau de bord qui a besoin du reseau pour s'afficher devient
    inutilisable exactement quand le reseau est le probleme.
    """
    def _interdit(*a, **k):
        raise AssertionError("l'interface ne doit ouvrir aucune connexion")

    monkeypatch.setattr("urllib.request.urlopen", _interdit)
    r = client.get("/api/recherche")
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"campagnes", "strategies", "telemetrie", "navigation",
                      "consommation", "vols", "prevol"}
    assert d["prevol"], "la checklist n'est jamais vide"
    for ligne in d["prevol"]:
        assert ligne["etat"] in {"ok", "attente", "bloc"}
        assert ligne["detail"], f"{ligne['cle']} doit dire pourquoi"


def test_la_checklist_distingue_attente_et_blocage():
    """Une attente se resout avec du temps ; un blocage demande une decision."""
    lignes = {x["cle"]: x for x in recherche.prevol(
        vols_={"aucun_vol": True, "pourquoi": "aucun ordre"},
        verdict_risque={"halted": False, "blocking": []},
    )}
    assert lignes["vol"]["etat"] == "bloc"
    assert lignes["risque"]["etat"] == "ok"


def test_l_inventaire_des_strategies_vient_du_code():
    """Une strategie ajoutee au code apparait sans qu'on touche a l'interface."""
    from trading_desk.backtest.strategies import BASELINES

    inv = recherche.strategies()
    assert {s["nom"] for s in inv["strategies"]} == set(BASELINES)


# --------------------------------------------------------------------------
#  Un artefact peut porter DEUX tests de la même hypothèse
# --------------------------------------------------------------------------

def test_le_test_poole_et_le_criblage_par_jeton_sont_lus_separement(tmp_path, monkeypatch):
    """`baselines/unlocks.json` porte les deux, et ils concluent l'inverse.

    Le criblage par jeton fait 269 tests sur des effectifs d'une vingtaine
    d'evenements : zero survivant. Le test poole fait 16 tests sur des
    effectifs de plusieurs centaines : quatre survivants, dont « toutes » a
    p = 0,0010. C'est la MEME hypothese, testee avec deux puissances.

    N'afficher que le premier annoncerait la mort du seul edge directionnel
    du depot. Le fichier a d'ailleurs porte le seul criblage par jeton
    jusqu'au 9 septembre 2026 — l'interface l'aurait annoncee.
    """
    faux = tmp_path / "baselines"
    faux.mkdir()
    (faux / "unlocks.json").write_text(json.dumps({
        "hypothese": "un deblocage fait baisser le prix (sens = -1)",
        "tirages": 2000, "alpha": 0.05,
        "poolage": [
            {"tranche": "toutes", "fenetre": "anticipation_J-7_J-1",
             "evenements": 852, "observe_bps": 236.0, "hasard_bps": 74.6,
             "p": 0.0010, "tirages": 2000},
            *[{"tranche": "x", "fenetre": f"f{i}", "evenements": 300,
               "observe_bps": 0.0, "hasard_bps": 0.0, "p": 0.5,
               "tirages": 2000} for i in range(15)],
        ],
        "cellules": [
            {"actif": f"J{i}", "p_direction": p, "p_amplitude": 0.5,
             "tirages": 2000}
            for i, p in enumerate([0.005] + [0.4] * 268)
        ],
    }), encoding="utf-8")
    monkeypatch.setattr(recherche, "BASELINES", faux)
    recherche._cache.clear()

    par_titre = {c["titre"]: c for c in recherche.campagnes()}
    poole = par_titre["Déblocages — test poolé"]
    jeton = par_titre["Déblocages — criblage par jeton"]

    assert poole["nb_survivants"] == 1 and poole["testees"] == 16
    assert poole["cellules_minimum"] == 1, "16 tests a 2000 tirages voient une cellule seule"
    assert jeton["nb_survivants"] == 0 and jeton["testees"] == 269
    # 269 tests a 2000 tirages ne peuvent PAS isoler une cellule : il en
    # faudrait trois au plancher. Le zero est donc sous-resolu, pas refutant.
    assert jeton["cellules_minimum"] > 1
    assert "invisible" in jeton["resolution"]

    lignes = {x["cle"]: x for x in recherche.prevol(campagnes_=list(par_titre.values()))}
    assert lignes["edge"]["etat"] == "ok", "le test poolé porte un edge directionnel"


def test_un_artefact_au_format_liste_nue_est_signale(tmp_path, monkeypatch):
    """L'ancien format ne doit pas etre lu comme un fichier vide.

    Avant le 9 septembre 2026, `--out` ecrivait une liste nue de cellules.
    Un fichier de cette epoque ne porte pas le test poole : il faut le dire
    et demander une relance, pas afficher « aucune cellule ».
    """
    faux = tmp_path / "baselines"
    faux.mkdir()
    (faux / "unlocks.json").write_text(
        json.dumps([{"actif": "A", "p_direction": 0.4}]), encoding="utf-8")
    monkeypatch.setattr(recherche, "BASELINES", faux)
    recherche._cache.clear()

    for c in recherche.campagnes():
        if c["titre"].startswith("Déblocages"):
            assert c["disponible"] is False
            assert "format d'avant" in c["raison"]
            assert c["commande"].startswith("python ")


# --------------------------------------------------------------------------
#  Le poste de pilotage : habillage, pas seconde application
# --------------------------------------------------------------------------
def test_la_page_classique_reste_servie(client):
    """`/panneaux` n'est pas un vestige : c'est la vue qu'on ouvre pour lire
    plutôt que pour piloter, et celle qui reste lisible sur un écran qui n'a
    pas le format du poste."""
    page = client.get("/panneaux").text
    assert 'id="sec-prevol"' in page
    assert 'id="embarquement"' not in page, "la vue sans décor n'a pas d'accueil"


def test_aucune_page_de_l_interface_ne_passe_d_ordre(client):
    """La règle du dépôt vaut sous le décor comme sans lui.

    Un brief voulait autrefois des gâchettes « acheter » et « vendre » sous
    les pouces. Cette interface ne le peut pas : deux gâchettes sous les
    pouces sont le pire endroit possible pour un ordre cliqué par erreur.
    """
    for route in ("/", "/panneaux"):
        page = client.get(route).text
        assert "/api/order" not in page and "/api/trade" not in page, route
def test_aucun_lorem_de_la_photo_ne_survit():
    """La photo est générée : son texte est halluciné de bout en bout.

    Le brief demandait de garder « les noms métier déjà dans le code
    (HOOL, Thana, PAL…) ». Vérification faite, aucun n'y est. Les recopier
    produirait une interface qui ment sur ce qu'elle affiche.
    """
    ui = recherche.RACINE / "src/trading_desk/ui"
    texte = "\n".join(
        f.read_text(encoding="utf-8", errors="ignore")
        for f in (*ui.glob("*.html"), *ui.glob("*.js"),
                  *ui.glob("poste/*.js"), *ui.glob("poste/*.css"))
    )
    for lorem in ("ALDO PORTOMANICE", "RERERSONT", "ANRLESUHE", "SUPYTANTES",
                  "SQUIPE", "ROLLANT SERIATOR", "QUARCED ON DRAPPED",
                  "PILGTAGE", "Analog diars", "Thana", "TELEMETRIC",
                  "orbital_sources",
                  # la photo du 10 septembre en a apporté d'autres
                  "ORBITAL TRADING DESK", "ALDO PERFORMANCE", "HODL curne",
                  "GUARDED UN QUARRED", "NVELNENT SEROITOR", "SEROITOR",
                  "SURVIVAINTS", "ATTENDUES", "Seuil 1 seuli", "book.BTX",
                  "PR9-VOL", "SYSTENES", "CONSUMATION", "SCOORET"):
        assert lorem not in texte, f"lorem halluciné conservé : {lorem}"

    # La règle vaut aussi pour les COMMENTAIRES. Elle m'a attrapé le
    # 9 septembre 2026 : j'expliquais dans le CSS pourquoi telle étiquette
    # peinte est recouverte, en la citant — et le test a échoué. Il avait
    # raison. Une chaîne écartée qui traîne dans les fichiers d'interface
    # finit par être recopiée par quelqu'un qui la prend pour une valeur.
    # Ce test est désormais le seul endroit du dépôt où ces chaînes ont le
    # droit de figurer : c'est ici qu'on explique ce qu'on écarte et
    # pourquoi. Le document qui le faisait est parti avec l'ancien cockpit.


# --------------------------------------------------------------------------
#  Le lanceur de campagnes
# --------------------------------------------------------------------------
#
#  Ce module est le seul du dépôt qui crée un processus à partir d'une
#  requête HTTP. Tout ce qui suit vérifie la même chose sous quatre angles :
#  le navigateur choisit une CLÉ dans un catalogue fermé, jamais une commande.

def _lanceur():
    from trading_desk.api.campagnes import Lanceur
    return Lanceur(DeskState(Settings(), SqliteStore(":memory:")))


def _lanceur_en_mode(mode):
    """Un lanceur dont on ne fixe QUE le mode.

    Construire un `Settings` en LIVE exige une adresse de portefeuille agent
    et interdit `testnet` — le contrat a raison de l'exiger, mais `refus()`
    ne lit que `mode.produces_orders`. Fabriquer une fausse clé pour un test
    qui n'en a pas besoin serait mettre dans le dépôt exactement le genre de
    valeur qu'on finit par recopier ailleurs.
    """
    from types import SimpleNamespace
    from trading_desk.api.campagnes import Lanceur
    return Lanceur(SimpleNamespace(settings=SimpleNamespace(mode=mode)))


def test_le_catalogue_des_campagnes_est_ferme(client):
    """Une clé inconnue ne lance rien — et surtout ne compose pas de commande.

    Le paramètre vient du navigateur. S'il servait à construire une ligne de
    commande, atteindre le port suffirait à obtenir un shell : `127.0.0.1` et
    le tunnel SSH protègent l'accès, pas ce qu'on peut faire une fois dedans.
    """
    r = client.post("/api/campagnes/lancer",
                    json={"cle": "; rm -rf /", "parametres": {}})
    assert r.status_code == 200
    assert r.json() == {"lance": False,
                        "raison": "campagne inconnue : ; rm -rf /"}


def test_les_parametres_sont_bornes_pas_interpretes():
    """Le nombre de tirages est ramené dans sa plage, quoi qu'on envoie.

    2 000 tirages plancher p à 0,0005 ; 100 le plancheraient à 0,01, au-dessus
    de ce que Benjamini-Hochberg exige au rang 1. La borne basse n'est pas de
    la prudence : en dessous, la campagne ne peut plus rien réfuter.
    """
    from trading_desk.api.campagnes import CATALOGUE
    grille = CATALOGUE["grille"]
    assert grille.ligne({"draws": 99_999})[-1] == "5000"
    assert grille.ligne({"draws": -1})[-1] == "100"
    assert grille.ligne({"draws": "; whoami"})[-1] == "2000"   # défaut
    assert grille.ligne({})[-1] == "2000"


def test_aucune_campagne_pendant_que_le_desk_fabrique_des_ordres():
    """En PAPER le pupitre décide sur le carnet de l'instant.

    Une campagne sature les deux cœurs du VPS ; le cycle décale ; le fill
    simulé se calcule alors sur un carnet périmé. Le résultat est faux et
    rien ne le signale — c'est le pire des deux mondes, donc on refuse.
    """
    for mode in (DeskMode.PAPER, DeskMode.TESTNET, DeskMode.LIVE):
        assert mode.produces_orders, f"{mode} devrait fabriquer des ordres"
        motif = _lanceur_en_mode(mode).refus()
        assert motif and mode.value in motif, f"{mode} devrait refuser"
    assert not DeskMode.SHADOW.produces_orders
    assert _lanceur_en_mode(DeskMode.SHADOW).refus() is None
    assert _lanceur().refus() is None            # le desk réel, en SHADOW


def test_arreter_sans_campagne_ne_tue_rien():
    """`arreter` sur un lanceur au repos ne doit surtout pas tuer un PID
    hérité d'une campagne précédente."""
    assert _lanceur().arreter() == {"arrete": False,
                                    "raison": "aucune campagne en cours"}


def test_le_snapshot_annonce_le_catalogue_et_le_refus(client):
    """L'interface doit pouvoir griser le bouton AVANT qu'on clique, et dire
    pourquoi. Un refus découvert après coup ressemble à une panne."""
    d = client.get("/api/campagnes").json()
    assert {c["cle"] for c in d["catalogue"]} == {
        "grille", "declencheurs", "deblocages", "journal"}
    for c in d["catalogue"]:
        assert c["quoi"] and c["duree"], f"{c['cle']} n'annonce pas sa question"
    assert d["en_cours"] is False and d["refus"] is None


def test_la_sortie_est_bornee():
    """Un script bavard ne doit pas faire tomber le serveur : c'est par lui
    que passe le coupe-circuit."""
    from trading_desk.api.campagnes import LIGNES_MAX
    lan = _lanceur()
    for i in range(LIGNES_MAX * 3):
        lan.lignes.append(f"ligne {i}")
    assert len(lan.lignes) == LIGNES_MAX
    assert lan.lignes[-1] == f"ligne {LIGNES_MAX * 3 - 1}"
# --------------------------------------------------------------------------
#  Le poste : accueil, séquence, décor
# --------------------------------------------------------------------------

def _poste() -> str:
    return (recherche.RACINE / "src/trading_desk/ui/poste.html").read_text(encoding="utf-8")


def test_la_racine_sert_le_poste_et_son_accueil(client):
    """La page d'arrivée porte l'accueil, et la racine le sert."""
    page = client.get("/").text
    assert "Welcome onboard Boss" in page
    # Deux etapes avant la sequence : la carte-titre noire, puis la vue
    # d'ensemble. C'est ce qui evite de devoiler le poste avant le zoom.
    assert 'id="titre"' in page, "la carte-titre a disparu"
    assert 'id="embarquement"' in page and 'id="sequence"' in page


def test_le_poste_charge_les_panneaux_au_lieu_de_les_recopier(client):
    """Une seule implémentation de l'écran du desk.

    L'ancien poste recopiait tout le balisage de l'application dans sa
    propre page ; cette seconde copie devait être tenue synchronisée à la
    main. Deux implémentations du même écran finissent toujours par
    diverger, et c'est celle qu'on regarde le moins qui dérive — donc celle
    qui ment sans qu'on s'en aperçoive.
    """
    page = client.get("/").text
    # Le préfixe, pas l'URL exacte : la dalle demande `/panneaux?verre`, et
    # c'est un autre test qui veille sur ce paramètre. Celui-ci ne surveille
    # qu'une chose — que la dalle CHARGE les panneaux au lieu d'en recopier
    # le balisage.
    assert 'src="/panneaux' in page, "la dalle doit charger les panneaux"
    for secteur in ("prevol", "telemetrie", "navigation", "soufflerie",
                    "consommation", "vols", "systemes"):
        assert f'id="sec-{secteur}"' not in page, (
            f"{secteur} est recopié dans le poste : c'est la seconde "
            "implémentation qu'on vient d'éviter")


def test_la_sequence_offre_deux_encodages(client):
    """H.264 pour Safari, VP9 pour les navigateurs sans codec propriétaire.

    Sans le second, la séquence ne peut même pas être éprouvée ici — le
    Chromium de test est construit sans H.264 — et un chemin qu'on ne peut
    pas éprouver est un chemin qu'on croit bon. C'est ce qui a laissé passer
    un écran noir au premier essai.
    """
    # Les sources sont posées par le script, parce qu'une seule balise vidéo
    # sert les quatre transitions. La règle des deux encodages vaut pour
    # TOUTES, pas seulement pour l'embarquement : c'est la séquence qu'on
    # peut le moins éprouver qui cassera.
    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    assert 'ajouter("mp4"' in js and 'ajouter("webm"' in js, \
        "le script ne propose plus les deux encodages"
    assert 'avc1.64001f' in js and 'vp9' in js, \
        "le codec doit être déclaré en entier, pas seulement le conteneur"

    base = recherche.RACINE / "src/trading_desk/ui/poste/assets"
    sequences = ("embarquement", "retour", "vers_gauche", "vers_pfd")
    for nom in sequences:
        for ext in ("mp4", "webm"):
            chemin = base / f"{nom}.{ext}"
            assert chemin.exists(), f"{chemin.name} manque"
            assert chemin.stat().st_size > 50_000, f"{chemin.name} trop petit"
    for nom in ("poste.jpg", "accueil.jpg", "gauche.jpg"):
        chemin = base / nom
        assert chemin.exists(), f"{nom} manque"
        assert chemin.stat().st_size > 50_000, f"{nom} suspicieusement petit"


def test_le_poste_est_pose_sous_la_sequence_pas_apres_elle():
    """Un décor déjà peint ne peut pas manquer son entrée.

    La première version montait le poste au moment de la bascule et devait
    ordonner deux images de battement pour qu'il soit peint avant que la
    vidéo ne parte. Toute panne de cet ordonnancement laissait un écran
    noir — et c'est exactement ce qui est arrivé quand le navigateur a
    refusé le codec.
    """
    page = _poste()
    debut_poste = page.index('<div id="poste"')
    assert 'id="poste" hidden' not in page and "id='poste' hidden" not in page, \
        "le poste ne doit pas démarrer caché"
    assert page.index('id="sequence"') < debut_poste, \
        "la séquence doit être déclarée avant le poste, donc au-dessus"

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    # Toute panne de lecture doit mener au poste, jamais à un écran noir.
    for filet in ('addEventListener("error"', "lecture.catch", '"ended"'):
        assert filet in js, f"filet manquant : {filet}"


def test_le_cadrage_de_la_dalle_n_a_qu_une_source():
    """Le verre et son reflet se superposent : une seule déclaration.

    Répéter les quatre valeurs, c'est garantir qu'un jour l'une sera
    corrigée et pas l'autre, et que le reflet flottera à côté du verre sans
    que personne ne comprenne pourquoi.
    """
    css = (recherche.RACINE / "src/trading_desk/ui/poste/poste.css") \
        .read_text(encoding="utf-8")
    for nom in ("--verre-l", "--verre-t", "--verre-w", "--verre-h"):
        assert css.count(nom + ":") == 1, f"{nom} déclaré plusieurs fois"
        assert f"var({nom})" in css, f"{nom} déclaré mais jamais utilisé"


# --------------------------------------------------------------------------
#  La dalle : les panneaux vus DEPUIS le poste
# --------------------------------------------------------------------------
#
#  La dalle charge `/panneaux?verre`, ce qui pose `data-verre` sur la racine
#  et declenche une mise en page courte. Tout ce qui suit protege cette mise
#  en page contre les quatre facons dont elle s'est deja cassee.

def _desk_css() -> str:
    return (recherche.RACINE / "src/trading_desk/ui/desk.css").read_text(encoding="utf-8")


def _panneaux() -> str:
    return (recherche.RACINE / "src/trading_desk/ui/index.html").read_text(encoding="utf-8")


def _bloc_verre() -> str:
    """Le bloc « DANS LE VERRE », borne a la section SUIVANTE.

    Il a d'abord ete pris jusqu'a la fin du fichier. C'etait juste tant
    qu'il etait dernier ; la premiere section ajoutee apres lui a fait
    echouer le test d'etancheite sur des regles qui ne le concernaient pas.
    Une borne implicite « jusqu'a la fin » est une borne qui se trompera le
    jour ou quelqu'un ecrira en dessous.
    """
    css = _desk_css()
    debut = css.index("DANS LE VERRE")
    suite = css.find("\n/* ====", debut)
    return css[debut:] if suite == -1 else css[debut:suite]


def test_la_dalle_demande_les_panneaux_en_version_verre():
    """Le poste charge `/panneaux?verre`, pas `/panneaux` tout court."""
    assert "/panneaux?verre" in _poste(), \
        "sans le paramètre, la dalle reçoit la mise en page longue"


def test_le_marqueur_du_verre_est_pose_avant_le_premier_rendu():
    """`data-verre` est posé dans le `<head>`, pas par le script de la page.

    Posé après coup, il afficherait la mise en page longue pendant une
    image, puis la courte — un sursaut visible au moment précis où l'on
    arrive au poste, là où tout l'effet repose sur la continuité.
    """
    page = _panneaux()
    assert "data-verre" in page, "le marqueur n'est jamais posé"
    tete = page.index("</head>")
    assert page.index("data-verre") < tete, \
        "le marqueur est posé après le <head> : la bascule sera visible"

    # `desk.js` a le droit de LIRE le marqueur — il s'en sert pour n'activer
    # le départ vers l'écran de gauche que dans le décor. Ce qu'il ne doit
    # pas faire, c'est le POSER : posé après coup, on verrait la mise en
    # page longue pendant une image.
    js = (recherche.RACINE / "src/trading_desk/ui/desk.js").read_text(encoding="utf-8")
    for pose in ('setAttribute("data-verre"', "dataset.verre ="):
        assert pose not in js, \
            f"le marqueur est posé par desk.js ({pose}) : la bascule sera visible"


def test_la_mise_en_page_du_verre_ne_deborde_pas_sur_la_vue_sans_decor():
    """Aucune règle du bloc « verre » ne s'applique sans le marqueur.

    La vue sans décor est celle qu'on ouvre en plein écran pour LIRE : 15 px
    de corps, une largeur de lecture, un défilement normal. Une seule règle
    qui fuirait hors du bloc la rendrait illisible sans que rien ne le dise,
    puisque les deux vues servent le même fichier.
    """
    for ligne in _bloc_verre().splitlines():
        ligne = ligne.strip()
        # On ne regarde que les lignes qui ouvrent un sélecteur.
        if not ligne or ligne.startswith(("/*", "*", "}")) or "{" not in ligne:
            continue
        selecteur = ligne.split("{")[0].strip()
        assert selecteur.startswith(":root[data-verre]"), \
            f"règle non préfixée dans le bloc verre : {selecteur!r}"


def test_les_enfants_de_la_dalle_peuvent_retrecir():
    """`min-width:0`. Le défaut le plus sournois rencontré sur cette dalle.

    Un enfant de conteneur flex a `min-width:auto` : il refuse de rétrécir
    sous sa largeur min-content. La barre des sept onglets en `nowrap`
    mesurait 771 px de min-content et imposait cette largeur à toute la
    page — dans une dalle de 625 px. Et comme la racine porte
    `overflow:hidden`, l'excédent n'était pas offert au défilement : il
    était COUPÉ, sans barre, sans indice. Le bouton « Tout arrêter » était
    tronqué et les deux derniers onglets absents, sur l'écran dont c'est
    précisément le rôle de tout montrer.

    La grille a la même faiblesse par une autre porte : `1fr` vaut
    `minmax(auto, 1fr)`, dont le minimum est min-content. D'où `minmax(0,1fr)`.
    """
    bloc = _bloc_verre()
    assert "min-width:0" in bloc, "rien ne permet aux enfants de rétrécir"
    assert "grid-template-columns:minmax(0,1fr) auto" in bloc, \
        "la bannière garde un plancher min-content : le bouton d'arrêt sera coupé"
    assert "grid-template-columns:minmax(0,1fr)" in bloc, \
        "le secteur garde un plancher min-content"


def test_la_hauteur_de_la_dalle_est_budgetee():
    """Rien au-dessus du secteur ne peut grandir avec les données.

    La bannière était le seul bloc de la dalle dont la hauteur dépend des
    données : cinq invariants en défaut font six lignes, douze en font
    treize. Sans plafond, le jour où tout casse — précisément celui où on
    regarde cet écran — la bannière mange la dalle et le secteur tombe à
    zéro. Mesuré : 0 px de secteur sur une fenêtre de 1280×800.

    Le plancher du secteur ne vaut que parce que ces plafonds existent ;
    seul, il ne ferait que déplacer le débordement d'un cran plus bas.
    """
    bloc = _bloc_verre()
    assert "max-height:21vh" in bloc, "la liste des invariants n'est pas plafonnée"
    assert "min-height:26vh" in bloc, "le secteur n'a pas de plancher"


def test_le_bouton_de_theme_disparait_dans_le_verre():
    """Le poste force le thème sombre à chaque chargement de la dalle.

    Un bouton qui change quelque chose que le rechargement suivant reprend
    n'est pas une préférence, c'est un mensonge. Il reste dans la vue sans
    décor, où il décide vraiment.
    """
    bloc = _bloc_verre()
    assert ":root[data-verre] #theme { display:none }" in bloc

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    assert 'setAttribute("data-theme", "dark")' in js, \
        "le poste ne force plus le thème : cacher le bouton devient arbitraire"


def test_le_titre_de_la_dalle_est_masque_sans_etre_retire():
    """Masqué à l'œil, pas retiré de l'arbre d'accessibilité.

    « Desk · Poste de pilotage » est le titre du document : un lecteur
    d'écran doit continuer à l'annoncer. Il est en revanche redondant à
    l'œil — le cadre autour de la dalle EST le poste.
    """
    bloc = _bloc_verre()
    i = bloc.index(":root[data-verre] .bar h1")
    regle = bloc[i:bloc.index("}", i)]
    assert "clip-path" in regle, "le titre doit être rogné, pas caché"
    assert "display:none" not in regle, \
        "display:none retire le titre de l'arbre d'accessibilité"


def test_les_deux_raccords_sont_declares():
    """La sequence part de l'accueil et arrive sur le decor.

    Les deux images ne sont pas choisies : elles sont EXTRAITES de la
    sequence — la premiere image pour l'accueil, la derniere pour le decor.
    C'est ce qui rend les deux raccords exacts par construction. Mesure du
    12 septembre 2026 : 0,00 % d'ecart entre le decor et chacune des huit
    dernieres images de la video.

    Choisir une autre prise du meme cockpit, si ressemblante soit-elle,
    ferait sauter le raccord au moment precis ou tout l'effet repose
    dessus. Le depot a deja tranche ce point une fois, avec les mesures, en
    refusant une image envoyee separement.
    """
    page = _poste()
    # La vue d'ensemble est devenue une BOUCLE : l'image n'y sert plus que
    # de `poster`, le temps que la premiere image se decode. Le raccord au
    # depart ne repose donc plus sur l'egalite des images — l'instant du
    # clic est quelconque dans la boucle — mais sur le fondu croise : la vue
    # s'efface par-dessus le zoom, qui joue deja dessous.
    assert "assets/vue.mp4" in page, "la vue d'ensemble n'est pas la boucle"
    assert "assets/poste.jpg" in page, "le decor n'est pas la derniere image"

    base = recherche.RACINE / "src/trading_desk/ui/poste/assets"
    for nom in ("vue.mp4", "vue.webm", "vue.jpg", "accueil.jpg", "poste.jpg",
                "embarquement.mp4", "embarquement.webm"):
        chemin = base / nom
        assert chemin.exists(), f"{nom} manquant"
        assert chemin.stat().st_size > 10_000, f"{nom} suspicieusement petit"


def test_la_vue_d_ensemble_boucle_sans_saut():
    """La boucle est muette, et son point de bouclage a ete fondu.

    Sur la source, la derniere image differait de la premiere de 16,3 % :
    le saut se voyait toutes les quinze secondes. La queue a donc ete
    fondue sur la tete a l'encodage — 0,6 % apres — ce qui decale le point
    de depart mais referme la boucle.

    Muette, parce que la bande son du vaisseau tourne deja : deux sources
    qui se chevauchent sonnent comme une panne.
    """
    page = _poste()
    i = page.index('id="vueGlobale"')
    balise = page[i - 120:page.index(">", i)]
    for attendu in ("loop", "muted", "playsinline", "poster="):
        assert attendu in balise, f"la vue d'ensemble n'est pas {attendu}"

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    # Elle ne decode que tant qu'on la regarde : une video qui tourne sous
    # trois autres couches chauffe la machine pour rien.
    assert "arreterLaVue()" in js and "jouerLaVue()" in js


def test_le_titre_precede_la_vue_d_ensemble():
    """La carte-titre est NOIRE, et elle vient avant le cockpit.

    Le titre était auparavant posé sur la photo du poste. Arriver
    directement sur le cockpit dévoile le décor avant le zoom, et le zoom
    n'a plus rien à révéler — d'où deux étapes, et un fond noir sur la
    première.
    """
    css = (recherche.RACINE / "src/trading_desk/ui/poste/poste.css") \
        .read_text(encoding="utf-8")
    i = css.index("#titre {")
    regle = css[i:css.index("}", i)]
    assert "z-index: 40" in regle, "la carte-titre doit couvrir tout le reste"
    assert "radial-gradient" in regle, "elle doit rester un écran noir"

    page = _poste()
    assert page.index('id="titre"') < page.index('id="embarquement"'), \
        "la carte-titre doit être déclarée avant la vue d'ensemble"


def test_la_dalle_est_projetee_en_perspective():
    """L'ecran est vu en contre-plongee : la dalle doit l'etre aussi.

    Mesure des deux bords de l'ecran radar sur `poste.jpg`, en regression
    robuste (114 et 79 points) : bord gauche x = -0,0411y + 219,1, bord
    droit x = +0,0547y + 1062,8. Les deux s'ecartent vers le bas — 847 px
    de large en haut, 911 en bas, soit 7,5 % d'evasement. Une dalle
    rectangulaire posee sur un ecran trapezoidal se voit immediatement :
    les bords peints depassent d'un cote et sont recouverts de l'autre.

    `perspective` n'accepte pas de pourcentage. La caler en pixels fixes
    donnerait une projection juste a une seule taille de fenetre et fausse
    partout ailleurs, d'ou le calcul sur la largeur reelle de la scene.
    """
    css = (recherche.RACINE / "src/trading_desk/ui/poste/poste.css") \
        .read_text(encoding="utf-8")
    assert "--profondeur" in css and "--inclinaison" in css
    assert "min(100vw, 177.78vh)" in css, \
        "la profondeur ne suit plus la taille de la scene"
    assert "perspective(var(--profondeur)) rotateX(var(--inclinaison))" in css

    # Le verre ET le reflet subissent la meme projection, par la meme regle.
    i = css.index(".verre, .reflet {")
    regle = css[i:css.index("}", i)]
    assert "transform:" in regle, \
        "le reflet doit etre projete avec le verre, sinon il glisse dessus"


def test_un_bouton_ramene_a_la_vue_d_ensemble():
    """Le poste est un gros plan : il faut pouvoir en ressortir.

    Le bouton efface la memoire de session. Sans cet effacement, le clic
    suivant sauterait directement au poste et le bouton aurait l'air de ne
    rien faire.
    """
    assert 'id="revoir"' in _poste()
    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    # On vise le GESTIONNAIRE, pas la première mention de l'élément : le
    # bouton est récupéré bien plus haut, avec les autres stations.
    i = js.index('revoirBtn.addEventListener("click"')
    bloc = js[i:i + 900]
    assert "removeItem(MEMOIRE)" in bloc, \
        "sans effacer la mémoire, le bouton semble ne rien faire"
    # Le retour joue la séquence inverse ; c'est `arriver()` qui redonne
    # l'accueil, une fois la vidéo finie.
    assert 'jouer("retour")' in bloc, \
        "le bouton ne lance plus la séquence de retour"
    assert 'destination === "accueil"' in js and "accueil.hidden = false" in js, \
        "rien ne redonne l'accueil à la fin de la séquence de retour"


def test_les_quatre_transitions_sont_declarees():
    """Un seul lecteur, quatre séquences, et chacune sait où elle arrive.

    Quatre éléments vidéo distincts auraient voulu dire quatre états à
    garder synchronisés, dont trois toujours en train de se taire.
    """
    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    for nom, fichier in (("embarquement", "embarquement"), ("retour", "retour"),
                         ("versGauche", "vers_gauche"), ("versPfd", "vers_pfd")):
        assert nom in js and f'"{fichier}"' in js, f"transition {nom} absente"
    # La station d'arrivée est montée AVANT que la séquence ne parte : un
    # décor déjà peint ne peut pas manquer son entrée.
    assert js.index("montrer(t.vers)") < js.index("sequence.hidden = false"), \
        "la station d'arrivée doit être montée avant de lancer la vidéo"


def test_l_ecran_de_gauche_affiche_les_memes_panneaux():
    """Pas une seconde application : la même page, en vue `flux`.

    C'est la règle du dépôt. Deux implémentations du même écran finissent
    toujours par diverger, et c'est celle qu'on regarde le moins qui dérive.
    """
    page = _poste()
    assert 'src="/panneaux?verre&amp;vue=flux"' in page, \
        "l'écran de gauche ne charge pas les panneaux en vue flux"
    assert 'id="retourPfd"' in page

    css = _desk_css()
    assert ':root[data-vue="flux"] #sec-systemes .panel { display: none }' in css
    assert ':root[data-vue="flux"] #sec-systemes .panel:has(#feeds)' in css, \
        "le panneau des flux n'est pas isolé"


def test_l_ecran_d_attente_couvre_la_sequence_pendant_le_fondu():
    """Le desk ne doit apparaître à aucun moment entre le zoom et l'attente.

    L'écran d'attente était en z-index 15, donc SOUS la séquence (20).
    L'ordre en découlait : retirer la vidéo — ce qui découvrait le desk —
    puis faire monter l'attente de 0 à 1 par-dessus. Le desk restait donc
    en clair pendant toute la demi-seconde du fondu. C'est le flash signalé
    entre la vidéo de zoom et l'écran d'attente.

    Deux conditions, et il faut les deux : la couche au-dessus, ET la
    séquence retirée seulement après le fondu.
    """
    css = (recherche.RACINE / "src/trading_desk/ui/poste/poste.css") \
        .read_text(encoding="utf-8")
    def z(selecteur):
        i = css.index(selecteur + " {")
        bloc = css[i:css.index("}", i)]
        j = bloc.index("z-index:")
        return int(bloc[j + 8:bloc.index(";", j)].strip())

    assert z("#attente") > z("#sequence"), \
        "l'attente passe sous la séquence : le desk réapparaît pendant le fondu"
    assert z("#attente") > z("#poste"), "l'attente doit couvrir le poste"

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    i = js.index('if (destination === "attente")')
    bloc = js[i:i + 300]
    assert "entrerEnAttente(" in bloc and "sequence.hidden = true" in bloc, \
        "la séquence doit être retirée PAR le rappel de fin de fondu"
    # Et surtout : pas avant.
    avant = js[js.index("function arriver"):i]
    assert "sequence.hidden = true" not in avant, \
        "la séquence est retirée avant le fondu : le flash revient"


def test_un_desk_perime_le_dit_en_toutes_lettres():
    """Une pastille à « — » ne dit rien à personne.

    Cette page est relue sur le disque à chaque requête ; le processus
    Python a chargé son code une fois, au démarrage. Après un `git pull`,
    l'écran est donc à jour alors que le desk ne l'est pas, et rien ne
    permettait de s'en apercevoir. Ça a coûté plusieurs allers-retours de
    dépannage sur un défaut déjà corrigé.
    """
    assert 'id="perime"' in _panneaux()
    js = (recherche.RACINE / "src/trading_desk/ui/desk.js").read_text(encoding="utf-8")
    i = js.index("if (s.version)")
    bloc = js[i:i + 600]
    assert "else" in bloc and '$("perime").hidden = false' in bloc, \
        "l'absence de version doit déclencher l'avertissement, pas le silence"


def test_les_deux_clics_existent_et_sortent_de_la_meme_source():
    """Deux sons voisins se lisent comme deux gestes d'un même appareil.

    Celui du menu est dérivé de celui d'ouverture — monté de trois
    demi-tons et raccourci — plutôt qu'inventé : deux sons étrangers l'un à
    l'autre se lisent comme un bogue.
    """
    base = recherche.RACINE / "src/trading_desk/ui/poste/assets"
    for nom in ("clic-ouvrir.mp3", "clic-menu.mp3"):
        chemin = base / nom
        assert chemin.exists(), f"{nom} manque"
        assert chemin.stat().st_size > 2_000, f"{nom} suspicieusement petit"

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    # `cloneNode` : deux clics rapprochés doivent s'entendre deux fois.
    # Rembobiner un élément unique coupe le premier son pour jouer le
    # second, ce qui s'entend comme un clic manqué.
    assert "cloneNode" in js, "un élément unique avale les clics rapprochés"
    # Muet si la bande son l'est : couper le son du vaisseau et garder les
    # boutons serait incohérent.
    i = js.index("function clic(")
    assert "sonVoulu()" in js[i:i + 300]


def test_le_radar_annonce_ce_qu_il_fait():
    """« Market scan in progress », sur une plaque.

    Posé à nu, le texte tombait sur les graduations du radar : les chiffres
    du pourtour traversaient les lettres. La plaque n'est pas un pis-aller,
    c'est la langue du poste — tous ses libellés sont encadrés.
    """
    page = _poste()
    assert "Market scan in progress" in page
    assert '<p class="balayage"><span>' in page, \
        "sans la plaque, le texte se perd dans les graduations"


def test_l_acces_a_l_ecran_de_gauche_est_un_bouton_du_poste():
    """Le titre du panneau ne déclenche plus rien.

    « Flux de données » ne s'affiche plus que sur l'écran de gauche ; l'y
    rendre cliquable relancerait la transition qui vient de s'achever — un
    bouton qui ramène là où l'on est déjà. L'aller est donc un bouton du
    poste, symétrique de « Return to PFD ».
    """
    page = _poste()
    assert 'id="versGauche"' in page and 'id="retourPfd"' in page

    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    assert 'jouer("versGauche")' in js and 'jouer("versPfd")' in js

    desk_js = (recherche.RACINE / "src/trading_desk/ui/desk.js") \
        .read_text(encoding="utf-8")
    # Les panneaux publient encore un message — pour le SON des boutons,
    # qui vit avec le poste. Ce qu'ils ne publient plus, c'est une demande
    # de transition : elle passe par un bouton du poste.
    assert "voir-flux" not in desk_js, \
        "les panneaux demandent encore la transition : elle appartient au poste"


def test_le_panneau_des_flux_quitte_le_pfd():
    """Une même mesure à deux endroits finit par ne plus s'afficher pareil.

    Le panneau garde sa place dans la vue sans décor : elle n'a pas d'écran
    de gauche, et elle sert justement à tout voir d'un coup.
    """
    css = _desk_css()
    assert ':root[data-verre]:not([data-vue]) #sec-systemes .panel:has(#feeds)' in css


def test_la_barre_affiche_la_version_qui_tourne():
    """La question « avez-vous relancé ? » doit se répondre à l'écran.

    Elle s'est posée à chaque aller-retour de dépannage, et personne ne
    pouvait y répondre : le fichier sur le disque était à jour, le
    processus non.
    """
    assert 'id="version"' in _panneaux()
    js = (recherche.RACINE / "src/trading_desk/ui/desk.js").read_text(encoding="utf-8")
    assert 's.version' in js and '$("version")' in js


def test_le_rearmement_ne_ment_pas():
    """`/api/arm` rend les invariants encore en défaut : il faut les dire.

    L'ancienne version affichait « Desk réarmé » dans tous les cas ;
    l'évaluation suivante rearrêtait le desk une seconde plus tard, avec le
    même motif. Vu de l'écran, le bouton ne faisait rien et rien ne disait
    pourquoi.
    """
    js = (recherche.RACINE / "src/trading_desk/ui/desk.js") \
        .read_text(encoding="utf-8")
    i = js.index('await post("/api/arm")')
    bloc = js[i:i + 500]
    assert "blocking" in bloc, "la réponse du réarmement est ignorée"
    assert "Réarmement sans effet" in bloc


def test_l_avertissement_de_pied_de_page_est_retire():
    """Il occupait un tiers de la dalle pour trois phrases invariantes.

    Ce qu'il affirmait reste vrai et reste VÉRIFIÉ — par
    `test_le_poste_ne_passe_aucun_ordre`, qui l'éprouve au lieu de
    l'écrire.
    """
    page = _panneaux()
    assert "ne passe <b>aucun ordre</b>" not in page
    assert "tunnel SSH" not in page


def test_le_seuil_du_decor_est_le_meme_des_deux_cotes():
    """Le seuil est écrit deux fois. Ces deux écritures doivent s'accorder.

    Le poste redirige vers les panneaux quand la fenêtre est trop petite
    pour le décor ; `desk.css` masque le lien « poste » exactement en
    dessous du même seuil. S'ils divergent, le lien mène à une page qui
    renvoie aussitôt sur celle qu'on vient de quitter : un clic sans effet,
    et rien à l'écran pour dire pourquoi.

    Le décor est une image 16/9 contenue dans la fenêtre, donc sa largeur
    vaut min(largeur, hauteur × 16/9). Exiger L pixels de décor revient à
    exiger L de large et L × 9/16 de haut.
    """
    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    m = re.search(r"LARGEUR_MINIMALE_DU_DECOR\s*=\s*(\d+)", js)
    assert m, "le seuil n'est plus une constante nommée dans poste.js"
    seuil = int(m.group(1))

    css = (recherche.RACINE / "src/trading_desk/ui/desk.css").read_text(encoding="utf-8")
    q = re.search(r"@media \(min-width:(\d+)px\) and \(min-height:(\d+)px\)"
                  r"\s*\{\s*#versPoste", css)
    assert q, "la requête de média qui montre le lien « poste » a disparu"
    largeur, hauteur = int(q.group(1)), int(q.group(2))

    assert largeur == seuil, (
        f"le poste redirige sous {seuil} px, le lien réapparaît à {largeur} px")
    attendue = round(seuil * 9 / 16)
    assert abs(hauteur - attendue) <= 1, (
        f"hauteur minimale {hauteur} px, attendue {attendue} px "
        f"pour un décor 16/9 de {seuil} px")


def test_la_piece_trop_petite_rend_les_panneaux_nus():
    """Sous le seuil, on sert les instruments plutôt qu'un décor minuscule.

    Sur un téléphone en portrait, la dalle mesure 190×149 : le desk y est
    illisible et le décor ne décore plus rien. `replace` et non `href` — le
    bouton « retour » doit ramener d'où l'on vient, pas rejouer la
    redirection.
    """
    js = (recherche.RACINE / "src/trading_desk/ui/poste/poste.js") \
        .read_text(encoding="utf-8")
    assert 'location.replace("/panneaux")' in js, \
        "le repli ne mène pas aux panneaux, ou piège le bouton retour"
    # La redirection doit précéder tout le reste : monter la séquence puis
    # partir ferait télécharger deux mégaoctets de vidéo pour rien.
    assert js.index("location.replace") < js.index('getElementById("embarquement")'), \
        "le repli doit décider avant que la page ne se monte"


def test_les_panneaux_savent_revenir_au_poste():
    """On pouvait quitter le décor, jamais y revenir."""
    page = _panneaux()
    assert 'id="versPoste"' in page and 'href="/"' in page, \
        "la vue sans décor n'a pas de chemin de retour"


def test_le_poste_ne_passe_aucun_ordre(client):
    """La règle du dépôt vaut aussi sous le décor."""
    page = client.get("/").text
    assert "/api/order" not in page and "/api/trade" not in page
