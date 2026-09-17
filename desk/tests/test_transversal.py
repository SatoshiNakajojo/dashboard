"""« Tient sur trois actifs » — trois façons de le dire faux.

Ce module de test protège une phrase, parce que c'est une phrase qui a menti
pendant des semaines à l'écran : la bibliothèque affichait « tient sur 3
actifs » pour une recette qui avait été ESSAYÉE sur trois actifs et refusée
sur les trois, et lui donnait un point de rareté pour ça.

Les trois façons de la rendre fausse à nouveau, et les tests qui les ferment :

1. **Compter les essais au lieu des réussites.** C'est la faute d'origine, et
   son sens est le pire possible : elle récompensait le fait d'avoir essayé
   davantage.
2. **Compter les actifs au lieu des marchés.** Vingt-huit perps crypto ne font
   pas vingt-huit marchés. BTC, ETH et SOL en font 1,5.
3. **Aligner les séries par position au lieu du temps.** Deux actifs n'ont pas
   les mêmes barres manquantes ; aligner par index décale silencieusement les
   séries, ce qui BAISSE les corrélations et donc GONFLE le nombre de
   marchés — l'erreur dans le sens qui flatte.
"""

from __future__ import annotations

import math

import pytest

from trading_desk import transversal as tr


class Barre:
    """Le minimum qu'attend `rendements` : un horodatage et une clôture."""

    def __init__(self, ts_ms: int, close: float):
        self.ts_ms, self.close = ts_ms, close


def serie(valeurs, depart=1_000_000, pas=86_400_000):
    return [Barre(depart + i * pas, v) for i, v in enumerate(valeurs)]


def lien_de(series: dict[str, list[float]]) -> tr.Lien:
    return tr.correlations({a: tr.rendements(serie(v)) for a, v in series.items()})


# ────────────────────────────────────────── le nombre effectif de marchés

def test_des_actifs_parfaitement_correles_font_un_seul_marche():
    """La borne basse. Trois copies du même marché sont un marché."""
    base = [100.0 * (1.0 + 0.01 * math.sin(i)) for i in range(200)]
    lien = lien_de({"A": base, "B": base, "C": base})
    assert tr.marches_effectifs(lien) == pytest.approx(1.0, abs=1e-6)


def test_des_actifs_independants_font_autant_de_marches_qu_il_y_en_a():
    """La borne haute, approchée : des marches pseudo-aléatoires décorrélées."""
    import random
    rng = random.Random(7)
    series = {}
    for nom in ("A", "B", "C", "D"):
        cours, valeurs = 100.0, []
        for _ in range(4000):
            cours *= math.exp(rng.gauss(0, 0.02))
            valeurs.append(cours)
        series[nom] = valeurs
    m = tr.marches_effectifs(lien_de(series))
    assert 3.5 < m <= 4.0, f"quatre séries indépendantes doivent rendre ~4, rendu {m}"


def test_une_correlation_partielle_tombe_entre_les_deux():
    import random
    rng = random.Random(11)
    commun = [rng.gauss(0, 0.02) for _ in range(3000)]
    series = {}
    for nom in ("A", "B", "C"):
        cours, valeurs = 100.0, []
        for r in commun:
            cours *= math.exp(0.8 * r + 0.6 * rng.gauss(0, 0.02))
            valeurs.append(cours)
        series[nom] = valeurs
    m = tr.marches_effectifs(lien_de(series))
    assert 1.0 < m < 3.0


def test_un_recouvrement_trop_court_ne_rend_pas_un_nombre():
    """« Je ne sais pas combien de marchés » et « il n'y en a qu'un » sont deux
    affirmations différentes. Les confondre rendrait le contrôle inerte."""
    lien = lien_de({"A": [100.0, 101.0, 102.0], "B": [50.0, 51.0, 52.0]})
    assert not lien.mesurable
    assert tr.marches_effectifs(lien) is None
    assert "barres communes" in lien.motif


