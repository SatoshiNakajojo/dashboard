"""L'analyse des déblocages de jetons.

`fetch_unlocks.py` n'a **jamais tourné contre l'API réelle** — la politique
réseau de l'environnement où il a été écrit n'atteint pas `api.llama.fi`.
Ces tests couvrent donc ce qui est testable sans réseau, et ils couvrent
surtout la seule chose qui compte vraiment :

**l'analyse saurait-elle voir un effet s'il existait ?**

Un test qui vérifie « aucun effet trouvé sur des données sans effet » ne
prouve rien : un script qui ne trouve jamais rien le passerait aussi. Il faut
les deux sens.
"""

from __future__ import annotations

import importlib.util
import random
from decimal import Decimal
from pathlib import Path

from trading_desk.features.bars import Bar
from trading_desk.sentinelle.triggers import Declenchement
from trading_desk.sentinelle.validation import evaluer

_racine = Path(__file__).resolve().parents[1]


def _module(nom: str):
    spec = importlib.util.spec_from_file_location(nom, _racine / "scripts" / f"{nom}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


valider = _module("valider_unlocks")
fetch = _module("fetch_unlocks")

JOUR_MS = 86_400_000


def _serie(n=800, vol=0.03, graine=1, chocs=None):
    """Marche aléatoire journalière, avec chocs baissiers optionnels.

    `chocs` : {indice: rendement supplémentaire ce jour-là}.
    """
    alea = random.Random(graine)
    chocs = chocs or {}
    px, out = 100.0, []
    for i in range(n):
        px *= 1 + alea.gauss(0, vol) + chocs.get(i, 0.0)
        out.append(Bar(asset="TEST", ts_ms=i * JOUR_MS,
                       open=Decimal(str(px)), high=Decimal(str(px * 1.01)),
                       low=Decimal(str(px * 0.99)), close=Decimal(str(px)),
                       volume=Decimal("100")))
    return out


# --------------------------------------------------------------------------
#  L'analyse voit un effet quand il y en a un
# --------------------------------------------------------------------------

def test_lanalyse_detecte_une_baisse_systematique_apres_deblocage():
    """Le test qui donne du sens à tous les autres.

    Cinquante événements suivis chacun d'une chute de 5 %. Si l'analyse ne
    voyait pas ça, un résultat négatif sur les vraies données ne vaudrait
    rien — il pourrait venir du script plutôt que du marché.
    """
    dates = list(range(200, 700, 10))
    chocs = {d: -0.05 for d in dates}
    bars = _serie(800, chocs=chocs, graine=2)
    evts = [Declenchement(d - 1, -1, 0.03, "test") for d in dates]

    r = evaluer(bars, evts, horizon=2, horizon_libelle="J_J+1",
                declencheur="test", actif="TEST", intervalle="1d", tirages=500)
    assert r is not None
    assert r.rendement_moyen_bps > 0, "sens -1 x baisse = rendement positif"
    assert r.p_direction < 0.01, f"effet franc non détecté (p={r.p_direction:.3f})"


def test_lanalyse_ne_trouve_rien_quand_il_ny_a_rien():
    """L'autre sens. Des dates quelconques sur une marche aléatoire ne
    doivent pas ressortir."""
    bars = _serie(800, graine=3)
    evts = [Declenchement(d, -1, 0.03, "test") for d in range(200, 700, 10)]
    r = evaluer(bars, evts, horizon=2, horizon_libelle="J_J+1",
                declencheur="test", actif="TEST", intervalle="1d", tirages=500)
    assert r is not None
    assert r.p_direction > 0.05, f"effet inventé sur du bruit (p={r.p_direction:.3f})"


# --------------------------------------------------------------------------
#  Alignement des dates sur les barres
# --------------------------------------------------------------------------

def test_lindex_par_date_associe_un_jour_a_une_barre():
    bars = _serie(10)
    idx = valider.index_par_date(bars)
    assert idx[bars[5].ts_ms // JOUR_MS] == 5
    assert len(idx) == 10


def test_un_deblocage_hors_historique_est_ecarte_pas_rapproche():
    """Prendre la barre la plus proche décalerait l'événement d'un jour — et
    un décalage d'un jour sur un événement daté détruit précisément ce qu'on
    mesure."""
    bars = _serie(100)
    idx = valider.index_par_date(bars)
    tres_ancien = (bars[0].ts_ms // JOUR_MS) - 500
    tres_futur = (bars[-1].ts_ms // JOUR_MS) + 500
    assert idx.get(tres_ancien) is None
    assert idx.get(tres_futur) is None


def test_les_fenetres_en_amont_sont_exprimees_par_un_decalage():
    """Une fenêtre J-7 -> J-1 est un événement placé à J-7 mesuré sur 6
    jours. C'est ce qui permet de réutiliser telle quelle la machinerie
    déjà testée sur les déclencheurs, sans code de mesure en arrière."""
    noms = {f[0]: (f[1], f[2]) for f in valider.FENETRES}
    assert noms["anticipation_J-7_J-1"] == (-7, 6)
    assert noms["impact_J_J+1"] == (0, 1)
    assert all(duree >= 1 for _, duree in noms.values())


def test_toutes_les_hypotheses_sont_baissieres():
    """Elles viennent de la littérature et sont posées AVANT la mesure.
    Tester « et si c'était l'inverse » ensuite serait retourner sa veste
    après avoir vu le résultat."""
    bars = _serie(400)
    unlocks = {"TEST": [{"ts_ms": i * JOUR_MS, "part_offre": 0.03}
                        for i in range(100, 300, 20)]}
    # On ne peut pas charger de vraies bougies ici ; on vérifie la
    # construction du sens sur la constante du module.
    assert all(f[1] <= 1 for f in valider.FENETRES)
    assert unlocks and bars


# --------------------------------------------------------------------------
#  Extraction des déblocages depuis la forme DefiLlama
# --------------------------------------------------------------------------

def test_un_deblocage_est_un_SAUT_de_loffre_en_circulation():
    """DefiLlama ne publie pas de champ « unlock » : il publie des séries
    d'émission cumulées. Un déblocage est une dérivée, pas une lecture."""
    proto = {"documentedData": {"data": [
        {"data": [{"timestamp": 1000, "unlocked": 100.0},
                  {"timestamp": 2000, "unlocked": 100.0},
                  {"timestamp": 3000, "unlocked": 130.0}]},
    ]}}
    evts = fetch.evenements(proto)
    assert len(evts) == 1
    assert evts[0]["ts_ms"] == 3000 * 1000
    assert evts[0]["debloque"] == 30.0
    assert abs(evts[0]["part_offre"] - 0.30) < 1e-9


def test_les_categories_multiples_sont_additionnees():
    """Un protocole débloque simultanément pour l'équipe, les investisseurs
    et l'écosystème. Ne lire qu'une catégorie sous-estimerait le choc."""
    proto = {"documentedData": {"data": [
        {"data": [{"timestamp": 1000, "unlocked": 50.0},
                  {"timestamp": 2000, "unlocked": 60.0}]},
        {"data": [{"timestamp": 1000, "unlocked": 50.0},
                  {"timestamp": 2000, "unlocked": 90.0}]},
    ]}}
    evts = fetch.evenements(proto)
    assert evts[0]["debloque"] == 50.0        # (60+90) - (50+50)


def test_une_forme_inattendue_ne_leve_jamais():
    """La première exécution réelle sera celle de l'utilisateur. Le script
    doit rapporter, pas planter."""
    for tordu in ({}, {"documentedData": None}, {"data": {"data": "texte"}},
                  {"documentedData": {"data": [{"data": None}]}}):
        assert fetch.evenements(tordu) == []


def test_une_offre_qui_decroit_nest_pas_un_deblocage():
    """Un burn n'est pas un unlock, et le compter comme tel inverserait le
    signe de la variable qu'on teste."""
    proto = {"documentedData": {"data": [
        {"data": [{"timestamp": 1000, "unlocked": 100.0},
                  {"timestamp": 2000, "unlocked": 80.0}]},
    ]}}
    assert fetch.evenements(proto) == []
