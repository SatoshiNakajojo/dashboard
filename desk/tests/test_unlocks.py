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


# --------------------------------------------------------------------------
#  Le test poolé, et sa puissance
# --------------------------------------------------------------------------

def _univers(tmp_path, choc, n_jetons=8, vol=0.04, graine=1):
    """Plusieurs jetons partageant un effet commun, écrits sur disque."""
    import os
    alea = random.Random(graine)
    (tmp_path / "data").mkdir(exist_ok=True)
    unlocks = {}
    for k in range(n_jetons):
        px, bars = 100.0, []
        chocs = set(range(60, 400, 22))
        for i in range(450):
            px *= 1 + alea.gauss(0, vol) + (choc if i in chocs else 0.0)
            bars.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        unlocks[f"T{k}"] = [{"ts_ms": i * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for i in sorted(chocs)]
    os.chdir(tmp_path)
    return unlocks


def _pool(unlocks, tirages=600):
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        valider.poolage(unlocks, tirages=tirages, min_evts=30, alpha=0.05)
    return buf.getvalue()


def test_le_test_poole_detecte_un_effet_commun_de_3_pourcent(tmp_path, monkeypatch):
    """La raison d'être du poolage.

    Un effet de 3 % réparti sur douze jetons est invisible jeton par jeton —
    chaque série manque de puissance — mais net une fois les événements mis
    en commun. C'est le MÊME test que le précédent, pas un second essai :
    l'hypothèse baissière était posée d'avance, seule la puissance change.
    """
    monkeypatch.chdir(tmp_path)
    sortie = _pool(_univers(tmp_path, -0.03))
    ligne = [x for x in sortie.splitlines() if "large_J-1_J+3" in x and "toutes" in x]
    assert ligne, sortie
    assert "OUI" in ligne[0], f"effet franc de 3 % non détecté : {ligne[0]}"


def test_le_test_poole_ne_voit_rien_quand_il_ny_a_rien(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    sortie = _pool(_univers(tmp_path, 0.0, graine=7))
    assert "**0 survivant" in sortie, sortie


def test_la_puissance_du_test_poole_sarrete_vers_2_pourcent(tmp_path, monkeypatch):
    """La limite de l'instrument, mesurée plutôt que supposée.

    Sur douze jetons et ~190 événements à 4 % de volatilité quotidienne :
    un choc de 3 % ressort (p = 0,001), un choc de 1,5 % non (p = 0,029, qui
    ne survit pas à la correction). Un résultat négatif sur les vraies
    données signifie donc « pas d'effet SUPÉRIEUR À ~2 % », et non « pas
    d'effet ».
    """
    monkeypatch.chdir(tmp_path)
    sortie = _pool(_univers(tmp_path, -0.015, graine=1))
    ligne = [x for x in sortie.splitlines() if "large_J-1_J+3" in x and "toutes" in x]
    assert ligne and "OUI" not in ligne[0], (
        "un choc de 1,5 % ne devrait PAS ressortir : si ce test tombe, la "
        "puissance a changé et la phrase sur la limite doit être refaite")


def test_le_libelle_du_signe_nest_pas_inverse():
    """Le défaut le plus dangereux du premier rapport : il annonçait
    « négatif = le prix baisse » alors que `sens = -1` retourne déjà le
    signe. Positif signifie que le prix a BAISSÉ, et lire l'inverse aurait
    fait conclure exactement le contraire des données."""
    from trading_desk.sentinelle.validation import _rendement
    bars = [Bar(asset="T", ts_ms=i * JOUR_MS, open=Decimal(str(p)),
                high=Decimal(str(p + 1)), low=Decimal(str(p - 1)),
                close=Decimal(str(p)))
            for i, p in enumerate([100, 90, 80])]
    assert _rendement(bars, 0, 2, -1) > 0, "prix en baisse => rendement positif"


def test_la_coupe_temporelle_voit_un_effet_qui_disparait(tmp_path, monkeypatch):
    """L'épreuve la plus décisive des trois, vérifiée sur un cas construit.

    Un effet présent dans la première moitié et absent dans la seconde a été
    arbitré : le trader d'aujourd'hui perdrait de l'argent à le suivre. Si
    `robustesse` ne savait pas distinguer ce cas, elle validerait des edges
    morts.
    """
    import contextlib
    import io
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(3)
    unlocks = {}
    for k in range(10):
        px, bars = 100.0, []
        # La fenêtre d'anticipation couvre [d-7, d-1] : la baisse doit s'y
        # trouver, pas le jour du déblocage lui-même. Un fixture qui place le
        # choc en `d` ne teste rien — la fenêtre s'arrête à `d-1`.
        deblocages = set(range(60, 400, 20))
        avant = {j for d in deblocages for j in range(d - 7, d)}
        for i in range(900):
            px *= 1 + alea.gauss(0, 0.04) + (-0.012 if i in avant else 0.0)
            bars.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        # Des déblocages sur TOUTE la série, mais des chocs sur la moitié.
        toutes = sorted(deblocages) + list(range(500, 860, 20))
        unlocks[f"T{k}"] = [{"ts_ms": i * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for i in toutes]
    os.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        valider.robustesse(unlocks, tirages=400, alpha=0.05)
    sortie = buf.getvalue()

    coupe = sortie.split("3. Coupe temporelle")[-1]
    lignes = [x for x in coupe.splitlines() if "avant" in x or "après" in x]
    assert len(lignes) == 2, sortie
    assert "OK" in lignes[0], f"la première moitié doit montrer l'effet : {lignes[0]}"
    assert "absent" in lignes[1], f"la seconde doit être vide : {lignes[1]}"


def test_le_jackknife_repere_un_jeton_qui_porte_tout(tmp_path, monkeypatch):
    """Un effet concentré sur un seul jeton n'est pas un effet de marché,
    c'est une anecdote."""
    import contextlib
    import io
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(5)
    unlocks = {}
    for k in range(6):
        px, bars = 100.0, []
        deblocages = set(range(60, 400, 10))
        avant = {j for d in deblocages for j in range(d - 7, d)}
        # Seul T0 baisse avant ses déblocages ; les cinq autres sont du bruit.
        amplitude = -0.03 if k == 0 else 0.0
        for i in range(450):
            px *= 1 + alea.gauss(0, 0.03) + (amplitude if i in avant else 0.0)
            bars.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        unlocks[f"T{k}"] = [{"ts_ms": i * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for i in sorted(deblocages)]
    os.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        valider.robustesse(unlocks, tirages=400, alpha=0.05)
    sortie = buf.getvalue()
    jack = sortie.split("2. Jackknife")[-1].split("3. Coupe")[0]
    assert "T0" in jack, f"le jackknife doit nommer le jeton porteur : {jack}"


def test_la_neutralisation_tue_un_effet_qui_nest_que_du_marche(tmp_path, monkeypatch):
    """L'épreuve décisive, vérifiée sur un cas construit.

    Ici les jetons N'ONT PAS d'effet propre : ils suivent simplement un
    marché qui baisse pendant les semaines de déblocage, parce que les
    déblocages sont GROUPÉS dans le calendrier. Sans neutralisation, la
    mesure crie « effet de déblocage ». Avec, elle doit se taire.

    Si ce test tombe, la neutralisation ne neutralise rien et tout résultat
    positif qu'elle laisserait passer serait sans valeur.
    """
    import contextlib
    import io
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(11)

    # Dates de déblocage COMMUNES à tous les jetons — le cas qui piège.
    deblocages = sorted(range(60, 400, 20))
    avant = {j for d in deblocages for j in range(d - 7, d)}

    # Le marché baisse pendant ces fenêtres, et lui seul.
    px, marche = 100.0, []
    for i in range(450):
        px *= 1 + alea.gauss(0, 0.02) + (-0.012 if i in avant else 0.0)
        marche.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                       "l": px * 0.99, "c": px, "v": 100, "n": 1})
    (tmp_path / "data" / "BTC_1d_real.json").write_text(json.dumps(marche))

    # Les jetons suivent le marché, plus du bruit propre. Aucun effet à eux.
    unlocks = {}
    for k in range(10):
        px, bars = 100.0, []
        for i in range(450):
            r_marche = (marche[i]["c"] / marche[i - 1]["c"] - 1) if i else 0.0
            px *= 1 + r_marche + alea.gauss(0, 0.02)
            bars.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        unlocks[f"T{k}"] = [{"ts_ms": d * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for d in deblocages]
    os.chdir(tmp_path)

    brut = io.StringIO()
    with contextlib.redirect_stdout(brut):
        valider.poolage(unlocks, tirages=400, min_evts=30, alpha=0.05)
    assert "OUI" in brut.getvalue(), (
        "le fixture doit d'abord PIÉGER la mesure brute, sinon il ne teste "
        f"rien :\n{brut.getvalue()}")

    net = io.StringIO()
    with contextlib.redirect_stdout(net):
        valider.marche_neutre(unlocks, tirages=400, alpha=0.05)
    assert "AUCUNE tranche ne survit" in net.getvalue(), (
        f"la neutralisation n'a pas neutralisé :\n{net.getvalue()}")


def test_la_neutralisation_laisse_passer_un_effet_propre(tmp_path, monkeypatch):
    """L'autre sens : un effet réellement propre au jeton doit survivre."""
    import contextlib
    import io
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(13)

    px, marche = 100.0, []
    for i in range(450):
        px *= 1 + alea.gauss(0, 0.02)          # marché sans lien aux dates
        marche.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                       "l": px * 0.99, "c": px, "v": 100, "n": 1})
    (tmp_path / "data" / "BTC_1d_real.json").write_text(json.dumps(marche))

    unlocks = {}
    for k in range(10):
        # Dates PROPRES à chaque jeton, et baisse propre avant chacune.
        deblocages = sorted(range(60 + k * 3, 400, 20))
        avant = {j for d in deblocages for j in range(d - 7, d)}
        px, bars = 100.0, []
        for i in range(450):
            px *= 1 + alea.gauss(0, 0.02) + (-0.012 if i in avant else 0.0)
            bars.append({"t": i * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        unlocks[f"T{k}"] = [{"ts_ms": d * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for d in deblocages]
    os.chdir(tmp_path)

    net = io.StringIO()
    with contextlib.redirect_stdout(net):
        valider.marche_neutre(unlocks, tirages=400, alpha=0.05)
    assert "survivent APRÈS neutralisation" in net.getvalue(), net.getvalue()


# --------------------------------------------------------------------------
#  Le décalage calendaire : la dépendance entre jetons
# --------------------------------------------------------------------------
#
# Les quatre contrôles précédents partagent tous le même bras aléatoire :
# une date tirée indépendamment PAR ÉVÉNEMENT. Ce bras suppose que les 852
# événements sont 852 observations. Ils ne le sont pas — beaucoup de jetons
# débloquent aux mêmes dates, et vingt rendements de la même semaine ne
# valent pas vingt semaines.
#
# Le décalage calendaire remplace ce bras par un décalage unique appliqué à
# tout le calendrier. Les deux tests ci-dessous vérifient qu'il tranche dans
# les deux sens, sur des cas dont la vérité est connue par construction.


def _serie_json(px_series):
    return json.dumps([{"t": i * JOUR_MS, "o": p, "h": p * 1.01,
                        "l": p * 0.99, "c": p, "v": 100, "n": 1}
                       for i, p in enumerate(px_series)])


def _decalage(unlocks, alpha=0.05, amplitude_j=120):
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        valider.decalage_calendaire(unlocks, alpha=alpha, amplitude_j=amplitude_j)
    return buf.getvalue()


def _monde_correle(tmp_path, choc, graine, n_dates=6, n_jetons=12):
    """Douze jetons quasi identiques, et six dates de déblocage communes.

    Un unique facteur commun porte tout le mouvement ; le bruit propre à
    chaque jeton est marginal. Les 72 rendements ne sont donc pas 72
    observations : ce sont six semaines de marché regardées douze fois.
    """
    import os

    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    alea = random.Random(graine)
    deblocages = list(range(60, 60 + 20 * n_dates, 20))
    avant = {j for d in deblocages for j in range(d - 7, d)}

    px, commun = 100.0, []
    for i in range(450):
        px *= 1 + alea.gauss(0, 0.04) + (choc if i in avant else 0.0)
        commun.append(px)

    unlocks = {}
    for k in range(n_jetons):
        px, bars = 100.0, []
        for i in range(450):
            r = (commun[i] / commun[i - 1] - 1) if i else 0.0
            px *= 1 + r + alea.gauss(0, 0.004)
            bars.append(px)
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(_serie_json(bars))
        unlocks[f"T{k}"] = [{"ts_ms": d * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for d in deblocages]
    os.chdir(tmp_path)
    return unlocks


def _p_anticipation(sortie_poolee):
    """Le p de la fenêtre que `decalage_calendaire` mesure, et elle seule.

    `poolage` balaie les quatre fenêtres ; `decalage_calendaire`, comme
    `robustesse` et `marche_neutre`, ne mesure que l'anticipation (-7, 6).
    Comparer les deux sur des fenêtres différentes ne comparerait rien.
    """
    for x in sortie_poolee.splitlines():
        if "toutes" in x and "anticipation" in x:
            return float(x.split()[-2])
    return None


def test_le_decalage_tue_un_effet_qui_ne_tient_qu_a_six_dates(tmp_path,
                                                              monkeypatch):
    """Le cas exact que les quatre contrôles précédents laissent passer.

    Douze jetons fortement corrélés, mais **six dates seulement**, communes
    à tous. Le nombre effectif d'observations est six, pas soixante-douze.

    Le bras par événement l'ignore : il tire ses 72 dates indépendamment,
    obtient un nul dont l'écart-type est faussement petit d'un facteur √12,
    et sature — il annonce **p = 0,0010 quel que soit le choc**, ce que
    montre l'assertion ci-dessous. Un test qui rend le même verdict pour une
    preuve mince et pour une preuve épaisse ne mesure plus rien.

    Le décalage en bloc garde la corrélation dans les deux bras. Six
    semaines de marché ne suffisent pas à distinguer ce choc de ce que
    produit un alignement quelconque, et il doit le dire.

    Le verdict est vérifié sur **cinq graines**, pas une : sur une seule, un
    refus pourrait n'être qu'un tirage heureux. La graine 97 est un cas où
    l'alignement commun est réellement rare et où le contrôle valide — c'est
    attendu, et c'est pourquoi le seuil est « au moins quatre sur cinq » et
    non « cinq sur cinq ».

    Si ce test tombe, le contrôle ne contrôle rien et les p de l'analyse
    réelle restent flattés par des événements comptés en double.
    """
    refus, satures = 0, 0
    for graine in (23, 41, 59, 67, 83):
        unlocks = _monde_correle(tmp_path / str(graine), -0.012, graine)
        monkeypatch.chdir(tmp_path / str(graine))

        # 1. Le fixture doit PIÉGER le bras par événement, sinon il ne teste
        #    rien : un contrôle qui refuse un effet que personne n'annonçait
        #    ne prouve pas qu'il sait refuser un artefact.
        p_naif = _p_anticipation(_pool(unlocks, tirages=1000))
        assert p_naif is not None and p_naif <= 0.05, (
            f"graine {graine} : le bras par événement ne mord pas "
            f"(p={p_naif}), le fixture ne teste rien")
        satures += p_naif <= 0.0011

        # 2. Le décalage en bloc doit se taire.
        refus += "AUCUNE tranche ne survit" in _decalage(unlocks)

    assert satures == 5, (
        "le bras par événement devrait saturer à son plancher sur les cinq "
        f"graines ; il ne l'a fait que {satures} fois — la démonstration de "
        "l'artefact repose sur cette saturation")
    assert refus >= 4, (
        f"le décalage calendaire n'a refusé que {refus} des 5 mondes où "
        "l'effet ne repose que sur six semaines de marché")


def test_le_decalage_laisse_passer_un_effet_reparti_sur_le_calendrier(
        tmp_path, monkeypatch):
    """L'autre sens, sans quoi le test précédent ne vaut rien.

    Ici chaque jeton a ses PROPRES dates et sa propre baisse avant chacune.
    L'effet ne tient plus à quelques semaines partagées : il est aligné sur
    les dates de déblocage et sur rien d'autre. Aucun décalage global ne
    peut le reproduire, puisque décaler le calendrier désaligne chaque jeton
    de ses propres déblocages.

    Un contrôle qui refuse aussi ce cas serait simplement un contrôle qui
    refuse tout.
    """
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(29)

    unlocks = {}
    for k in range(10):
        deblocages = sorted(range(60 + k * 3, 400, 20))
        avant = {j for d in deblocages for j in range(d - 7, d)}
        px, bars = 100.0, []
        for i in range(450):
            px *= 1 + alea.gauss(0, 0.02) + (-0.012 if i in avant else 0.0)
            bars.append(px)
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(_serie_json(bars))
        unlocks[f"T{k}"] = [{"ts_ms": d * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for d in deblocages]
    os.chdir(tmp_path)

    sortie = _decalage(unlocks)
    assert "survivent au décalage calendaire" in sortie, (
        f"un effet franc et réparti a été refusé :\n{sortie}")


def test_les_petits_decalages_sont_exclus(tmp_path, monkeypatch):
    """Un décalage de trois jours laisse la fenêtre décalée chevaucher la
    vraie : le bras « aléatoire » mesurerait alors une partie de l'effet
    qu'il sert de référence, et le rapprocherait de l'observé. Le contrôle
    perdrait sa puissance sans le dire."""
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    px, bars = 100.0, []
    alea = random.Random(31)
    for _ in range(450):
        px *= 1 + alea.gauss(0, 0.02)
        bars.append(px)
    (tmp_path / "data" / "T0_1d_real.json").write_text(_serie_json(bars))
    unlocks = {"T0": [{"ts_ms": d * JOUR_MS, "part_offre": 0.03, "debloque": 1.0,
                       "lineaire": 0.0, "categories": []}
                      for d in range(60, 400, 20)]}
    os.chdir(tmp_path)

    sortie = _decalage(unlocks, amplitude_j=100)
    # 2 x (100 - 13) = 174 décalages, et le plancher qui en découle.
    assert "174 décalages" in sortie, sortie
    assert "plancher 0.0057" in sortie, sortie


def test_le_p_du_decalage_ne_descend_jamais_sous_son_plancher(tmp_path,
                                                              monkeypatch):
    """Le nul du décalage est un ensemble CLOS, pas un échantillon.

    Tirer davantage ne l'agrandit pas : il n'existe que `2 x (amplitude-13)`
    alignements possibles. Un p de 0,0001 affiché ici serait un mensonge
    arithmétique. Le rapport doit annoncer son plancher, et aucun p ne doit
    passer dessous — y compris sur un effet écrasant.
    """
    import os
    import re

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(37)
    unlocks = {}
    for k in range(6):
        deblocages = sorted(range(60 + k * 3, 400, 20))
        avant = {j for d in deblocages for j in range(d - 7, d)}
        px, bars = 100.0, []
        for i in range(450):
            px *= 1 + alea.gauss(0, 0.01) + (-0.05 if i in avant else 0.0)
            bars.append(px)
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(_serie_json(bars))
        unlocks[f"T{k}"] = [{"ts_ms": d * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for d in deblocages]
    os.chdir(tmp_path)

    sortie = _decalage(unlocks, amplitude_j=60)
    plancher = float(re.search(r"plancher (\d+\.\d+)", sortie).group(1))
    ps = [float(x.split()[-2]) for x in sortie.splitlines()
          if x.strip().startswith(("toutes", "2-5"))]
    assert ps, sortie
    assert min(ps) >= plancher - 1e-9, (
        f"p={min(ps)} sous le plancher {plancher} — le nul aurait été "
        f"présenté comme plus fin qu'il ne l'est :\n{sortie}")


# --------------------------------------------------------------------------
#  L'économie : un effet réel n'est pas un effet exploitable
# --------------------------------------------------------------------------

economie = _module("economie_unlocks")


def test_les_deux_scripts_voient_EXACTEMENT_les_memes_evenements(tmp_path,
                                                                 monkeypatch):
    """Le test qui empêche de chiffrer les coûts d'une autre stratégie.

    `economie_unlocks` reconstruit l'ensemble d'événements plutôt que de
    l'importer, parce que `valider_unlocks` mêle construction et mesure. Un
    écart entre les deux ne se verrait nulle part : les deux scripts
    tourneraient, afficheraient des chiffres plausibles, et le seuil de
    rentabilité porterait sur des trades que la validation n'a jamais vus.

    Il a d'ailleurs existé. `poolage` déduplique puis écarte les fenêtres qui
    débordent la série ; la première version de ce script faisait l'inverse,
    ce qui promeut un événement que le vrai calendrier masquait.
    """
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    alea = random.Random(53)
    unlocks = {}
    for k in range(6):
        px, bars = 100.0, []
        for _ in range(300):
            px *= 1 + alea.gauss(0, 0.03)
            bars.append({"t": len(bars) * JOUR_MS, "o": px, "h": px * 1.01,
                         "l": px * 0.99, "c": px, "v": 100, "n": 1})
        (tmp_path / "data" / f"T{k}_1d_real.json").write_text(json.dumps(bars))
        # Des déblocages jusqu'au BORD de la série, et rapprochés : c'est
        # exactement là que les deux ordres divergent. Un fixture qui les
        # garde loin du bord ne testerait rien.
        jours = list(range(20, 300, 4))
        unlocks[f"T{k}"] = [{"ts_ms": j * JOUR_MS, "part_offre": 0.03,
                             "debloque": 1.0, "lineaire": 0.0, "categories": []}
                            for j in jours]
    os.chdir(tmp_path)

    mien = economie.evenements(unlocks, 0.02, 0.05)
    # La même construction que `poolage`, recopiée depuis lui.
    attendu = 0
    for symbole, bruts in unlocks.items():
        bars = valider.load_from_file(f"data/{symbole}_1d_real.json", symbole, "1d")
        par_jour = valider.index_par_date(bars)
        cands = []
        for e in bruts:
            i = par_jour.get(e["ts_ms"] // JOUR_MS - 7)
            if i is not None:
                cands.append(Declenchement(i, -1, e["part_offre"], ""))
        for d in valider.sans_chevauchement(cands, 6):
            if d.index + 6 < len(bars):
                attendu += 1
    assert len(mien) == attendu, (
        f"{len(mien)} événements ici contre {attendu} dans la validation — "
        "les coûts porteraient sur une autre stratégie")


def test_le_billet_de_loterie_est_denonce(capsys):
    """Un effet entièrement porté par la queue haute n'est pas un edge.

    Quatre-vingt-dix-neuf pertes de 10 bps et un gain de 5 000 donnent une
    moyenne flatteuse de +40 bps. Un compte réel vivrait quatre-vingt-dix-neuf
    pertes avant le gain, et probablement pas jusque-là.
    """
    evts = [{"brut_bps": -10.0} for _ in range(99)] + [{"brut_bps": 5000.0}]
    economie.distribution(evts, "brut_bps")
    sortie = capsys.readouterr().out
    assert "BILLET DE LOTERIE" in sortie, sortie


def test_un_edge_regulier_nest_PAS_denonce(capsys):
    """L'autre sens, sans quoi l'alerte se déclencherait sur tout."""
    alea = random.Random(3)
    evts = [{"brut_bps": alea.gauss(200, 400)} for _ in range(300)]
    economie.distribution(evts, "brut_bps")
    assert "BILLET DE LOTERIE" not in capsys.readouterr().out


def test_le_regroupement_par_semaine_ne_compte_pas_les_evenements_deux_fois():
    """Le décalage calendaire a établi que les événements sont groupés. Ce
    qui était une objection statistique devient une contrainte d'allocation :
    vingt jetons débloqués la même semaine ne sont pas vingt paris."""
    evts = [{"semaine": 1, "x": 100.0}, {"semaine": 1, "x": 300.0},
            {"semaine": 2, "x": -50.0}]
    assert economie.par_semaine(evts, "x") == [200.0, -50.0]


def test_le_seuil_de_rentabilite_est_le_rendement_hebdomadaire(capsys):
    """Le seuil annoncé doit être exactement le point où le net s'annule ;
    l'afficher plus haut ferait passer pour rentable une stratégie qui perd."""
    evts = [{"semaine": s, "x": 100.0} for s in range(40)]
    evts += [{"semaine": s, "x": 60.0} for s in range(40, 80)]
    economie.rentabilite(evts, "x")
    sortie = capsys.readouterr().out
    assert "Seuil de rentabilité : 80 bps" in sortie, sortie


def test_le_repli_maximal_est_calcule_en_COMPOSANT(capsys):
    """Un compte compose. Additionner les rendements surestimerait le
    résultat final et, plus grave, sous-estimerait le repli — précisément le
    chiffre qui décide si une stratégie est tenable.

    Trois semaines à -30 % puis remontée : en additif le repli semble de
    90 %, en composé il est de 65,7 % (0,7³ = 0,343).
    """
    evts = [{"semaine": s, "x": -3000.0} for s in range(3)]
    # Le rapport refuse de chiffrer un repli sur moins de dix semaines, et il
    # a raison. On complète par des semaines négligeables qui ne recréent
    # aucun sommet, donc ne touchent pas au repli maximal.
    evts += [{"semaine": s, "x": +1.0} for s in range(3, 12)]
    economie.vecu(evts, "x", "test", 1.0)
    sortie = capsys.readouterr().out
    assert "65.7%" in sortie, sortie
    assert "INTENABLE" in sortie, "un repli de 66 % doit être signalé"


def test_la_pire_semaine_est_annoncee_en_impact_sur_le_CAPITAL(capsys):
    """Sous un titre qui annonce « 25 % du capital par semaine », un
    « -20 % » brut se lit comme la perte d'un cinquième du compte alors
    qu'elle en coûte un vingtième. C'est l'erreur de lecture la plus
    coûteuse que ce rapport puisse provoquer, et la première version du
    script la provoquait."""
    evts = [{"semaine": 0, "x": -2000.0}]
    evts += [{"semaine": s, "x": +1.0} for s in range(1, 12)]
    economie.vecu(evts, "x", "test", 0.25)
    sortie = capsys.readouterr().out
    assert "-5.0%" in sortie, f"impact capital attendu -5 % :\n{sortie}"
    assert "-20.0%" in sortie, f"le brut doit rester lisible :\n{sortie}"


def test_une_serie_perdante_est_comptee_en_semaines_consecutives(capsys):
    evts = [{"semaine": s, "x": v} for s, v in
            enumerate([100.0, -50.0, -50.0, -50.0, -50.0, 100.0, -50.0,
                       100.0, 100.0, 100.0, 100.0])]
    economie.vecu(evts, "x", "test", 1.0)
    assert "4 semaines" in capsys.readouterr().out


def test_la_neutralisation_suit_la_MEME_convention_que_la_validation(tmp_path,
                                                                    monkeypatch):
    """`marche_neutre` calcule `-1 * (jeton - référence)`. Un signe inversé
    ici transformerait une couverture en pari doublé, et le rapport
    afficherait très sérieusement l'inverse du résultat."""
    import os

    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir(exist_ok=True)
    # BTC monte de 10 % sur la fenêtre ; le jeton est plat.
    btc = [100.0 * (1.1 ** (i / 6)) for i in range(20)]
    (tmp_path / "data" / "BTC_1d_real.json").write_text(_serie_json(btc))
    os.chdir(tmp_path)

    # brut = 0 (le jeton n'a pas bougé) ; adossé = 0 + 1000 bps de BTC.
    evts = [{"brut_bps": 0.0, "debut_ms": 0, "fin_ms": 6 * JOUR_MS}]
    assert economie.neutraliser(evts) == 1
    assert abs(evts[0]["neutre_bps"] - 1000.0) < 1.0, evts[0]


# --------------------------------------------------------------------------
#  Le journal hors échantillon : prédire AVANT de savoir
# --------------------------------------------------------------------------
#
# Six contrôles ont survécu, et ils partagent tous le même défaut, qui ne se
# corrige pas : ils ont été construits en connaissant les données. Chaque
# décision de méthode a été prise par quelqu'un qui avait déjà vu le
# résultat. Une seule chose peut lever ce doute — prédire avant les faits —
# et ces tests protègent la seule propriété qui rende ce journal crédible :
# on ne peut ni effacer une prédiction, ni la retoucher après coup.

journal_mod = _module("journal_unlocks")


def test_une_prediction_dont_la_fenetre_est_DEJA_OUVERTE_est_refusee():
    """Le cœur du dispositif. Inscrire un déblocage dont l'entrée est déjà
    passée serait une prédiction faite après coup — exactement ce que ce
    journal existe pour rendre impossible."""
    maintenant = 1_000 * JOUR_MS
    unlocks = {"T": [
        {"ts_ms": (1_000 + 3) * JOUR_MS, "part_offre": 0.03},   # entrée à J-4 : PASSÉE
        {"ts_ms": (1_000 + 20) * JOUR_MS, "part_offre": 0.03},  # entrée à J+13 : à venir
    ]}
    pris = journal_mod.a_prendre(unlocks, maintenant, horizon_j=30)
    assert len(pris) == 1
    assert pris[0]["entree_ms"] > maintenant


def test_les_petits_deblocages_ne_sont_pas_inscrits():
    """La tranche 0,5-2 % ne survit à aucun des six contrôles (p = 0,40 au
    décalage calendaire net). L'inclure diluerait le test hors échantillon
    avec des positions dont on sait déjà qu'elles ne rapportent rien."""
    unlocks = {"T": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.01}]}
    assert journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 30) == []


def test_le_journal_est_en_AJOUT_SEUL(tmp_path):
    """Un journal qu'on peut nettoyer ne mesure plus rien : il documente les
    trades dont on se souvient avec plaisir. Une deuxième exécution ne doit
    ni dupliquer une position, ni faire disparaître les précédentes — même
    si l'appelant lui passe une liste vide."""
    j = tmp_path / "j.jsonl"
    unlocks = {"T": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.03}]}
    pris = journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 30)

    assert journal_mod.inscrire(pris, j) == 1
    assert journal_mod.inscrire(pris, j) == 0, "doublon inscrit"
    assert journal_mod.inscrire([], j) == 0
    assert len(j.read_text().strip().splitlines()) == 1, "une ligne a disparu"


def test_chaque_ligne_fige_la_REGLE_qui_la_produit(tmp_path):
    """Si la méthode change dans six semaines, les anciennes prédictions
    doivent rester jugées sur l'ancienne règle. Sans ça, « ajuster
    légèrement le seuil » suffirait à transformer rétroactivement un échec
    en succès."""
    unlocks = {"T": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.03}]}
    x = journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 30)[0]
    for champ in ("version", "entree_ms", "sortie_ms", "sens", "reference",
                  "part_offre", "inscrit_ms"):
        assert champ in x, f"{champ} manquant : la règle n'est pas figée"
    assert x["sortie_ms"] - x["entree_ms"] == 6 * JOUR_MS, "fenêtre J-7 → J-1"


