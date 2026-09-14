"""La réplication actions : collecte des expirations de *lockup*.

Ces tests couvrent ce qui est testable sans réseau, et ils couvrent surtout
la chose qui a déjà coûté cher une fois : **un collecteur qui produit des
données fausses sans lever la moindre erreur.**

`fetch_unlocks.py` avait été écrit contre une structure supposée. Il était
propre, testé, et entièrement faux. Les structures utilisées ici viennent
toutes de sondes réelles du 8 septembre 2026 — le calendrier Nasdaq et
l'API de graphiques Yahoo — et ces tests les figent.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
from pathlib import Path

_racine = Path(__file__).resolve().parents[1]


def _module(nom: str):
    spec = importlib.util.spec_from_file_location(nom, _racine / "scripts" / f"{nom}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lockups = _module("fetch_lockups")
cours = _module("fetch_cours_actions")
JOUR_MS = 86_400_000


# La forme RÉELLE du calendrier Nasdaq, relevée par la sonde. Reconstruite,
# pas inventée : un parseur écrit sur un format supposé produit des dates
# fausses en silence, et toute la chaîne mesure alors des événements qui
# n'ont pas eu lieu.
NASDAQ_REEL = [
    {"dealID": "1112256-109352", "proposedTickerSymbol": "BOLD",
     "companyName": "Boundless Bio, Inc.", "proposedExchange": "NASDAQ Global Select",
     "proposedSharePrice": "16.00", "sharesOffered": "6,250,000",
     "pricedDate": "3/28/2024", "dollarValueOfSharesOffered": "$100,000,000",
     "dealStatus": "Priced"},
    {"dealID": "x", "proposedTickerSymbol": "SPAC1",
     "companyName": "Generic Acquisition Corp", "proposedExchange": "NASDAQ Capital",
     "proposedSharePrice": "10.00", "sharesOffered": "20,000,000",
     "pricedDate": "3/15/2024", "dollarValueOfSharesOffered": "$200,000,000",
     "dealStatus": "Priced"},
    {"dealID": "y", "proposedTickerSymbol": "WDRW",
     "companyName": "Retiree Inc", "proposedExchange": "NYSE",
     "proposedSharePrice": "18.00", "sharesOffered": "1,000,000",
     "pricedDate": "3/10/2024", "dollarValueOfSharesOffered": "$18,000,000",
     "dealStatus": "Withdrawn"},
]


def test_lexpiration_tombe_a_180_jours_de_lintroduction():
    """Convention de marché, pré-enregistrée. Un décalage d'une semaine sur
    la date d'un événement daté détruit exactement ce qu'on mesure."""
    e = lockups.evenements(NASDAQ_REEL)[0]
    intro = dt.datetime.fromtimestamp(e["introduction_ms"] / 1000, dt.UTC)
    fin = dt.datetime.fromtimestamp(e["expiration_ms"] / 1000, dt.UTC)
    assert intro.date() == dt.date(2024, 3, 28)
    assert (fin - intro).days == lockups.LOCKUP_JOURS == 180


def test_les_SPAC_sont_exclues_sur_le_prix_de_dix_dollars():
    """Le pré-enregistrement les exclut : leur *lockup* obéit à une autre
    mécanique. La sonde a montré que le critère du prix englobe les neuf
    sociétés au nom en « Acquisition » d'un échantillon de 57 — il est donc
    le plus large des deux, et le plus simple."""
    tickers = [e["ticker"] for e in lockups.evenements(NASDAQ_REEL)]
    assert "SPAC1" not in tickers


def test_une_introduction_RETIREE_na_jamais_eu_de_lockup():
    """Le calendrier sépare `priced`, `filed`, `upcoming` et `withdrawn`. Une
    société dont l'introduction a été retirée n'a jamais eu d'actions
    bloquées à libérer."""
    assert "WDRW" not in [e["ticker"] for e in lockups.evenements(NASDAQ_REEL)]


def test_un_nombre_dactions_illisible_vaut_None_et_jamais_zero():
    """Zéro passerait pour une introduction sans actions offertes — ce qui
    n'existe pas — et fausserait toute part calculée dessus."""
    assert lockups._entier("6,250,000") == 6_250_000
    assert lockups._entier("") is None
    assert lockups._entier("n/a") is None
    assert lockups._entier(None) is None