def test_une_serie_plate_compte_comme_correlee_pas_comme_independante():
    """Une paire sans corrélation définie comptée 0 gonflerait le nombre de
    marchés. On la compte 1 — le sens qui refuse."""
    bouge = [100.0 * (1.01 ** i) for i in range(200)]
    plate = [100.0] * 200
    lien = lien_de({"A": bouge, "B": plate})
    assert lien.matrice[0][1] == 1.0
    assert tr.marches_effectifs(lien) == pytest.approx(1.0, abs=1e-9)


def test_les_series_sont_alignees_sur_le_TEMPS_pas_sur_la_position():
    """Le troisième piège. B a un trou ; aligné par index il serait décalé
    d'une barre, ce qui casserait la corrélation et gonflerait le nombre de
    marchés."""
    valeurs = [100.0 * (1.0 + 0.02 * math.sin(i)) for i in range(300)]
    a = serie(valeurs)
    b = [x for i, x in enumerate(serie(valeurs)) if i != 150]
    lien = tr.correlations({"A": tr.rendements(a), "B": tr.rendements(b)})
    # Les rendements partagés sont identiques : la corrélation doit valoir 1.
    assert lien.matrice[0][1] == pytest.approx(1.0, abs=1e-9)
    assert tr.marches_effectifs(lien) == pytest.approx(1.0, abs=1e-9)


def test_le_lien_d_un_panier_vide_n_est_pas_mesurable():
    assert tr.marches_effectifs(tr.correlations({})) is None


# ──────────────────────────────────────────────── la tenue d'une recette

def essai(actif, signature, strategie="ema_cross", intervalle="1d",
          parametres=None):
    return {"signature": signature, "strategie": strategie, "actif": actif,
            "intervalle": intervalle, "parametres": parametres or {"fast": 20}}


def test_la_tenue_compte_les_RETENUS_pas_les_essayes():
    """LE test de ce module. Essayer n'est pas réussir."""
    essais = [essai("BTC", "a"), essai("ETH", "b"), essai("SOL", "c")]
    verdicts = {"a": "REFUSEE", "b": "REFUSEE", "c": "REFUSEE"}
    t = tr.tenue(essais, strategie="ema_cross", parametres={"fast": 20},
                 intervalle="1d", verdicts=verdicts)
    assert len(t.essayes) == 3
    assert t.retenus == ()
    assert t.effectifs is None
    assert "tient sur" not in t.phrase
    assert "retenue sur aucun" in t.phrase


def test_un_seul_actif_retenu_ne_donne_pas_de_nombre_de_marches():
    essais = [essai("BTC", "a"), essai("ETH", "b")]
    t = tr.tenue(essais, strategie="ema_cross", parametres={"fast": 20},
                 intervalle="1d", verdicts={"a": "RETENUE", "b": "REFUSEE"})
    assert t.retenus == ("BTC",)
    assert t.effectifs is None
    assert "moins de deux actifs retenus" in t.motif_effectifs


def test_la_tenue_ne_melange_pas_les_echelles():
    """Une règle en 1 j et la même en 4 h sont deux affirmations."""
    essais = [essai("BTC", "a", intervalle="1d"),
              essai("ETH", "b", intervalle="4h")]
    t = tr.tenue(essais, strategie="ema_cross", parametres={"fast": 20},
                 intervalle="1d", verdicts={"a": "RETENUE", "b": "RETENUE"})
    assert t.essayes == ("BTC",)


def test_la_tenue_ne_melange_pas_les_reglages():
    essais = [essai("BTC", "a", parametres={"fast": 20}),
              essai("ETH", "b", parametres={"fast": 50})]
    t = tr.tenue(essais, strategie="ema_cross", parametres={"fast": 20},
                 intervalle="1d", verdicts={"a": "RETENUE", "b": "RETENUE"})
    assert t.essayes == ("BTC",)


def test_la_phrase_dit_les_deux_nombres_quand_ils_existent():
    t = tr.Tenue(essayes=("BTC", "ETH", "SOL"), retenus=("BTC", "ETH"),
                 effectifs=1.4)
    assert "2 actif(s) sur 3 essayé(s)" in t.phrase
    assert "1.4 marché(s) indépendant(s)" in t.phrase


# ─────────────────────────────────────── ce que dit la donnée reelle

