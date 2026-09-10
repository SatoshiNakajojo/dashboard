"""Les déclencheurs et leur validation.

Deux familles de garanties, et la première est la plus importante : **un
déclencheur qui verrait le futur fabriquerait un edge inexistant**, que la
validation mesurerait consciencieusement avant que le desk ne se réveille en
retard sur du vide en direct.
"""

from __future__ import annotations

import random as _random
from decimal import Decimal

import pytest

from trading_desk.features.bars import Bar
from trading_desk.sentinelle.triggers import (
    Declenchement,
    cascade_liquidations,
    deblocage_annonce,
    funding_extreme,
    pic_de_volume,
    rupture_volatilite,
)
from trading_desk.sentinelle.validation import (
    benjamini_hochberg,
    evaluer,
    sans_chevauchement,
)


def _bar(i, o, h, low, c, vol=100.0):
    return Bar(asset="BTC", ts_ms=i * 3_600_000, open=Decimal(str(o)),
               high=Decimal(str(h)), low=Decimal(str(low)),
               close=Decimal(str(c)), volume=Decimal(str(vol)))


def _serie_calme(n=400, prix=100.0, vol=100.0):
    """Série sans anomalie — mais avec un volume qui VARIE.

    Un volume constant donne un écart-type nul, donc un z-score indéfini :
    `_zscore_glissant` renvoie `None` et aucun déclencheur ne peut se
    déclencher. C'est le comportement correct du code — on ne normalise pas
    par zéro — mais ça fait d'un fixture constant un test qui ne teste rien.
    """
    alea = _random.Random(1)
    return [_bar(i, prix, prix + 1, prix - 1, prix,
                 vol * (0.8 + 0.4 * alea.random()))
            for i in range(n)]


# --------------------------------------------------------------------------
#  Aucun regard vers le futur
# --------------------------------------------------------------------------

@pytest.mark.parametrize("fonction", [
    pic_de_volume, cascade_liquidations, rupture_volatilite,
])
def test_un_declencheur_ne_lit_jamais_les_barres_suivantes(fonction):
    """La garantie centrale, testée par troncature.

    Les déclenchements calculés sur la série complète, jusqu'à l'indice `k`,
    doivent être identiques à ceux calculés sur la série tronquée à `k`. Si
    ce n'est pas le cas, la fonction lit l'avenir.
    """
    bars = _serie_calme(300)
    for i in (100, 150, 151, 200):          # quelques anomalies
        bars[i] = _bar(i, 100, 130, 70, 128, vol=5000.0)

    k = 220
    complets = [d.index for d in fonction(bars) if d.index < k]
    tronques = [d.index for d in fonction(bars[:k])]
    assert complets == tronques, f"{fonction.__name__} voit le futur"


def test_le_funding_refuse_un_alignement_approximatif():
    """Aligner « au mieux » ferait lire le funding d'une autre heure — une
    erreur invisible qui décalerait tous les déclenchements."""
    bars = _serie_calme(100)
    with pytest.raises(ValueError, match="desaligne"):
        funding_extreme(bars, [0.0] * 99)


# --------------------------------------------------------------------------
#  Chaque déclencheur détecte ce qu'il prétend détecter
# --------------------------------------------------------------------------

def test_le_pic_de_volume_ignore_un_marche_calme():
    assert pic_de_volume(_serie_calme(400)) == []


def test_le_pic_de_volume_voit_un_pic():
    bars = _serie_calme(400)
    bars[300] = _bar(300, 100, 102, 99, 101, vol=10_000.0)
    trouves = pic_de_volume(bars)
    assert [d.index for d in trouves] == [300]
    assert trouves[0].sens == 1, "clôture au-dessus de l'ouverture : continuation haussière"


def test_la_cascade_exige_les_trois_conditions_ensemble():
    """Range extrême SANS volume extrême n'est pas une cascade — c'est une
    bougie large, et il y en a des centaines."""
    bars = _serie_calme(400)
    bars[300] = _bar(300, 100, 140, 60, 135, vol=100.0)     # range seul
    assert cascade_liquidations(bars) == []
    bars[300] = _bar(300, 100, 140, 60, 135, vol=10_000.0)  # + volume
    assert [d.index for d in cascade_liquidations(bars)] == [300]


def test_la_cascade_est_contrarienne_au_rejet_de_meche():
    """Mèche basse rejetée — les vendeurs forcés ont été absorbés — donc
    rebond attendu. C'est l'hypothèse du document, et c'est elle qu'on teste."""
    bars = _serie_calme(400)
    bars[300] = _bar(300, 100, 140, 60, 135, vol=10_000.0)   # clôture en haut
    assert cascade_liquidations(bars)[0].sens == 1
    bars[300] = _bar(300, 100, 140, 60, 65, vol=10_000.0)    # clôture en bas
    assert cascade_liquidations(bars)[0].sens == -1


