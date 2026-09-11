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
    # `COCKPIT_AUDIT.md` est le seul endroit où on a le droit de les nommer,
    # parce que c'est le document qui explique ce qu'on écarte et pourquoi.


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
    assert "Welcome on board Boss" in page
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
    assert 'src="/panneaux"' in page, "la dalle doit charger les panneaux"
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
    page = client.get("/").text
    assert "embarquement.mp4" in page and "embarquement.webm" in page
    for nom in ("embarquement.mp4", "embarquement.webm", "poste.jpg"):
        chemin = recherche.RACINE / "src/trading_desk/ui/poste/assets" / nom
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


def test_le_poste_ne_passe_aucun_ordre(client):
    """La règle du dépôt vaut aussi sous le décor."""
    page = client.get("/").text
    assert "/api/order" not in page and "/api/trade" not in page
