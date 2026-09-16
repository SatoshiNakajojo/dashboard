"""La poussée — un compteur qui doit rester un instrument, pas un jeu vidéo.

Le risque de cette idée n'est pas qu'elle soit inutile, c'est qu'elle soit
flatteuse. Un compteur qui afficherait ce que le desk *aurait* parcouru à
pleine taille donnerait la satisfaction sans le résultat, ce qui est
exactement l'inverse de ce qu'on veut d'un instrument.

Trois verrous, donc :

1. la distance est le PnL **réalisé**, jamais une projection ;
2. l'indisponible reste indisponible — pas de zéro consolant ;
3. une perte recule le vaisseau.
"""

from __future__ import annotations

import pytest

from trading_desk import poussee as p


def test_l_echelle_cale_un_tour_sur_une_annee_a_la_taille_validee():
    """L'unité n'est pas arbitraire, et c'est ce qui la rend lisible.

    40 075 km pour les 480 $ qu'une année à 48 %/an rapporte sur 1 000 $.
    """
    r = p.reperes()
    assert r["tours_par_an_validee"] == pytest.approx(1.0)
    assert r["km_par_dollar"] == pytest.approx(83.49, abs=0.01)


def test_l_ecart_de_taille_devient_visible():
    """**Ce pour quoi le panneau existe.**

    À la taille déployée, une année entière fait un dixième de tour. L'écart
    du bloc 3 cesse d'être une ligne dans un tableau.
    """
    r = p.reperes()
    assert r["tours_par_an_deployee"] == pytest.approx(0.104, abs=0.002)
    facteur = r["tours_par_an_validee"] / r["tours_par_an_deployee"]
    assert facteur == pytest.approx(9.6, abs=0.2), (
        "le rapport des rendements mesurés, 48 % contre 5 %")


def test_un_pnl_indisponible_ne_devient_pas_zero():
    """Position ouverte, le cumul de trésorerie mélange du réalisé et du coût
    d'entrée. L'afficher comme une distance ferait reculer le vaisseau à
    chaque ouverture, puis avancer à chaque fermeture — un compteur qui
    oscille avec les entrées ne mesure pas la performance."""
    assert p.etat(None, 30) is None


def test_une_perte_recule_le_vaisseau():
    """Un compteur qui ne saurait qu'avancer serait un jeu vidéo."""
    e = p.etat(-20.0, 10)
    assert e.distance_km < 0
    assert e.km_par_jour < 0
    assert e.jours_avant_le_prochain_tour is None, (
        "un vaisseau qui recule n'arrive nulle part")


def test_un_desk_a_l_arret_n_arrive_jamais():
    """None, et non un très grand nombre.

    Un très grand nombre laisserait croire à une progression lente ; un desk à
    l'arrêt n'arrivera pas, ce qui n'est pas la même chose.
    """
    assert p.etat(0.0, 30).jours_avant_le_prochain_tour is None


def test_les_tours_et_la_fraction_se_recomposent():
    """La propriété qui garde l'affichage honnête : tours + fraction doivent
    redonner la distance, sinon l'écran raconte deux choses."""
    e = p.etat(1000.0, 100)
    reconstruit = (e.tours + e.fraction_tour) * p.CIRCONFERENCE_KM
    assert reconstruit == pytest.approx(e.distance_km, rel=1e-9)


def test_la_distance_est_lineaire_dans_le_pnl():
    """Aucun effet de seuil, aucun bonus. Deux fois le gain, deux fois la
    distance — sinon le compteur raconterait autre chose que le PnL."""
    assert p.distance_km(50.0) == pytest.approx(2 * p.distance_km(25.0))


def test_le_module_ne_touche_a_rien():
    """Il lit un cumul et le divise. Aucun ordre, aucun état."""
    import inspect
    src = inspect.getsource(p)
    for interdit in ("order", "flatten", "submit", "exchange", "Intention"):
        assert interdit not in src, f"{interdit} n'a rien à faire ici"
