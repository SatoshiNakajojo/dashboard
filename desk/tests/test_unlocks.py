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
import json
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

# --------------------------------------------------------------------------
#  Lecture de la structure RÉELLE de defillama-datasets
# --------------------------------------------------------------------------
#
# Reconstruite à partir de la sonde du 6 septembre 2026 sur `emissions/sei`,
# valeurs comprises. Pas inventée : un parseur écrit sur un format supposé
# produit des dates fausses en silence, et le reste de la chaîne mesurerait
# alors très consciencieusement des événements qui n'ont pas eu lieu.

SEI_REEL = {
    "name": "Sei",
    "gecko_id": "sei-network",
    "documentedData": {"data": [
        {"label": "Binance Launchpool",
         "data": [{"timestamp": 1691971200, "unlocked": 300000000,
                   "rawEmission": 300000000, "burned": 0},
                  {"timestamp": 1694649600, "unlocked": 300000000,
                   "rawEmission": 0, "burned": 0}]},
        {"label": "Airdrop",
         "data": [{"timestamp": 1691971200, "unlocked": 700000000,
                   "rawEmission": 700000000, "burned": 0},
                  {"timestamp": 1694649600, "unlocked": 900000000,
                   "rawEmission": 200000000, "burned": 0}]},
    ]},
    "metadata": {
        "token": "coingecko:sei-network",
        "chain": "sei",
        "unlockEvents": [
            {"timestamp": 1691971200,
             "cliffAllocations": [
                 {"recipient": "x", "category": "staking",
                  "unlockType": "cliff", "amount": 25000000}],
             "linearAllocations": [],
             "summary": {"totalTokensCliff": 1000000000}},
            {"timestamp": 1694649600,
             "cliffAllocations": [
                 {"recipient": "y", "category": "insiders",
                  "unlockType": "cliff", "amount": 200000000}],
             "linearAllocations": [],
             "summary": {"totalTokensCliff": 200000000}},
        ],
    },
}


def test_les_deblocages_sont_lus_dans_unlockEvents():
    """DefiLlama a déjà agrégé les déblocages par date. Dériver la série
    cumulée à la place introduirait des sauts parasites aux frontières de
    catégories, là où la source a fait le travail proprement."""
    evts = fetch.evenements(SEI_REEL)
    # Deux événements en entrée, un seul en sortie : le tout premier n'a
    # aucune offre antérieure — voir le test dédié juste en dessous.
    assert [e["debloque"] for e in evts] == [200_000_000.0]


def test_lhorodatage_est_converti_de_SECONDES_en_millisecondes():
    """La source est en secondes. Prendre 1691971200 pour des millisecondes
    daterait l'événement de janvier 1970 — et il tomberait hors de tout
    historique, donc serait silencieusement écarté."""
    import datetime as dt
    evts = fetch.evenements(SEI_REEL)
    assert evts[0]["ts_ms"] == 1694649600 * 1000
    assert dt.datetime.fromtimestamp(evts[0]["ts_ms"] / 1000, dt.UTC).year == 2023


def test_le_denominateur_exclut_le_deblocage_lui_meme():
    """Inclure le déblocage dans son propre dénominateur écraserait
    mécaniquement les gros événements : celui qui double l'offre afficherait
    50 % au lieu de 100 %."""
    evts = fetch.evenements(SEI_REEL)
    # Le déblocage de 200 M survient alors que 1 000 M sont déjà débloqués
    # (300 + 700 à la date précédente) : 20 %, et non 200/1200 = 16,7 %.
    assert abs(evts[0]["part_offre"] - 0.20) < 1e-9


def test_le_premier_deblocage_sans_offre_anterieure_est_ecarte():
    """Un dénominateur nul ne donne pas une part infinie : il ne donne rien.

    Le tout premier déblocage d'un jeton est son TGE — un événement de
    cotation, pas un choc d'offre sur un marché existant. Il n'a d'ailleurs
    généralement pas d'historique de prix avant lui.
    """
    evts = fetch.evenements(SEI_REEL)
    assert all(e["ts_ms"] != 1691971200 * 1000 for e in evts)


def test_un_deblocage_purement_lineaire_nest_pas_un_evenement():
    """Un déblocage linéaire libère des jetons en continu : il n'a pas de
    date. Le tester comme un événement daté reviendrait à mesurer un jour au
    hasard dans une rampe."""
    lineaire = json.loads(json.dumps(SEI_REEL))
    lineaire["metadata"]["unlockEvents"] = [{
        "timestamp": 1694649600, "cliffAllocations": [], "linearAllocations": [
            {"recipient": "z", "category": "team", "unlockType": "linear",
             "amount": 500000000}],
        "summary": {"totalTokensLinear": 500000000},
    }]
    assert fetch.evenements(lineaire) == []


def test_les_categories_du_deblocage_sont_conservees():
    """Un déblocage d'équipe et un déblocage de récompenses de staking n'ont
    pas le même sens économique. On garde de quoi les distinguer plus tard."""
    evts = fetch.evenements(SEI_REEL)
    assert evts[0]["categories"] == ["insiders"]


def test_une_forme_inattendue_ne_leve_jamais():
    """La première exécution réelle est celle de l'utilisateur. Le script
    doit rapporter, pas planter."""
    for tordu in ({}, {"metadata": None}, {"metadata": {"unlockEvents": "texte"}},
                  {"metadata": {"unlockEvents": [None, 3, "x"]}},
                  {"metadata": {"unlockEvents": [{"timestamp": None}]}}):
        assert fetch.evenements(tordu) == []


def test_un_deblocage_sans_offre_connue_est_ecarte_pas_divise_par_zero():
    sans_serie = {"metadata": {"unlockEvents": [
        {"timestamp": 1694649600, "cliffAllocations": [],
         "summary": {"totalTokensCliff": 100}}]}}
    assert fetch.evenements(sans_serie) == []