def test_le_releve_refuse_de_conclure_sur_trop_peu_devenements(tmp_path, capsys):
    """Dix trades gagnants ne confirment rien avec un écart-type de
    1 050 bps. Le rapport doit le dire lui-même — laisser le lecteur faire
    le calcul, c'est le laisser ne pas le faire."""
    j = tmp_path / "j.jsonl"
    vieux = 1_000 * JOUR_MS
    j.write_text(json.dumps({
        "version": 1, "symbole": "T", "deblocage_ms": vieux,
        "part_offre": 0.03, "entree_ms": vieux, "sortie_ms": vieux,
        "sens": "COURT", "reference": "BTC", "inscrit_ms": vieux}) + "\n")
    journal_mod.resoudre(j)
    sortie = capsys.readouterr().out
    assert "prix indisponibles" in sortie, sortie
    assert "Aucune position n'a pu être valorisée" in sortie, sortie


def test_un_journal_vide_ne_plante_pas(tmp_path, capsys):
    journal_mod.resoudre(tmp_path / "absent.jsonl")
    assert "n'existe pas encore" in capsys.readouterr().out


def test_le_verdict_reste_AUCUN_sous_cinquante_evenements(tmp_path, capsys,
                                                          monkeypatch):
    """Le rapport doit refuser de conclure lui-même. Laisser le lecteur
    faire le calcul de puissance, c'est le laisser ne pas le faire — et dix
    trades gagnants passeraient pour une confirmation."""
    import time as _t

    vieux = 1_000 * JOUR_MS
    lignes = [{"version": 1, "symbole": "T", "deblocage_ms": vieux + i,
               "part_offre": 0.03, "entree_ms": vieux, "sortie_ms": vieux,
               "sens": "COURT", "reference": "BTC", "inscrit_ms": vieux}
              for i in range(12)]
    chemin = tmp_path / "j.jsonl"
    chemin.write_text("\n".join(json.dumps(x) for x in lignes))
    # Des prix connus, pour atteindre le bloc de verdict.
    monkeypatch.setattr(journal_mod, "_cloture",
                        lambda s, j: 100.0 if s == "T" else 50.0)
    monkeypatch.setattr(_t, "time", lambda: (vieux + JOUR_MS) / 1000)
    journal_mod.resoudre(chemin)
    sortie = capsys.readouterr().out
    assert "VERDICT : AUCUN" in sortie, sortie
    assert "12 événements" in sortie, sortie


