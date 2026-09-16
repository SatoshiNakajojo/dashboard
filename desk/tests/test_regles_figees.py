"""Les règles de prix figées : la déclaration, le journal, le pilote.

Ce fichier verrouille ce qui, en cassant, ferait accumuler au journal des
prédictions sur une règle DIFFÉRENTE de celle qui a été mesurée — le seul
mode de panne qui rende un test hors échantillon inutile, et le seul qui ne
se voie pas dans les résultats.

Deux mécanismes ont réellement cassé pendant la construction :

- le journal re-simulait l'état de position de son côté et dérivait : dix
  ouvertures manquées sur cinquante-six pour `turtle_breakout`, parce qu'il
  ignorait les sorties au STOP et se croyait encore en position ;
- `tsmom`, la règle la plus puissante des trois candidates, se faisait
  refuser SEPT entrées sur DIX par le moteur de risque du déploiement. La
  règle qui aurait tourné n'était pas celle qui avait été mesurée.
"""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pytest

from trading_desk.backtest.data import load_from_file
from trading_desk.backtest.engine import run_backtest
from trading_desk.backtest.strategies import BASELINES
from trading_desk.contracts.common import Side
from trading_desk.execution.faisceau import Faisceau
from trading_desk.execution.pupitre import Intention
from trading_desk.risk.limits import RiskLimits
from trading_desk.sentinelle.pilote_regles import PiloteRegles
from trading_desk.sentinelle.regles_figees import (
    DENOMINATEUR,
    REFUS_MAXIMUM,
    REGLES,
    VERSION,
    empreinte_du_registre,
    par_cle,
)

RACINE = Path(__file__).resolve().parents[1]


# ─────────────────────────────────────────────── la déclaration est figée

def test_l_empreinte_du_registre_est_verrouillee():
    """LE test de ce fichier.

    Les paramètres sont gelés. Les modifier invaliderait tout ce que le
    journal a accumulé, parce que les anciennes prédictions auraient été
    prises sous une autre règle. « Ajuster légèrement un seuil » suffirait
    sinon à transformer rétroactivement un échec en succès.

    Si ce test tombe, ce n'est pas lui qu'il faut corriger : c'est `VERSION`
    qu'il faut incrémenter, ce qui repart d'un dénominateur neuf et d'un
    journal qui distingue les deux régimes.
    """
    assert empreinte_du_registre() == "abb330456aee7451", (
        "le registre a changé — incrémenter VERSION, pas ce test")
    assert VERSION == 1


def test_le_denominateur_est_le_nombre_de_regles():
    """Il est déclaré AVANT que la donnée existe, et c'est tout son intérêt :
    le seuil de Benjamini-Hochberg au rang 1 vaut 0,05 / DENOMINATEUR, et
    personne ne pourra le rétrécir après avoir vu laquelle gagne."""
    assert DENOMINATEUR == len(REGLES) == 2


def test_chaque_regle_declare_son_mecanisme_et_sa_puissance():
    """Une règle sans mécanisme est un motif trouvé par balayage. Une règle
    sans sa puissance mesurée laisse espérer une conclusion qui ne viendra
    pas — `turtle` demande plus de trois ans pour 8 % de chances."""
    for r in REGLES:
        assert len(r.mecanisme) > 80, f"{r.cle} n'explique pas son mécanisme"
        assert len(r.puissance) > 40, f"{r.cle} n'annonce pas sa puissance"
        assert r.strategie in BASELINES


def test_aucune_regle_figee_ne_depasse_le_refus_maximum():
    """Au-delà de ce taux, la règle qui tourne n'est plus celle qui a été
    mesurée, et le journal accumule des prédictions sur autre chose.

    C'est ce qui a écarté `tsmom_btc_1d` : 70 % de refus, parce qu'il propose
    un stop médian de 1 175 bps quand la bande s'arrête à 1 600 et que son
    neuvième décile la dépasse.
    """
    assert REFUS_MAXIMUM <= 0.25
    for r in REGLES:
        assert r.refus_mesure <= REFUS_MAXIMUM, (
            f"{r.cle} serait refusée {r.refus_mesure:.0%} du temps")