def test_une_cloture_au_milieu_ne_declenche_aucune_cascade():
    """Aucun rejet, donc aucune hypothèse directionnelle à formuler."""
    bars = _serie_calme(400)
    bars[300] = _bar(300, 100, 140, 60, 100, vol=10_000.0)
    assert cascade_liquidations(bars) == []


def _marche(n, vol_pct, graine=0, depart=100.0):
    """Marche aléatoire de volatilité donnée.

    Les fixtures à prix constant ont une variance NULLE : la volatilité vaut
    zéro, les indices sont écartés, et le test ne teste rien. Les fixtures à
    dérive linéaire sont pires — leurs ratios croissent de façon monotone et
    tout dépassement de centile est trivialement vrai. Il faut du vrai bruit.
    """
    import random as _r
    alea = _r.Random(graine)
    px, out = depart, []
    for i in range(n):
        px *= 1 + alea.gauss(0, vol_pct)
        out.append(_bar(i, px, px * 1.002, px * 0.998, px))
    return out


def test_le_seuil_au_centile_se_declenche_au_taux_annonce():
    """La contrepartie assumée du passage au centile.

    Un seuil au centile se déclenche PAR CONSTRUCTION sur une fraction fixe
    des barres, marché calme ou non. Il ne répond plus à « une rupture a-t-elle
    eu lieu » mais à « celle-ci est-elle parmi les plus fortes récemment ».
    Pour une Sentinelle dont le budget de réveils doit être prévisible, c'est
    un avantage — mais il faut le savoir, et un test qui prétendrait le
    contraire mentirait.
    """
    bars = _marche(2000, 0.005, graine=4)
    n = len(rupture_volatilite(bars, centile=0.95))
    eligibles = len(bars) - 2 * 168
    assert 0.01 <= n / eligibles <= 0.15, f"{n} sur {eligibles} éligibles"


def test_le_chauffage_du_centile_glissant_est_de_deux_fenetres():
    """Il faut `longue` ratios pour former le premier seuil, et chaque ratio
    demande `longue` barres."""
    bars = [_bar(i, 100, 101, 99, 100 + (1 if i % 3 else -1)) for i in range(400)]
    assert all(d.index >= 2 * 168 for d in rupture_volatilite(bars))


def test_le_seuil_absolu_dorigine_reste_reproductible():
    """Le seuil de 2,5 issu de la littérature était inatteignable — ratio
    maximum mesuré 2,38 sur les sept actifs. Le garder accessible permet de
    rejouer la campagne d'origine et de vérifier ce constat."""
    calme = [_bar(i, 100, 100.5, 99.5, 100) for i in range(300)]
    agite = [_bar(300 + i, 100, 110, 90, 100 + (8 if i % 2 else -8))
             for i in range(60)]
    assert rupture_volatilite(calme + agite, ratio=2.5) != []
    assert rupture_volatilite(calme + agite, ratio=99.0) == []


def test_la_rupture_de_volatilite_detecte_la_BASCULE_pas_le_regime():
    """Ce qu'un centile glissant promet réellement, et sa limite.

    Il compare la volatilité récente à sa propre histoire récente. Quand un
    régime agité PERSISTE, il remplit la fenêtre de référence et **devient la
    norme** : le déclencheur se tait alors, même si le marché reste agité.

    Mesure sur ce fixture : les déclenchements s'arrêtent 25 barres après la
    bascule. C'est une propriété, pas un défaut — une Sentinelle doit
    réveiller le desk quand quelque chose CHANGE, pas répéter l'alerte pendant
    trois jours. Mais un test qui prétendrait « il détecte les marchés
    agités » décrirait autre chose que ce que fait le code.
    """
    calme = _marche(900, 0.002, graine=5)
    agite_brut = _marche(300, 0.020, graine=6, depart=float(calme[-1].close))
    agite = [_bar(900 + i, float(b.open), float(b.high), float(b.low),
                  float(b.close)) for i, b in enumerate(agite_brut)]
    trouves = rupture_volatilite(calme + agite)
    assert trouves, "une bascule franche doit se voir"

    bascule = [d for d in trouves if 900 <= d.index < 950]
    densite_bascule = len(bascule) / 50
    densite_globale = len(trouves) / (1200 - 2 * 168)
    assert densite_bascule > 3 * densite_globale, (
        f"densité à la bascule {densite_bascule:.2f} contre "
        f"{densite_globale:.2f} en moyenne — aucune concentration")