def test_une_ligne_malformee_est_ecartee_sans_lever():
    """La première exécution réelle est celle de l'utilisateur. Le script
    doit rapporter, pas planter au milieu de trente-six mois de collecte."""
    tordus = [{}, {"dealStatus": "Priced"},
              {"dealStatus": "Priced", "proposedTickerSymbol": "AA",
               "pricedDate": "pas une date", "proposedSharePrice": "12.00"},
              {"dealStatus": "Priced", "proposedTickerSymbol": "",
               "pricedDate": "3/1/2024", "proposedSharePrice": "12.00"}]
    assert lockups.evenements(tordus) == []


def test_les_mois_sont_enumeres_en_passant_lannee():
    assert lockups.mois_entre("2024-11", "2025-02") == [
        (2024, 11), (2024, 12), (2025, 1), (2025, 2)]
    assert lockups.mois_entre("2024-03", "2024-03") == [(2024, 3)]


# --------------------------------------------------------------------------
#  Les cours : la forme RÉELLE de l'API Yahoo, relevée par la sonde
# --------------------------------------------------------------------------

def _yahoo(n=5, premiere=None, trous=()):
    ts = [1_700_000_000 + i * 86_400 for i in range(n)]
    def col(base):
        return [None if i in trous else base + i for i in range(n)]
    return {"chart": {"result": [{
        "meta": {"symbol": "TEST", "firstTradeDate": premiere or ts[0]},
        "timestamp": ts,
        "indicators": {"quote": [{
            "open": col(10.0), "high": col(11.0),
            "low": col(9.0), "close": col(10.5),
            "volume": col(1000)}]},
    }]}}


def test_les_bougies_sortent_au_format_du_projet():
    """Le même format que `fetch_candles.py`, pour que `load_from_file` les
    relise sans code spécial — la fonction déjà éprouvée sur les déblocages,
    les stratégies et les déclencheurs."""
    barres, _ = cours.bougies(_yahoo(3), "TEST")
    assert len(barres) == 3
    for cle in ("t", "T", "s", "i", "o", "h", "l", "c", "v", "n"):
        assert cle in barres[0], cle
    assert barres[0]["s"] == "TEST" and barres[0]["i"] == "1d"
    assert barres[1]["t"] - barres[0]["t"] == JOUR_MS


def test_une_seance_incomplete_est_ECARTEE_pas_comblee():
    """Yahoo rend `null` sur les séances sans cotation. Les combler par la
    clôture précédente fabriquerait des barres qui n'ont pas eu lieu — et le
    comptage de touches d'un niveau les compterait comme de vraies visites
    du marché à ce prix."""
    barres, _ = cours.bougies(_yahoo(5, trous=(1, 3)), "TEST")
    assert len(barres) == 3


def test_la_premiere_cotation_est_remontee_pour_la_VERIFICATION_CROISEE():
    """Le contrôle le plus important de la chaîne.

    `firstTradeDate` vient de Yahoo, `pricedDate` de Nasdaq. Les deux
    doivent coïncider. Un écart systématique signifierait que l'une des deux
    ne dit pas ce que je crois — et la fenêtre J-7/J-1 serait décalée sur
    TOUS les événements, sans qu'aucune erreur ne se déclenche.
    """
    _, premiere = cours.bougies(_yahoo(3, premiere=1_699_000_000), "TEST")
    assert premiere == 1_699_000_000 * 1000


def test_une_absence_de_premiere_cotation_ne_leve_pas():
    """Sans `firstTradeDate`, la vérification croisée est impossible pour
    cet événement — ce n'est pas une raison de faire tomber la collecte."""
    brut = _yahoo(3)
    del brut["chart"]["result"][0]["meta"]["firstTradeDate"]
    barres, premiere = cours.bougies(brut, "TEST")
    assert premiere is None and len(barres) == 3