@pytest.mark.parametrize("cle", [r.cle for r in REGLES])
def test_le_taux_de_refus_declare_est_le_taux_reel(cle):
    """Le chiffre inscrit au registre doit être celui que le moteur de risque
    produit vraiment. Un taux recopié qui dérive rendrait le garde-fou
    précédent décoratif."""
    r = par_cle(cle)
    bars = load_from_file(f"data/{r.actif}_{r.intervalle}_real.json",
                          r.actif, r.intervalle)
    o = run_backtest(bars, BASELINES[r.strategie](**r.parametres),
                     limits=RiskLimits(), interval=r.intervalle,
                     initial_equity_usd=Decimal("1000"))
    total = len(o.trades) + o.rejected_by_risk
    reel = o.rejected_by_risk / total if total else 0.0
    assert abs(reel - r.refus_mesure) < 0.03, (
        f"{cle} déclare {r.refus_mesure:.0%} de refus, mesuré {reel:.0%}")


# ──────────────────────────── le journal décide ce que le moteur décide

@pytest.mark.parametrize("cle", [r.cle for r in REGLES])
def test_le_journal_decide_exactement_ce_que_le_moteur_decide(cle):
    """LA propriété qui rend le test hors échantillon valide.

    Une première version re-simulait l'état de position et ratait dix
    ouvertures sur cinquante-six : elle ignorait les sorties au stop et se
    croyait encore en position. Le journal aurait alors mesuré une autre
    règle que celle validée, et rien ne l'aurait signalé.

    La garantie est désormais structurelle — le journal appelle le moteur.
    """
    from journal_regles import decision

    r = par_cle(cle)
    bars = load_from_file(f"data/{r.actif}_{r.intervalle}_real.json",
                          r.actif, r.intervalle)
    o = run_backtest(bars, BASELINES[r.strategie](**r.parametres),
                     limits=RiskLimits(), interval=r.intervalle,
                     initial_equity_usd=Decimal("1000"))
    idx = {b.ts_ms: i for i, b in enumerate(bars)}
    ouvertures = {idx[t.entry_ts_ms] - 1 for t in o.trades
                  if idx.get(t.entry_ts_ms, 0) > 400}
    # On échantillonne : rejouer le moteur à chaque barre coûte des minutes.
    for i in sorted(ouvertures)[:12]:
        assert decision(r, bars[:i + 1]) is not None, (
            f"le moteur a ouvert après la barre {i}, le journal n'a rien dit")


def test_le_moteur_expose_sa_decision_en_attente():
    """Sans ce champ, un journal doit re-simuler — et il dérive."""
    bars = load_from_file("data/BTC_1d_real.json", "BTC", "1d")
    o = run_backtest(bars, BASELINES["turtle_breakout"](entry_period=20,
                                                        exit_period=10),
                     limits=RiskLimits(), interval="1d",
                     initial_equity_usd=Decimal("1000"))
    assert hasattr(o, "decision_suivante")
    assert hasattr(o, "position_finale")


def test_l_inscription_ne_duplique_pas():
    """Relancer deux fois le même jour ne doit rien ajouter, et surtout rien
    effacer : le journal est en ajout seul."""
    import tempfile

    from journal_regles import inscrire, lire
    with tempfile.TemporaryDirectory() as d:
        j = Path(d) / "j.jsonl"
        ligne = {"version": 1, "regle": "turtle_btc_1d", "barre_ms": 1000,
                 "entree_ms": 87_400_000, "actif": "BTC", "sens": "LONG"}
        assert inscrire([ligne], j) == 1
        assert inscrire([ligne], j) == 0
        assert len(lire(j)) == 1


# ─────────────────────────────────────────────────────────── le pilote

def _journal(tmp_path: Path, **extra) -> Path:
    j = tmp_path / "j.jsonl"
    ligne = {"inscrit_ms": 0, "version": 1, "regle": "turtle_btc_1d",
             "strategie": "turtle_breakout", "actif": "BTC", "intervalle": "1d",
             "parametres": {"entry_period": 20}, "stop_pct": 0.15,
             "barre_ms": 0, "entree_ms": 86_400_000, "sens": "LONG",
             "stop_strategie": None, "note": "t", **extra}
    j.write_text(json.dumps(ligne) + "\n", encoding="utf-8")
    return j