def test_le_funding_extreme_est_contrarien():
    bars = _serie_calme(1000)
    funding = [0.00001] * 800 + [0.002] * 200      # explosion du funding
    trouves = funding_extreme(bars, funding)
    assert trouves, "un funding qui explose doit déclencher"
    assert all(d.sens == -1 for d in trouves), \
        "funding positif = longs surchargés = baisse attendue"


def test_un_declencheur_sans_volume_ne_declenche_jamais():
    """Substituer le range au volume serait une erreur silencieuse : un pic
    de range n'est pas un pic de volume."""
    sans_vol = [Bar(asset="BTC", ts_ms=i * 3_600_000, open=Decimal("100"),
                    high=Decimal("101"), low=Decimal("99"), close=Decimal("100"))
                for i in range(400)]
    assert pic_de_volume(sans_vol) == []
    assert cascade_liquidations(sans_vol) == []


# --------------------------------------------------------------------------
#  Validation : les biais qui gonflent la significativité
# --------------------------------------------------------------------------

def test_le_refroidissement_supprime_les_fenetres_qui_se_chevauchent():
    """Des barres consécutives donnent des rendements presque identiques à
    horizon H. Les compter comme indépendantes divise artificiellement
    l'écart-type, donc gonfle la significativité."""
    grappe = [Declenchement(i, 1, 1.0, "") for i in range(100, 110)]
    assert [d.index for d in sans_chevauchement(grappe, horizon=4)] == [100, 104, 108]
    assert len(sans_chevauchement(grappe, horizon=1)) == 10


def test_le_refroidissement_garde_le_premier_pas_le_plus_fort():
    """Choisir le plus fort trierait sur une intensité dont on n'a pas montré
    qu'elle prédit quoi que ce soit — un tri rétrospectif."""
    grappe = [Declenchement(100, 1, 1.0, "faible"),
              Declenchement(101, 1, 99.0, "fort")]
    gardes = sans_chevauchement(grappe, horizon=10)
    assert [d.motif for d in gardes] == ["faible"]


def test_un_echantillon_trop_court_ne_produit_aucun_resultat():
    bars = _serie_calme(300)
    peu = [Declenchement(i, 1, 1.0, "") for i in range(100, 105)]
    assert evaluer(bars, peu, horizon=4, horizon_libelle="4h",
                   declencheur="t", actif="BTC", intervalle="1h") is None


def test_les_evenements_trop_proches_de_la_fin_sont_ecartes():
    """Les tronquer les ferait paraître neutres et tirerait la moyenne vers
    zéro."""
    bars = _serie_calme(200)
    tardifs = [Declenchement(i, 1, 1.0, "") for i in range(190, 200)]
    assert evaluer(bars, tardifs, horizon=50, horizon_libelle="50h",
                   declencheur="t", actif="BTC", intervalle="1h") is None


def test_un_declencheur_sans_pouvoir_predictif_ne_bat_pas_le_hasard():
    """Sur une marche aléatoire, aucun déclencheur ne doit ressortir.

    Si ce test échoue, la validation fabrique de la significativité — et tout
    résultat positif qu'elle produirait serait sans valeur.
    """
    import random as _r
    alea = _r.Random(3)
    px, bars = 100.0, []
    for i in range(3000):
        px *= 1 + alea.gauss(0, 0.01)
        bars.append(_bar(i, px, px * 1.005, px * 0.995, px))
    quelconques = [Declenchement(i, 1 if alea.random() > 0.5 else -1, 1.0, "")
                   for i in range(200, 2800, 30)]
    r = evaluer(bars, quelconques, horizon=4, horizon_libelle="4h",
                declencheur="hasard", actif="BTC", intervalle="1h", tirages=500)
    assert r is not None
    assert r.p_direction > 0.05, f"p={r.p_direction:.3f} sur du bruit pur"


def test_benjamini_hochberg_est_un_pas_montant():
    assert benjamini_hochberg([0.001, 0.9, 0.9, 0.9]) == [True, False, False, False]
    assert benjamini_hochberg([0.03, 0.04]) == [True, True]
    assert benjamini_hochberg([0.06] * 10) == [False] * 10


# --------------------------------------------------------------------------
#  Le déclencheur de déblocage : le seul dont l'edge directionnel est mesuré
# --------------------------------------------------------------------------
#
# Les quatre autres réveillent sur une condition de prix, et aucun ne prédit
# le SENS (0 survivant sur 98 cellules). Celui-ci réveille sur un calendrier
# public, et son edge a survécu à six contrôles. Ces tests protègent la
# seule chose qui rende ce déclencheur légitime : il porte exactement les
# bornes qui ont été validées, et pas un pouce de plus.

