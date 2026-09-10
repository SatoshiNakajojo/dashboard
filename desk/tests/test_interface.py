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

def test_la_racine_sert_le_cockpit_et_garde_tous_les_secteurs(client):
    """Le cockpit habille l'app ; il ne la remplace pas.

    La page porte les MÊMES identifiants que `/panneaux` — mêmes secteurs,
    même coupe-circuit — parce que `desk.js` les alimente sans savoir dans
    quel habillage il tourne. Deux implémentations du même écran finiraient
    par diverger, et c'est celle qu'on regarde le moins qui mentirait.
    """
    page = client.get("/").text
    assert 'id="cockpit"' in page
    for secteur in ("prevol", "telemetrie", "navigation", "soufflerie",
                    "consommation", "vols", "systemes"):
        assert f'id="sec-{secteur}"' in page, f"secteur {secteur} perdu"
    assert 'id="kill"' in page, "le coupe-circuit doit rester dans la page"
    assert "/ui/desk.js" in page and "/ui/cockpit/shell.js" in page


def test_la_page_classique_reste_servie(client):
    """`/panneaux` n'est pas un vestige : c'est la vue lisible sur un écran
    qui n'a pas le ratio de la photo."""
    page = client.get("/panneaux").text
    assert 'id="sec-prevol"' in page and 'id="cockpit"' not in page


def test_le_cockpit_ne_passe_toujours_aucun_ordre(client):
    """La règle du dépôt vaut aussi sous la photo.

    Le brief du cockpit voulait les gâchettes des joysticks sur « acheter »
    et « vendre ». Cette interface ne le peut pas : deux gâchettes sous les
    pouces sont le pire endroit possible pour un ordre cliqué par erreur.
    """
    page = client.get("/").text
    assert "/api/order" not in page and "/api/trade" not in page


def test_la_carte_des_coordonnees_est_unique_et_en_pourcentages():
    """Un seul fichier porte la géométrie, et jamais en pixels.

    Le plateau se met à l'échelle du viewport en letterbox : des pixels
    bruts dérailleraient à la première résolution différente, et des
    coordonnées recopiées dans plusieurs composants dérailleraient à la
    première recalibration.
    """
    carte = json.loads(
        (recherche.RACINE / "src/trading_desk/ui/cockpit/hotspots.json")
        .read_text(encoding="utf-8"))
    # La photo a change de format le 10 septembre : 16:10 puis 16:9. La boîte
    # de référence la suit, et le plateau prend son ratio depuis ce champ —
    # un ratio écrit en dur dans le CSS étirerait tout le cockpit en silence.
    assert carte["design"] == {"w": 1792, "h": 1008}
    assert carte["design"]["w"] / carte["design"]["h"] > 1.0

    # Cinq dalles, pas dix : les cinq autres recouvraient des INSTRUMENTS
    # peints — cadrans, bargraphes, logements — qu'on rallume désormais au
    # lieu de les cacher sous un rectangle noir.
    assert len(carte["screens"]) == 5

    plats = ("screens", "hotspots", "hotas", "chrome",
             "graves", "blocs", "instruments.temoins", "instruments.afficheurs",
             "instruments.bargraphes")
    for chemin in plats:
        groupe = carte
        for part in chemin.split("."):
            groupe = groupe[part]
        for nom, r in groupe.items():
            for axe in ("l", "t", "w", "h"):
                assert 0 <= r[axe] <= 100, f"{chemin}.{nom}.{axe} hors du plateau"
            assert r["l"] + r["w"] <= 100.5, f"{chemin}.{nom} déborde à droite"
            assert r["t"] + r["h"] <= 100.5, f"{chemin}.{nom} déborde en bas"

    # Les centres de cadran suivent la même règle : tout est en % du plateau.
    for nom, a in carte["instruments"]["aiguilles"].items():
        assert 0 <= a["cx"] <= 100 and 0 <= a["cy"] <= 100, f"aiguille {nom}"