def test_btc_eth_sol_ne_font_pas_trois_marches():
    """Le chiffre qui justifie tout ce module, sur l'historique du dépôt."""
    lien = tr.lien_des_actifs(["BTC", "ETH", "SOL"], "1d")
    if not lien.mesurable:
        pytest.skip(f"données absentes : {lien.motif}")
    m = tr.marches_effectifs(lien)
    assert 1.0 < m < 2.0, (
        f"trois perps crypto doivent rendre nettement moins de 3 marchés, "
        f"rendu {m:.2f}")


# ────────────────────────────────────────────────────────────── la coupe

def cellule(actif, p, signature=None, strategie="ema_cross", intervalle="1d"):
    return {"signature": signature or f"s{actif}", "strategie": strategie,
            "actif": actif, "intervalle": intervalle, "origine": "balayage",
            "parametres": {"fast": 20}, "p": p, "tirages": 2000}


def test_la_coupe_dit_toujours_ce_que_le_hasard_donnerait():
    """Le chiffre à lire À CÔTÉ des survivantes, jamais après.

    « Six cellules sous alpha » sur cent quarante n'est pas une trouvaille :
    c'est moins que les sept attendues.
    """
    lignes = [cellule(f"A{i}", 0.04) for i in range(140)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.familles == 140
    assert c.attendu_au_hasard == pytest.approx(7.0)
    assert "hasard en donnerait 7.0" in c.phrase


def test_passer_ensemble_est_bien_plus_facile_que_passer_seul():
    """La propriété entière de la recherche transversale, en un test.

    Le MÊME p de 0,04 : rejeté quand la cellule est seule parmi vingt, retenu
    quand les vingt le portent. Au rang 1 le seuil vaut alpha/20 = 0,0025 ;
    au rang 16 il vaut déjà 0,04, et Benjamini-Hochberg garde tout jusqu'au
    dernier rang validé.

    Ce n'est pas un relâchement : vingt cellules à p = 0,04 quand le hasard
    n'en donnerait qu'une, c'est un excès massif, et le taux de fausses
    découvertes reste borné par alpha.
    """
    seule = [cellule("BTC", 0.04)] + [cellule(f"X{i}", 0.7) for i in range(19)]
    c = tr.coupe(seule, strategie="ema_cross", intervalle="1d")
    assert c.sous_alpha == 1
    assert c.survivantes == (), "seule à 0,04 parmi vingt : sous alpha/20"

    ensemble = [cellule(f"A{i}", 0.04) for i in range(20)]
    c = tr.coupe(ensemble, strategie="ema_cross", intervalle="1d")
    assert c.sous_alpha == 20
    assert len(c.survivantes) == 20, (
        "vingt cellules au même p se portent l'une l'autre — c'est pour ça "
        "qu'on cherche des règles qui tiennent sur plusieurs marchés")


def test_des_p_franchement_bas_survivent_ensemble():
    """La propriété qui justifie la recherche transversale."""
    lignes = [cellule(a, 0.0005) for a in ("BTC", "ETH", "SOL", "AVAX")]
    lignes += [cellule(f"X{i}", 0.6) for i in range(16)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert set(c.survivantes) >= {"BTC", "ETH", "SOL", "AVAX"}


def test_une_seule_survivante_ne_donne_pas_de_nombre_de_marches():
    lignes = [cellule("BTC", 0.0001)] + [cellule(f"X{i}", 0.7) for i in range(9)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.survivantes == ("BTC",)
    assert c.marches is None
    assert "non mesurés" in c.phrase


def test_une_coupe_vide_ne_conclut_rien():
    c = tr.coupe([], strategie="ema_cross", intervalle="1d")
    assert c.familles == 0
    assert c.phrase == "aucune cellule mesurée"


def test_la_coupe_ne_melange_pas_les_echelles():
    lignes = [cellule("BTC", 0.001, intervalle="1d"),
              cellule("ETH", 0.001, signature="eth4h", intervalle="4h")]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.familles == 1


def test_les_cellules_sans_p_n_entrent_pas_dans_la_coupe():
    """Une cellule sans trade n'est pas une hypothèse : la compter gonflerait
    le dénominateur avec du vide, et l'attendu du hasard avec."""
    lignes = [cellule("BTC", 0.001), cellule("ETH", None)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.familles == 1


def test_la_coupe_dit_combien_de_cellules_sous_alpha_sont_maigres():
    """« Cinq sous alpha » se lit comme une trouvaille ; « dont cinq sur moins
    de trente aller-retours » se lit comme ce que c'est.

    Mesuré sur le balayage turtle du 17 septembre 2026 : les cinq familles
    sous alpha tenaient toutes à moins de trente aller-retours — une à un seul.
    Elles restent dans m, parce qu'elles ONT été testées ; les en retirer
    rendrait la correction plus laxiste.
    """
    lignes = [dict(cellule("UNIBOT", 0.004), trades=1),
              dict(cellule("JTO", 0.03), trades=3),
              dict(cellule("BTC", 0.01), trades=58)]
    lignes += [dict(cellule(f"X{i}", 0.8), trades=50) for i in range(9)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.familles == 12, "les maigres comptent dans le dénominateur"
    assert c.sous_alpha == 3
    assert set(c.maigres) == {"UNIBOT", "JTO"}
    assert "dont 2 sur moins de 30 aller-retours" in c.phrase


def test_une_coupe_sans_maigre_ne_mentionne_pas_les_aller_retours():
    lignes = [dict(cellule(f"X{i}", 0.001), trades=80) for i in range(5)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.maigres == ()
    assert "aller-retours" not in c.phrase


def test_une_survivante_n_est_pas_une_candidate():
    """LE test de la coupe, et il vient d'une vraie mesure.

    Balayage tsmom du 17 septembre 2026, 25 actifs en 1 j : QUINZE survivaient
    ensemble à Benjamini-Hochberg, et l'épreuve les refusait tous les quinze —
    onze pour moins de trente aller-retours, deux au plancher de p.

    La pathologie est propre à la recherche transversale : des cellules à
    trois trades ont un nul dégénéré, donc des p artificiellement bas, et le
    relâchement du seuil au rang les fait se sauver MUTUELLEMENT. Le criblage
    lit un amas de bruit comme un signal.
    """
    lignes = [dict(cellule(f"A{i}", 0.004), trades=3) for i in range(12)]
    lignes += [dict(cellule(f"X{i}", 0.8), trades=90) for i in range(13)]
    verdicts = {l["signature"]: "REFUSEE" for l in lignes}

    aveugle = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert len(aveugle.survivantes) == 12, (
        "douze cellules à p = 0,004 se sauvent mutuellement — c'est BH qui "
        "fonctionne, pas un bug")

    informee = tr.coupe(lignes, strategie="ema_cross", intervalle="1d",
                        verdicts=verdicts)
    assert informee.retenues == ()
    assert informee.phrase.startswith("0 actif(s) retenu(s)"), (
        "la phrase doit MENER par ce qui passe la porte, pas par ce qui "
        "survit à la correction")


def test_la_coupe_mesure_les_marches_du_panier_qu_elle_annonce():
    """Mesurer le lien d'actifs que la porte refuse décrirait un panier qui
    n'existe pas."""
    lignes = [dict(cellule(a, 0.0005), trades=90)
              for a in ("BTC", "ETH", "SOL", "AVAX")]
    verdicts = {f"s{a}": ("RETENUE" if a in ("BTC", "ETH") else "REFUSEE")
                for a in ("BTC", "ETH", "SOL", "AVAX")}
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d",
                 verdicts=verdicts)
    assert set(c.retenues) == {"BTC", "ETH"}
    # Le lien porte sur BTC+ETH, pas sur les quatre.
    if c.marches is not None:
        assert c.marches <= 2.0


def test_sans_verdicts_la_coupe_n_annonce_aucune_retenue():
    """Ne pas savoir n'est pas retenir."""
    lignes = [dict(cellule(f"A{i}", 0.0005), trades=90) for i in range(5)]
    c = tr.coupe(lignes, strategie="ema_cross", intervalle="1d")
    assert c.retenues == ()
    assert len(c.survivantes) == 5