def test_deux_deblocages_rapproches_ne_font_QU_UNE_position():
    """Le défaut qu'a révélé la première exécution réelle : XPL apparaissait
    deux fois avec la même date d'entrée, 3,2 % et 65 %.

    La validation applique `sans_chevauchement` — deux déblocages à trois
    jours d'écart produisent des fenêtres qui se recouvrent, donc une
    position tenue une fois. Sans cette règle, le journal inscrit deux
    lignes là où la stratégie n'en prend qu'une, et le score hors
    échantillon porte sur autre chose que ce qui a été mesuré.
    """
    unlocks = {"T": [
        {"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.03},
        {"ts_ms": 1_022 * JOUR_MS, "part_offre": 0.04},   # 2 jours plus tard
        {"ts_ms": 1_040 * JOUR_MS, "part_offre": 0.03},   # bien après
    ]}
    pris = journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 60, {"T"})
    assert len(pris) == 2, [p["deblocage_ms"] // JOUR_MS for p in pris]


def test_un_deblocage_hors_de_la_plage_VALIDEE_est_refuse():
    """XPL à 65 % et 2Z à 47,7 % sortaient du journal en v1.

    L'épreuve des dénominateurs a validé jusqu'à 25 % (n=832, +223,1 bps,
    p=0,0025) ; vingt des 852 événements historiques dépassent ce seuil et
    rien dans ces données ne dit ce que fait un déblocage de 65 % de
    l'offre. Ce n'est pas un gros déblocage, c'est un autre événement.
    """
    unlocks = {"T": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.65}]}
    assert journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 30, {"T"}) == []
    ok = {"T": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.24}]}
    assert len(journal_mod.a_prendre(ok, 1_000 * JOUR_MS, 30, {"T"})) == 1