def test_le_pilote_n_entre_que_dans_sa_fenetre(tmp_path):
    """Une décision prise à la clôture de N vaut pour l'ouverture de N+1.
    La reprendre trois barres plus tard, c'est trader autre chose."""
    p = PiloteRegles(_journal(tmp_path), prix={"BTC": Decimal("100")})
    assert p.entrees(86_400_000 - 1) == [], "trop tôt"
    assert len(p.entrees(86_400_000)) == 1, "la fenêtre est ouverte"
    assert p.entrees(86_400_000 * 2 + 1) == [], "l'occasion est passée"


def test_le_pilote_dit_quand_il_manque_un_prix(tmp_path):
    """Sauter en silence est ce qui rendait ce cas indétectable : douze
    invariants au vert, zéro position, zéro refus."""
    p = PiloteRegles(_journal(tmp_path), prix={})
    assert p.entrees(86_400_000) == []
    assert p.sans_prix == {"BTC"}


def test_le_pilote_ne_raye_qu_apres_confirmation(tmp_path):
    """Rayer à la lecture perdrait le signal chaque fois que le desk refuse
    d'agir — amorçage, flux figé, plafond atteint."""
    p = PiloteRegles(_journal(tmp_path), prix={"BTC": Decimal("100")})
    assert len(p.entrees(86_400_000)) == 1
    assert len(p.entrees(86_400_000)) == 1, "non confirmée : toujours proposée"
    p.confirmer(p.entrees(86_400_000)[0])
    assert p.entrees(86_400_000) == []


def test_le_stop_de_repli_sert_quand_celui_de_la_strategie_est_du_mauvais_cote(
        tmp_path):
    """Le stop a été calculé sur la clôture de la barre de décision ; on entre
    à l'ouverture suivante. Un écart de prix peut le placer du mauvais côté,
    où il ne protège plus rien."""
    p = PiloteRegles(_journal(tmp_path, stop_strategie="150"),
                     prix={"BTC": Decimal("100")})
    i = p.entrees(86_400_000)[0]
    assert i.stop_price == Decimal("85.00"), "repli à 15 % sous l'entrée"

    p2 = PiloteRegles(_journal(tmp_path, stop_strategie="92"),
                      prix={"BTC": Decimal("100")})
    assert p2.entrees(86_400_000)[0].stop_price == Decimal("92")


def test_le_pilote_ne_propose_aucune_sortie_qu_il_n_a_pas_inscrite():
    """Mentir ici ferait diverger le live du backtesté dans l'autre sens."""
    assert PiloteRegles("data/absent.jsonl").sorties(0, ("BTC",)) == []


# ─────────────────────────────────────────────────────────── le faisceau

class _Source:
    def __init__(self, nom, intentions):
        self.nom = nom
        self._i = intentions
        self.confirmees = []
        self.absent = False
        self.sans_prix = set()

    def entrees(self, at_ms):
        return list(self._i)

    def sorties(self, at_ms, ouvertes):
        return ["ETH"] if self.nom == "b" else []

    def confirmer(self, intention):
        self.confirmees.append(intention)


def _intention(actif):
    return Intention(asset=actif, side=Side.LONG,
                     entry_price=Decimal("100"), stop_price=Decimal("90"),
                     motif="t")


def test_le_faisceau_route_la_confirmation_vers_la_BONNE_source():
    """La subtilité du fichier. Confirmer toutes les sources rayerait chez
    l'une une occasion émise par l'autre — et le signal serait perdu sans
    que rien ne le signale."""
    a = _Source("a", [_intention("BTC")])
    b = _Source("b", [_intention("SOL")])
    f = Faisceau(a, b)
    toutes = f.entrees(0)
    assert [i.asset for i in toutes] == ["BTC", "SOL"], "l'ordre est stable"
    f.confirmer(toutes[1])
    assert a.confirmees == [] and len(b.confirmees) == 1