def test_aucun_lorem_de_la_photo_ne_survit():
    """La photo est générée : son texte est halluciné de bout en bout.

    Le brief demandait de garder « les noms métier déjà dans le code
    (HOOL, Thana, PAL…) ». Vérification faite, aucun n'y est. Les recopier
    produirait une interface qui ment sur ce qu'elle affiche.
    """
    ui = recherche.RACINE / "src/trading_desk/ui"
    texte = "\n".join(
        f.read_text(encoding="utf-8", errors="ignore")
        for f in (*ui.glob("*.html"), *ui.glob("*.js"), *ui.glob("cockpit/*.js"),
                  *ui.glob("cockpit/*.json"))
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


def test_chaque_bouton_de_la_carte_porte_une_action():
    """Un bouton sans verbe est un bouton mort, et rien ne le dit.

    Le câblage vivait dans une liste de clés en dur dans `boutons.js`. La
    photo a changé, les clés avec, et le cockpit est passé de quarante-six
    boutons à UN — sans qu'aucun test ne le voie, puisqu'ils vérifiaient des
    rectangles, pas des branchements. Les actions vivent maintenant dans la
    carte ; ce test vérifie qu'elles y sont toutes et qu'aucune n'invente un
    verbe que le module ne sait pas traduire.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    module = (racine / "boutons.js").read_text(encoding="utf-8")

    verbes = set(re.findall(r'case "([a-z-]+)":', module))
    assert "secteur" in verbes, "le module ne sait plus ouvrir un secteur"

    secteurs = {"prevol", "telemetrie", "navigation", "soufflerie",
                "consommation", "vols", "systemes"}
    blocs = set(carte["blocs"])

    muets = []
    for groupe in ("hotspots", "hotas"):
        for nom, r in carte[groupe].items():
            verbe = r.get("action") or (
                "secteur:" + r["secteur"] if r.get("secteur") else None)
            if verbe is None:
                muets.append(f"{groupe}.{nom}")
                continue
            tete, _, arg = verbe.partition(":")
            assert tete in verbes, f"{groupe}.{nom} : verbe inconnu « {tete} »"
            if tete == "secteur":
                assert arg in secteurs, f"{groupe}.{nom} : secteur « {arg} » inexistant"
            if tete == "loupe":
                assert arg in blocs, f"{groupe}.{nom} : bloc « {arg} » inexistant"
    assert not muets, f"boutons sans action : {muets}"


def test_les_secteurs_s_affichent_dans_la_dalle_centrale(client):
    """Cliquer un bouton du poste ne doit pas quitter le poste.

    Les panneaux vivaient dans un tiroir plein écran : on se retrouvait
    devant une page web, pas devant un appareil. Ils sont désormais montés
    DANS l'écran du milieu — les mêmes nœuds, pas une copie — et la loupe
    s'en approche.
    """
    page = client.get("/").text
    assert 'id="panneaux"' in page
    ecrans = (recherche.RACINE
              / "src/trading_desk/ui/cockpit/ecrans.js").read_text(encoding="utf-8")
    assert 'getElementById("screen-main")' in ecrans
    assert 'getElementById("panneaux")' in ecrans
    # et surtout : une seule implémentation de chaque secteur
    for secteur in ("prevol", "telemetrie", "navigation", "soufflerie",
                    "consommation", "vols", "systemes"):
        assert page.count(f'id="sec-{secteur}"') == 1, f"{secteur} dupliqué"


def test_chaque_secteur_a_une_station_qui_existe():
    """Cliquer un bouton ne saute plus au PFD : on va d'abord à l'instrument.

    Chaque secteur nomme un bloc du poste et la dalle qui y sert d'index. Si
    l'un des deux n'existe pas, le clic retombe silencieusement sur
    l'ouverture directe — le bouton marche, mais le détour qu'on voulait
    disparaît sans bruit. C'est exactement le genre de panne qu'on ne voit
    pas : le test la voit.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    page = (recherche.RACINE / "src/trading_desk/ui/cockpit.html").read_text(
        encoding="utf-8")

    secteurs = {"prevol", "telemetrie", "navigation", "soufflerie",
                "consommation", "vols", "systemes"}
    assert set(carte["stations"]) == secteurs, "un secteur sans station"
    for nom, st in carte["stations"].items():
        assert st["bloc"] in carte["blocs"], f"{nom} : bloc inconnu"
        assert st["ecran"] in carte["screens"], f"{nom} : dalle inconnue"

    # Le module doit être chargé, et avant celui qui l'appelle.
    assert page.index("cockpit/stations.js") < page.index("cockpit/boutons.js")


def test_la_page_hors_ligne_est_un_document_complet():
    """La copie publiée est servie telle quelle : il lui faut son enveloppe.

    Un artefact fournit la sienne ; GitHub Pages non. Le fichier a été
    produit sans `<!doctype>` la première fois, et le navigateur l'a rendu en
    mode « quirks » — la mise en page du poste s'effondrait.
    """
    page = recherche.RACINE.parent / "cockpit/index.html"
    if not page.exists():
        pytest.skip("copie hors ligne non générée sur cette machine")
    texte = page.read_text(encoding="utf-8")
    assert texte.lstrip().lower().startswith("<!doctype html>")
    assert "</html>" in texte
    # Elle ne doit pas prétendre pouvoir agir sur le desk.
    assert "aucun desk" in texte
    assert "/api/order" not in texte


def test_chaque_etiquette_declare_le_plan_de_son_instrument():
    """Une étiquette posée d'aplomb sur une console qui fuit se lit comme un
    autocollant.

    Chaque pente est le biais du texte PEINT du décor, relevé par profil de
    projection : on fait tourner la vignette et on retient l'angle où l'encre
    se range le mieux en lignes. Les arêtes du dessin au trait, relevées
    séparément par Theil-Sen, confirment chaque valeur à moins d'un demi
    degré. Deux méthodes indépendantes, aucune valeur devinée — c'est la
    seule raison pour laquelle des pentes de huit degrés sont écrites ici
    alors que les précédentes, devinées, tenaient dans deux.
    """
    carte = json.loads(
        (recherche.RACINE / "src/trading_desk/ui/cockpit/hotspots.json")
        .read_text(encoding="utf-8"))
    plans = carte["plans"]
    for nom, p in plans.items():
        # Un plan est décrit soit par ses quatre coins relevés — c'est le cas
        # général, parce que les montants d'un panneau penchent en sens
        # contraire et qu'aucune rotation ne rend ça — soit, pour les
        # panneaux vraiment d'aplomb, par une simple pente.
        if "quad" in p:
            assert len(p["quad"]) == 4, f"plan {nom} : il faut quatre coins"
            for x, y in p["quad"]:
                assert 0 <= x <= 100 and 0 <= y <= 100, f"plan {nom} : coin hors plateau"
            xs = [c[0] for c in p["quad"]]
            ys = [c[1] for c in p["quad"]]
            assert max(xs) - min(xs) > 3 and max(ys) - min(ys) > 2, \
                f"plan {nom} : quadrilatère dégénéré"
        else:
            assert abs(p["pente"]) <= 12, f"plan {nom} : pente invraisemblable"

    # Le cockpit est symétrique : deux panneaux qui se font face penchent du
    # même angle en sens CONTRAIRE. C'est le seul garde-fou qui attrape une
    # faute de signe, et c'est exactement la faute qui s'était produite —
    # « campagnes » était à -2 degrés quand la photo en demandait +7,7, donc
    # penché à l'envers. Aucun test de rectangle ne pouvait le voir : la
    # boîte est au bon endroit, c'est son contenu qui bascule du mauvais côté.
    for gauche, droite in (("secteurs", "campagnes"), ("expo", "flux"),
                           ("barre-g", "barre-d")):
        pg, pd = plans[gauche]["pente"], plans[droite]["pente"]
        assert abs(pg + pd) <= 1.0, (
            f"{gauche} ({pg}) et {droite} ({pd}) se font face : leurs pentes "
            "doivent être opposées, or leur somme ne s'annule pas")

    porteurs = list(carte["graves"].items()) + list(carte["chrome"].items()) \
        + list(carte["instruments"]["afficheurs"].items())
    for nom, r in porteurs:
        if "plan" in r:
            assert r["plan"] in plans, f"{nom} : plan « {r['plan']} » inconnu"
        # une pente écrite en dur à côté du système de plans dériverait
        assert "pente" not in r, f"{nom} : pente en dur, elle doit venir du plan"


def test_les_variantes_declarees_sont_celles_qui_existent():
    """La carte annonce, pour chaque commande, les fichiers réellement livrés.

    Sans cette déclaration, le cockpit demandait les trois variantes de
    chaque pièce et rattrapait les 404 : quatre requêtes perdues à chaque
    chargement, et quatre erreurs serveur sur la page publiée pour des
    fichiers dont on savait depuis toujours qu'ils n'existaient pas. La
    liste doit donc coller au répertoire — un fichier ajouté sans être
    déclaré resterait invisible, un fichier déclaré sans être livré
    ramènerait le 404 qu'on vient d'enlever.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    sur_disque: dict[str, set[str]] = {}
    for f in sorted((racine / "assets/commandes").glob("*.png")):
        tige, _, etat = f.stem.rpartition("-")
        if etat in ("on", "off", "alerte") and tige:
            sur_disque.setdefault(tige, set()).add(etat)
    declare = {k: set(v) for k, v in carte["commandes"].items()}
    assert declare == sur_disque, (
        "hotspots.json et assets/commandes/ ont divergé : "
        f"déclaré sans fichier {sorted(set(declare) - set(sur_disque))}, "
        f"livré sans déclaration {sorted(set(sur_disque) - set(declare))}")
    for tige, etats in declare.items():
        assert "on" in etats, f"{tige} : sans image allumée, la pièce n'a pas d'état"


def test_l_habillage_photo_vient_apres_le_dessin_de_la_piece():
    """`innerHTML` remplace tous les enfants : habiller avant, c'est effacer.

    Les interrupteurs photographiés n'étaient jamais apparus dans le cockpit
    et rien ne le signalait. `habiller()` posait bien les deux images, puis
    la ligne suivante écrivait le levier vectoriel dans `innerHTML` et les
    supprimait. La pièce gardait quand même la classe « photo » — un
    `load` se déclenche sur une image même détachée du document — donc la
    feuille de style masquait aussi le levier : il ne restait rien à voir.

    Le test porte sur l'ORDRE parce que c'est exactement ce qui était faux.
    Vérifier que les deux appels existent, comme le faisait le test voisin,
    ne pouvait pas l'attraper : les deux existaient.
    """
    module = (recherche.RACINE / "src/trading_desk/ui/cockpit/boutons.js") \
        .read_text(encoding="utf-8")
    dessin = module.find("b.innerHTML =")
    habillage = module.find("habiller(b, r.image")
    assert dessin != -1 and habillage != -1, "la pièce ne se construit plus ainsi"
    assert habillage > dessin, (
        "habiller() est appelé avant l'écriture de innerHTML : les images "
        "seront effacées et aucun interrupteur photographié n'apparaîtra")


def test_toute_piece_rapportee_efface_ce_qu_elle_recouvre_et_prend_son_plan():
    """Une pièce posée sur la photo doit effacer l'original et suivre le plan.

    Sans les deux, elle se lit « vignette collée » : la molette peinte
    dépasse tout autour, et la pièce reste d'aplomb sur une console qui
    fuit. C'est exactement ce qu'on voyait — les deux interrupteurs de la
    plaque « Secteurs » flottaient sur les molettes OLA et OOS, à zéro
    degré sur une plaque qui monte de huit.

    `etendue` dit quelle empreinte reconstituer. Un facteur > 1 pour une
    pièce qui recouvre plus large qu'elle ; < 1 pour une pièce qu'on glisse
    DANS un cerclage peint qu'on veut garder — les icônes du bandeau de
    droite se touchent, élargir mangerait la voisine.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    plans = carte["plans"]

    rapportees = list(carte["voyants"].items()) + [
        (k, v) for k, v in carte["hotas"].items() if "image" in v]
    assert rapportees, "plus aucune pièce photographiée : le test ne garde rien"

    for nom, r in rapportees:
        assert "plan" in r, f"{nom} : aucun plan, la pièce restera d'aplomb"
        assert r["plan"] in plans, f"{nom} : plan « {r['plan']} » inconnu"
        e = r.get("etendue")
        assert e is not None, f"{nom} : rien à effacer déclaré sous la pièce"
        if isinstance(e, dict):
            assert {"l", "t", "w", "h"} <= set(e), f"{nom} : empreinte incomplète"
        else:
            # Au-delà, le cache atteint le texte peint ou l'arête de la
            # plaque, et la couronne lue n'est plus du panneau nu : le plan
            # ajusté part alors de travers.
            assert 0.6 <= e <= 1.9, f"{nom} : empreinte invraisemblable ({e})"


def test_le_cache_reconstitue_le_panneau_au_lieu_de_le_repeindre():
    """Le cache s'ajuste au panneau ; il ne pose pas une couleur choisie.

    La première version interpolait bord à bord : tout ce qui touchait la
    couronne — une lettre peinte, l'arête de la plaque — était étiré en
    traînée à travers tout le cache. Un plan ne peut pas porter de détail,
    c'est précisément pourquoi on en ajuste un.
    """
    shell = (recherche.RACINE / "src/trading_desk/ui/cockpit/shell.js") \
        .read_text(encoding="utf-8")
    assert "function cacher(" in shell, "plus de cache du tout"
    assert "equations normales" in shell or "moindres carres" in shell, \
        "le cache ne s'ajuste plus au panneau"
    # L'écrêtage : une seule vis sur la couronne fait basculer le plan.
    assert "0.75" in shell, "l'ajustement n'est plus écrêté"


def test_une_commande_photographiee_retombe_sur_son_dessin():
    """Une image absente ne doit jamais faire un trou dans le tableau de bord.

    Les interrupteurs peuvent être des photos plutôt que des dessins. Tant
    que la paire de PNG n'est pas déposée, la pièce garde son levier
    vectoriel — sinon le cockpit se viderait au premier fichier oublié.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    module = (racine / "boutons.js").read_text(encoding="utf-8")
    assert 'addEventListener("error"' in module, "aucun repli si l'image manque"
    assert 'classList.remove("photo")' in module

    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    dossier = racine / "assets/commandes"
    assert (dossier / "LISEZ-MOI.md").exists(), "le contrat des images manque"
    for nom, r in carte["hotas"].items():
        if "image" not in r:
            continue
        # Si les fichiers SONT là, ils vont par paire : un seul des deux états
        # donnerait une commande qui change d'aspect en changeant de taille.
        on = dossier / f"{r['image']}-on.png"
        off = dossier / f"{r['image']}-off.png"
        assert on.exists() == off.exists(), \
            f"{nom} : « {r['image']} » n'a qu'un seul de ses deux états"


def test_chaque_voyant_photographie_a_son_image_et_son_etat():
    """Un voyant qui ne suit rien est pire qu'un voyant absent.

    On apprend à ne plus le regarder, et le jour où il dit quelque chose,
    personne ne le voit. Chacun doit donc nommer un état que le module sait
    lire, et son image allumée doit exister — l'état éteint, lui, peut être
    dérivé de l'allumé par filtre, ce qui garantit le même cadrage.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    module = (racine / "voyants.js").read_text(encoding="utf-8")
    etats = set(re.findall(r'^\s+"?([a-z-]+)"?:\s', module, re.M))
    dossier = racine / "assets/commandes"

    assert carte["voyants"], "aucun voyant photographié"
    for nom, r in carte["voyants"].items():
        assert r["etat"] in etats, f"{nom} : état « {r['etat']} » que le module ne lit pas"
        assert (dossier / f"{r['image']}-on.png").exists(), \
            f"{nom} : image allumée « {r['image']}-on.png » absente"
        # une action, sinon le voyant est un décor cliquable qui ne fait rien
        assert r.get("action"), f"{nom} : aucune action"


def test_les_dalles_sont_plaquees_sur_le_quadrilatere_peint():
    """Les montants d'un logement penchent en sens contraire : ils fuient.

    C'est de la perspective, pas du cisaillement, et aucune combinaison
    rotation/cisaillement ne la rend — un rectangle d'aplomb dans un logement
    qui converge se voit du premier coup d'œil. Chaque dalle porte donc les
    quatre coins relevés, et le shell en tire une homographie.
    """
    racine = recherche.RACINE / "src/trading_desk/ui/cockpit"
    carte = json.loads((racine / "hotspots.json").read_text(encoding="utf-8"))
    shell = (racine / "shell.js").read_text(encoding="utf-8")
    assert "matrix3d" in shell and "homographie" in shell

    for nom, r in carte["screens"].items():
        q = r.get("quad")
        assert q and len(q) == 4, f"{nom} : pas de quadrilatère relevé"
        for x, y in q:
            assert 0 <= x <= 100 and 0 <= y <= 100, f"{nom} : coin hors du plateau"
        # les coins tournent dans le sens horaire : haut-gauche d'abord
        assert q[0][0] < q[1][0] and q[0][1] < q[2][1], f"{nom} : coins désordonnés"