JOUR_MS_ = 86_400_000


def _serie_jours(n=120):
    return [Bar(asset="T", ts_ms=i * JOUR_MS_, open=Decimal("100"),
                high=Decimal("101"), low=Decimal("99"), close=Decimal("100"),
                volume=Decimal("10"))
            for i in range(n)]


def test_le_reveil_tombe_SEPT_JOURS_avant_le_deblocage():
    """La fenêtre d'anticipation J-7/J-1 est la seule des quatre testées qui
    survive. Un réveil au jour du déblocage mesurerait la fenêtre d'impact,
    dont le pooling donne p = 0,85."""
    bars = _serie_jours()
    d = deblocage_annonce(bars, deblocages=[
        {"ts_ms": 50 * JOUR_MS_, "part_offre": 0.03}])
    assert len(d) == 1
    assert d[0].index == 43, "le réveil doit précéder le déblocage de 7 jours"
    assert d[0].sens == -1, "l'hypothèse est baissière, posée d'avance"


def test_les_bornes_de_taille_sont_celles_qui_ont_ete_VALIDEES():
    """Ce ne sont pas des réglages, ce sont les limites du domaine mesuré.

    En dessous de 2 %, aucun contrôle ne survit (p = 0,40 au décalage
    calendaire net). Au-dessus de 25 %, on sort de la borne la plus serrée
    qu'ait validée l'épreuve des dénominateurs — un déblocage de 65 % de
    l'offre n'est pas un gros déblocage, c'est un autre événement.
    """
    bars = _serie_jours()
    for part, attendu in ((0.01, 0), (0.02, 1), (0.24, 1), (0.25, 0), (0.65, 0)):
        d = deblocage_annonce(bars, deblocages=[
            {"ts_ms": 50 * JOUR_MS_, "part_offre": part}])
        assert len(d) == attendu, f"part {part:.0%} : {len(d)} réveil(s)"


def test_deux_deblocages_rapproches_ne_reveillent_QU_UNE_fois():
    """Deux déblocages à trois jours d'écart produisent des fenêtres qui se
    recouvrent, donc une position tenue une fois. La validation applique la
    même règle ; s'en écarter ici mesurerait une autre stratégie."""
    bars = _serie_jours()
    d = deblocage_annonce(bars, deblocages=[
        {"ts_ms": 50 * JOUR_MS_, "part_offre": 0.03},
        {"ts_ms": 53 * JOUR_MS_, "part_offre": 0.04},
        {"ts_ms": 70 * JOUR_MS_, "part_offre": 0.03},
    ])
    assert [x.index for x in d] == [43, 63]


def test_le_declencheur_de_deblocage_ne_lit_aucun_prix_futur():
    """La frontière exacte de ce déclencheur.

    Il lit un calendrier qui contient des dates postérieures à `i`, et c'est
    légitime : ce calendrier est PUBLIC au moment `i`, DefiLlama le publie
    des mois à l'avance. Ce qu'il ne doit jamais lire, c'est un PRIX
    postérieur à `i`.

    Tronquer la série après le réveil ne doit donc rien changer à ce réveil.
    """
    complet = _serie_jours(120)
    deblocages = [{"ts_ms": 50 * JOUR_MS_, "part_offre": 0.03}]
    plein = deblocage_annonce(complet, deblocages=deblocages)
    # On coupe juste après le réveil, bien avant le déblocage lui-même.
    tronque = deblocage_annonce(complet[:44], deblocages=deblocages)
    assert [x.index for x in plein] == [x.index for x in tronque] == [43]


def test_un_deblocage_sans_barre_a_J_moins_7_est_ecarte():
    """Prendre la barre la plus proche décalerait l'événement, et un
    décalage d'un jour sur un événement daté détruit ce qu'on mesure."""
    bars = _serie_jours(120)
    assert deblocage_annonce(bars, deblocages=[
        {"ts_ms": 3 * JOUR_MS_, "part_offre": 0.03}]) == []
    assert deblocage_annonce(bars, deblocages=[
        {"ts_ms": 500 * JOUR_MS_, "part_offre": 0.03}]) == []


def test_une_entree_malformee_ne_leve_jamais():
    """Le calendrier vient d'une source externe. Le desk doit l'écarter, pas
    tomber au milieu d'un cycle de décision."""
    bars = _serie_jours()
    assert deblocage_annonce(bars, deblocages=[]) == []
    assert deblocage_annonce(bars, deblocages=[
        {"ts_ms": 50 * JOUR_MS_}]) == [], "part_offre absente => écarté"