def test_le_faisceau_fait_l_UNION_des_sorties():
    """Asymétrique avec les entrées, et délibérément : une sortie réduit le
    risque, la refuser garderait une position que sa propre règle veut
    fermer.

    Chaque sortie porte désormais la source qui la demande. Une chaîne nue
    voulait dire « ferme toute la position », ce qui fermait la part des
    autres sources — voir `tests/test_couverture.py`.
    """
    f = Faisceau(_Source("a", []), _Source("b", []))
    sorties = f.sorties(0, ("ETH",))
    assert [(x.asset, x.source) for x in sorties] == [("ETH", "b")]


def test_le_faisceau_n_est_absent_que_si_TOUTES_ses_sources_le_sont():
    a, b = _Source("a", []), _Source("b", [])
    f = Faisceau(a, b)
    assert f.absent is False
    a.absent = b.absent = True
    assert f.absent is True


def test_un_faisceau_sans_source_est_refuse():
    with pytest.raises(ValueError, match="sans source"):
        Faisceau()


# ────────────────────────────────────────────── la cadence du déploiement

def test_le_timer_inscrit_juste_apres_la_cloture_journaliere():
    """La cadence est celle de la règle, pas une préférence.

    Une règle journalière décide à la clôture de N pour l'ouverture de N+1.
    Inscrire plus tard dans la journée raterait l'ouverture, et le desk
    exécuterait au milieu de la barre — ce qui n'est plus la règle mesurée.
    """
    timer = (RACINE / "deploy" / "regles-figees.timer").read_text(encoding="utf-8")
    assert "OnCalendar=*-*-* 00:10:00 UTC" in timer
    assert "Persistent=true" in timer, "une journée manquée doit se rattraper"
    service = (RACINE / "deploy" / "regles-figees.service").read_text(encoding="utf-8")
    assert "Type=oneshot" in service
    assert "\nRestart=" not in service, "un oneshot en échec doit le rester"


def test_toutes_les_regles_figees_sont_journalieres():
    """Le timer tourne à 00:10 UTC. Une règle en 4 h n'y serait inscrite
    qu'une fois par jour sur six barres — cinq décisions perdues en silence."""
    for r in REGLES:
        assert r.intervalle == "1d", (
            f"{r.cle} est en {r.intervalle} : la cadence du timer ne lui "
            "convient pas")


# ─────────────────────────────────────────────────────── ce que l'écran dit

def test_le_panneau_affiche_le_denominateur_declare():
    """Il est déclaré AVANT que la donnée existe, et c'est tout son intérêt.
    Un écran qui ne le montrerait pas laisserait croire qu'on peut le
    rétrécir après avoir vu laquelle des règles gagne."""
    from trading_desk.api import recherche

    r = recherche.regles_figees()
    assert r["denominateur"] == DENOMINATEUR
    assert r["seuil_bh_rang1"] == pytest.approx(0.05 / DENOMINATEUR)
    assert r["empreinte"] == empreinte_du_registre()


def test_le_panneau_montre_la_puissance_a_cote_des_signaux():
    """« 4 signaux » sans son contexte laisserait espérer un verdict qui ne
    viendra pas avant des années."""
    from trading_desk.api import recherche

    for r in recherche.regles_figees()["regles"]:
        assert r["puissance"], f"{r['cle']} n'annonce pas ce qu'elle peut prouver"
        assert "refus_mesure" in r

    js = (RACINE / "src" / "trading_desk" / "ui" / "desk.js").read_text(encoding="utf-8")
    assert "rendreReglesFigees" in js
    assert "Ce qu'elle peut prouver" in js


def test_un_journal_absent_dit_quoi_faire(tmp_path):
    """Un artefact absent est une information, pas une panne."""
    from trading_desk.api import recherche

    r = recherche.regles_figees(tmp_path / "rien.jsonl")
    assert r["disponible"] is False
    assert "journal_regles.py" in r["commande"]
    assert r["regles"], "les règles restent visibles sans journal"