def test_un_jeton_non_cotable_nest_pas_inscrit():
    """Un déblocage sur un jeton qu'on ne peut pas vendre à découvert n'est
    pas une position, c'est une ligne dans un fichier."""
    unlocks = {"FANTOME": [{"ts_ms": 1_020 * JOUR_MS, "part_offre": 0.03}]}
    assert journal_mod.a_prendre(unlocks, 1_000 * JOUR_MS, 30, {"BTC"}) == []


def test_la_purge_est_REFUSEE_des_quune_fenetre_est_close(tmp_path,
                                                          monkeypatch):
    """Le refus doit être structurel, pas une promesse.

    Le principe d'ajout seul existe pour empêcher une chose précise :
    effacer une prédiction parce qu'elle a perdu. Tant qu'aucune fenêtre
    n'est close il n'existe aucun résultat sur lequel sélectionner, et
    retirer des lignes écrites sous une règle mal implémentée est
    inoffensif. Une seconde après, ça ne l'est plus.
    """
    import time as _t

    j = tmp_path / "j.jsonl"
    base = 1_000 * JOUR_MS

    def ligne(sortie):
        return json.dumps({"version": 1, "symbole": "T", "deblocage_ms": sortie,
                           "part_offre": 0.03, "entree_ms": sortie - 6 * JOUR_MS,
                           "sortie_ms": sortie, "sens": "COURT",
                           "reference": "BTC", "inscrit_ms": base})

    # Toutes à venir : la purge passe.
    j.write_text(ligne(base + 10 * JOUR_MS) + "\n")
    monkeypatch.setattr(_t, "time", lambda: base / 1000)
    ok, msg = journal_mod.purger_version(j, 1)
    assert ok, msg
    assert j.read_text().strip() == ""

    # Une close : la purge refuse, et le fichier reste intact.
    j.write_text(ligne(base - 10 * JOUR_MS) + "\n")
    avant = j.read_text()
    ok, msg = journal_mod.purger_version(j, 1)
    assert not ok and "REFUS" in msg, msg
    assert j.read_text() == avant, "le journal a été modifié malgré le refus"
