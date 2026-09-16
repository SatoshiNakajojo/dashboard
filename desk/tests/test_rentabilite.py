"""Le seuil de rentabilité d'une couche d'IA — une division, pas une opinion.

Ce module ne mesure rien de nouveau : il divise des chiffres déjà mesurés. Son
intérêt est d'empêcher trois façons de se mentir avec cette division.

1. **Composer le rendement sur le mois**, ce qui donnerait un seuil plus
   optimiste que la réalité.
2. **Rendre un seuil fini quand le rendement est nul ou négatif**, ce qui
   laisserait croire qu'un capital suffisant rachète une stratégie qui perd.
3. **Juger un agent sur trop peu de cycles**, ce qui débrancherait un agent
   branché la veille.
"""

from __future__ import annotations

import pytest

from trading_desk import rentabilite as r


def test_le_seuil_repond_a_la_question_posee():
    """« Ça deviendrait rentable qu'à partir de grosses sommes à lui confier. »

    À un cycle par heure, au rendement DÉPLOYÉ, il faut plus de vingt mille
    dollars. À la taille validée, dix fois moins. L'écart entre les deux n'est
    pas une subtilité : c'est le même bloc 3 qui revient, vu par le coût.
    """
    depense = r.capital_seuil_usd(24, r.RENDEMENT_DEPLOYE)
    valide = r.capital_seuil_usd(24, r.RENDEMENT_VALIDE)
    assert 23_000 < depense < 25_000   # mesuré : 23 939 $
    assert 2_800 < valide < 3_100      # mesuré :  2 937 $
    # Le rapport entre les deux seuils est celui des taux MENSUELS, pas des
    # taux annuels : c'est la composition qui les sépare.
    mensuel = lambda a: (1 + a) ** (1 / 12) - 1
    assert depense / valide == pytest.approx(
        mensuel(r.RENDEMENT_VALIDE) / mensuel(r.RENDEMENT_DEPLOYE), rel=1e-9)


def test_le_gain_mensuel_compose():
    """La division naïve `rendement / 12` est fausse, et du mauvais côté.

    À 48 %/an elle rend 4,00 $ par tranche de 100 $ ; le taux qui compose
    réellement à 48 % sur douze mois en rend 3,32. La division naïve
    surestime donc le gain de 20 %, et le seuil de rentabilité d'autant.

    Ce test fige le SENS : le chiffre retenu est celui qui ne pousse pas à
    dépenser.
    """
    retenu = r.gain_mensuel_usd(1000, 0.48)
    naif = 1000 * 0.48 / 12
    assert retenu == pytest.approx(33.21, abs=0.02)
    assert retenu < naif, "l'approximation retenue est la plus prudente"
    # et elle compose bien : douze mois de ce taux rendent le rendement annuel
    assert (1 + retenu / 1000) ** 12 == pytest.approx(1.48, rel=1e-9)


def test_aucun_capital_ne_rachete_un_rendement_nul():
    """Rendre un très grand nombre laisserait croire le contraire."""
    assert r.capital_seuil_usd(24, 0.0) is None
    assert r.capital_seuil_usd(24, -0.10) is None


def test_le_verdict_dit_combien_de_fois_le_cout_depasse_le_gain():
    """Un ratio se retient, une différence non. « Vingt-trois fois le gain »
    tranche une discussion que « −93 $ par mois » laisse ouverte."""
    v = r.juger(1000, cycles_par_jour=24)
    assert v.rentable is False
    assert v.rapport == pytest.approx(v.cout_mensuel_usd / v.gain_mensuel_usd)
    assert "23.9 fois" in v.resume()


def test_un_gain_nul_ne_divise_pas_par_zero():
    v = r.juger(0, cycles_par_jour=24)
    assert v.rapport is None
    assert "déficitaire" in v.resume()


def test_le_desk_devient_rentable_au_dela_du_seuil():
    """La propriété qui relie les deux fonctions : au seuil exact, la marge
    est nulle ; au-dessus, elle est positive. Si elles divergeaient, l'écran
    afficherait un seuil qui ne correspond à aucun verdict."""
    seuil = r.capital_seuil_usd(24, r.RENDEMENT_VALIDE)
    assert r.juger(seuil, cycles_par_jour=24,
                   rendement_annuel=r.RENDEMENT_VALIDE).marge_usd == pytest.approx(0, abs=1e-6)
    assert r.juger(seuil * 1.1, cycles_par_jour=24,
                   rendement_annuel=r.RENDEMENT_VALIDE).rentable is True


def test_une_cadence_negative_leve():
    with pytest.raises(ValueError, match="positifs"):
        r.cout_mensuel_usd(-1)


# ───────────────────────────────────────────────── les agents qui se taisent

def test_un_agent_sans_mandat_est_signale():
    """Les agents du dépôt : 0,1335 $ par cycle, zéro mandat émis."""
    muets = r.agents_muets(
        {"chef": {"appels": 120, "emis": 0, "cout_par_appel": 0.04},
         "scribe": {"appels": 120, "emis": 7, "cout_par_appel": 0.01}},
        cycles=120)
    assert [m["agent"] for m in muets] == ["chef"]
    assert muets[0]["cout_usd"] == pytest.approx(4.8)


def test_un_agent_branche_la_veille_n_est_pas_juge():
    """Le seuil de cycles existe pour ça, et il est le seul garde-fou contre
    une règle mécanique qui couperait trop tôt."""
    agents = {"chef": {"appels": 3, "emis": 0, "cout_par_appel": 0.04}}
    assert r.agents_muets(agents, cycles=3) == []
    assert r.agents_muets(agents, cycles=3, minimum_cycles=2) != []


def test_un_agent_jamais_appele_n_est_pas_muet():
    """Zéro appel et zéro mandat, c'est un agent débranché, pas un agent qui
    coûte. Le confondre ferait « débrancher » ce qui l'est déjà, et gonflerait
    la liste de faux positifs qu'on apprendrait à ignorer."""
    assert r.agents_muets({"dormeur": {"appels": 0, "emis": 0}}, cycles=200) == []