def test_le_format_ecrit_se_relit_par_load_from_file(tmp_path, monkeypatch):
    """La boucle complète : ce que le collecteur écrit, l'analyse le relit.

    Sans ce test, une divergence de format ne se verrait qu'à la première
    campagne — après la collecte de trente-six mois de données.
    """
    import os

    from trading_desk.backtest.data import load_from_file

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir()
    barres, _ = cours.bougies(_yahoo(40), "TEST")
    (tmp_path / "data" / "TEST_1d_real.json").write_text(json.dumps(barres))
    os.chdir(tmp_path)

    relues = load_from_file("data/TEST_1d_real.json", "TEST", "1d")
    assert len(relues) == 40
    assert float(relues[0].close) == 10.5


# --------------------------------------------------------------------------
#  Le validateur : la fenêtre calendaire sur un marché qui ferme
# --------------------------------------------------------------------------

valider = _module("valider_lockups")


def test_la_fenetre_est_CALENDAIRE_pas_en_seances():
    """Amendement n° 2, et il va dans le sens le moins avantageux.

    L'expiration tombe 180 jours après l'introduction, week-end ou non. Le
    contenu de l'hypothèse est « la semaine qui précède », et une semaine
    est une semaine. Compter en séances ferait glisser la fenêtre selon la
    position du week-end — c'est-à-dire selon rien.
    """
    assert (valider.ENTREE_J, valider.SORTIE_J) == (-7, -1)


def test_une_date_de_week_end_recule_sur_la_derniere_seance():
    """Une date calendaire ne correspond pas toujours à une bougie. Prendre
    la séance SUIVANTE regarderait après l'événement ; il faut la
    précédente."""
    # Séances aux jours 100 et 104 : le jour 102 doit trouver la 100.
    par_jour = {100: 0, 104: 1, 105: 2}
    assert valider._seance_avant(par_jour, 102) == 0
    assert valider._seance_avant(par_jour, 104) == 1


def test_une_date_trop_loin_de_toute_seance_est_ECARTEE():
    """Au-delà d'une semaine, rattacher l'événement à une séance lointaine
    décalerait la mesure de ce qu'elle prétend mesurer."""
    assert valider._seance_avant({100: 0}, 120) is None


def test_le_rendement_est_positif_quand_le_prix_BAISSE():
    """`sens = -1` retourne déjà le signe. Le défaut le plus dangereux de la
    campagne crypto était une légende inversée, qui aurait fait conclure
    exactement le contraire des données."""
    from decimal import Decimal

    from trading_desk.features.bars import Bar
    bars = [Bar(asset="T", ts_ms=i * JOUR_MS, open=Decimal(str(p)),
                high=Decimal(str(p)), low=Decimal(str(p)), close=Decimal(str(p)))
            for i, p in enumerate([100.0, 95.0, 90.0])]
    assert valider._rendement(bars, 0, 2) > 0


def test_le_decalage_calendaire_enumere_et_annonce_son_plancher():
    """Le nul est un ensemble CLOS : il n'existe que 2 × (amplitude − 13)
    alignements. Un p sous ce plancher serait un mensonge arithmétique."""
    from decimal import Decimal

    from trading_desk.features.bars import Bar
    bars = [Bar(asset="T", ts_ms=i * JOUR_MS, open=Decimal("100"),
                high=Decimal("100"), low=Decimal("100"), close=Decimal("100"))
            for i in range(400)]
    evts = [{"ticker": "T", "bars": bars, "i0": 200, "duree": 4,
             "jour_entree": 200, "brut": 0.0}]
    _, _, pv, n_al = valider.decalage_calendaire(evts, amplitude=60)
    assert n_al > 0
    assert pv >= 1 / (n_al + 1) - 1e-9


def test_les_trous_de_WEEK_END_peuvent_etre_silencieux():
    """Le marché actions ferme : chaque série porte deux cents
    discontinuités parfaitement normales.

    Les annoncer noyait le rapport sous quatre cents lignes
    d'avertissement — c'est arrivé le 9 septembre 2026 — et un
    avertissement qu'on apprend à ignorer ne protège plus de rien.

    Le défaut reste bruyant : sur des bougies crypto, un trou est une vraie
    anomalie.
    """
    import inspect

    from trading_desk.backtest.data import load_from_file
    sig = inspect.signature(load_from_file)
    assert sig.parameters["silencieux"].default is False, (
        "le silence doit se demander, jamais s'imposer")
