"""La mesure des saisons, et les quatre façons de la rendre complaisante.

1. **Lire la saison sur la barre qu'elle explique.** Sans retard, « la
   meilleure stratégie par saison » gagne parce qu'elle connaît la clôture.
2. **Deviner une étiquette pendant la chauffe** au lieu de rendre None : une
   saison inventée sur 40 barres de moyenne 200 n'est pas une saison.
3. **Tirer le plancher de p du nombre de tirages** au lieu du nombre de
   décalages distincts — la faute que la version 1 du vocabulaire
   d'événements a commise contre elle-même.
4. **Décaler moins que la plus longue plage**, ce qui laisse l'étiquette
   décalée recouvrir l'originale et rend le contrôle inerte.
"""

from __future__ import annotations

import pytest

from trading_desk import saisons as S
from trading_desk import saisonnier as sr


class Barre:
    def __init__(self, ts_ms: int, close: float):
        self.ts_ms, self.close = ts_ms, close


def serie(cours):
    return [Barre(1_600_000_000_000 + i * 86_400_000, c)
            for i, c in enumerate(cours)]


def test_la_chauffe_ne_devine_aucune_etiquette():
    """None dit « je ne sais pas » ; une étiquette dirait « je sais ».

    Et « je ne sais pas » n'est pas « range » : les confondre ferait entrer
    les barres de démarrage dans une saison qu'elles n'ont pas.
    """
    s = sr.etiqueter(serie([100.0] * 100))
    assert all(e is None for e in s.etiquettes)
    assert s.etiquetees == 0
    assert S.RANGE not in s.etiquettes


def test_la_confirmation_absorbe_les_allers_retours():
    """LE test de la version 2.

    Sous la version 1, la définition battait autour de la moyenne : 63 plages
    sur 1 988 barres, dont beaucoup d'un à trois jours. Changer de stratégie
    tous les trois jours est mangé par les frais avant toute autre
    considération.

    Une montée franche interrompue par une chute brève ne doit produire
    qu'une seule plage : la chute ne tient pas assez pour être confirmée.
    """
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES + S.CONFIRMATION_BARRES + 120
    cours = [100.0 * (1.004 ** i) for i in range(besoin)]
    # un trou de cinq barres, trop court pour être confirmé
    creux = besoin - 40
    for k in range(creux, creux + 5):
        cours[k] *= 0.80
    s = sr.etiqueter(serie(cours))
    assert len(s.plages) == 1, [(p.saison, p.barres) for p in s.plages]
    assert s.plages[0].saison == S.BULL


def test_aucune_plage_n_est_plus_courte_que_la_confirmation():
    """Par construction, et vérifié sur la vraie série."""
    s = sr.serie_de_reference()
    courtes = [p for p in s.plages[1:] if p.barres < S.CONFIRMATION_BARRES]
    assert not courtes, [(p.saison, p.barres, p.debut) for p in courtes]


def test_l_etiquette_ne_lit_jamais_la_barre_qu_elle_explique():
    """LE test de ce module.

    On construit une série plate puis un saut violent sur la DERNIÈRE barre.
    Avec un retard d'une barre, ce saut ne peut pas avoir change l'étiquette
    de cette barre-là — il ne sera lu qu'à la suivante, qui n'existe pas.
    """
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES + S.CONFIRMATION_BARRES + 5
    montante = [100.0 * (1.003 ** i) for i in range(besoin)]
    a = sr.etiqueter(serie(montante))
    b = sr.etiqueter(serie(montante[:-1] + [montante[-1] * 0.4]))
    assert a.etiquettes[-1] == b.etiquettes[-1], (
        "l'étiquette de la dernière barre a bougé alors que seule sa propre "
        "clôture a changé : le découpage regarde la barre qu'il explique")


def test_une_montee_franche_est_un_bull_et_une_chute_un_bear():
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES + S.CONFIRMATION_BARRES + 60
    haut = sr.etiqueter(serie([100.0 * (1.004 ** i) for i in range(besoin)]))
    bas = sr.etiqueter(serie([100.0 * (0.996 ** i) for i in range(besoin)]))
    assert haut.etiquettes[-1] == S.BULL
    assert bas.etiquettes[-1] == S.BEAR


def test_le_plancher_vient_de_la_plage_de_decalages():
    """Tirer cinq mille fois dans deux cents décalages ne fait pas cinq mille
    nuls."""
    s = sr.serie_de_reference()
    d = s.en_dict()
    assert d["plancher_de_p"] == pytest.approx(1 / (d["plage_decalages"] + 1))
    assert d["plancher_de_p"] != pytest.approx(1 / (S.TIRAGES + 1))


def test_la_plage_de_decalages_exclut_la_plus_longue_plage():
    """Un décalage plus court remet une partie des étiquettes en face
    d'elles-mêmes : le nul cesse d'être un nul."""
    s = sr.serie_de_reference()
    assert s.plage_decalages == s.etiquetees - s.plus_longue_plage
    assert s.plage_decalages < s.etiquetees


def test_la_precondition_declaree_est_verifiee_sur_la_vraie_serie():
    """Déclarée avant la mesure, vérifiée par elle. Si elle échouait, le
    « zéro survivant » du criblage ne dirait rien du marché — et il faudrait
    le dire, pas le taire."""
    s = sr.serie_de_reference()
    assert s.plage_decalages >= S.plage_requise(), (
        f"{s.plage_decalages} décalages pour {S.plage_requise()} requis : "
        f"le criblage serait aveugle")
    assert s.criblage_possible


def test_les_trois_saisons_sont_assez_peuplees():
    s = sr.serie_de_reference()
    assert all(s.saisons_assez_peuplees.values()), s.repartition


def test_bascules_ne_change_aucune_etiquette():
    """C'est une aide à la LECTURE, pas un seuil du découpage. Le glisser dans
    `etiqueter` en ferait un paramètre de plus, non déclaré."""
    s = sr.serie_de_reference()
    avant = list(s.etiquettes)
    longues = sr.bascules(s, barres_min=60)
    assert s.etiquettes == avant
    assert len(longues) < len(s.plages)
    assert all(p.barres >= 60 for p in longues)


def test_la_serie_reelle_porte_l_empreinte_de_la_declaration():
    """Une mesure qui ne dirait pas sous quelle déclaration elle a été faite
    ne serait pas comparable à la suivante."""
    d = sr.serie_de_reference().en_dict()
    assert d["empreinte"] == S.empreinte()
    assert d["version"] == S.VERSION


# ──────────────────────────────── la grille strategie x saison

def test_la_saison_est_EN_VIGUEUR_pas_a_un_instant():
    """Un défaut attrapé en faisant tourner la grille en 4 h.

    La première version cherchait l'horodatage exact dans l'index des barres
    étiquetées. Ça marchait tant que la stratégie tournait sur la même
    échelle que les saisons ; en 4 h aucun horodatage ne tombe sur une borne
    journalière, et la grille aurait rendu zéro trade attribué — un résultat
    vide qui se lit comme un résultat.
    """
    s = sr.serie_de_reference()
    bornes = s.bornes_etiquetees
    # un instant entre deux bornes journalières
    milieu = bornes[10] + 4 * 3600 * 1000
    assert milieu not in s.index_etiquetees
    assert s.rang_en_vigueur(milieu) == 10
    assert sr.saison_a(s, milieu) == s.etiquettes_compactes[10]


def test_la_saison_en_vigueur_ne_regarde_jamais_devant():
    """« À ou avant », jamais après."""
    s = sr.serie_de_reference()
    bornes = s.bornes_etiquetees
    assert s.rang_en_vigueur(bornes[0] - 1) is None
    assert s.rang_en_vigueur(bornes[5]) == 5
    assert s.rang_en_vigueur(bornes[5] - 1) == 4


def test_le_decalage_redistribue_sans_rien_creer():
    """Le total d'une stratégie est fixe ; le nul ne fait que le déplacer.

    C'est ce qui rend la question posable : « la saison prédit-elle OÙ la
    stratégie gagne », et non « la stratégie gagne-t-elle ».
    """
    etiq = [S.BULL] * 40 + [S.BEAR] * 40 + [S.RANGE] * 40
    rangs = [(i, float(i)) for i in range(0, 120, 3)]
    total = sum(n for _, n in rangs)
    for decalage in (0, 17, 55, 119):
        par = sr._par_saison(etiq, rangs, decalage)
        assert sum(v[0] for v in par.values()) == len(rangs)
        assert sum(v[1] for v in par.values()) == pytest.approx(total)


def test_la_grille_compte_33_cellules_comme_declare():
    """Le dénominateur est annoncé avant la mesure ; la grille doit lui
    correspondre, sinon l'un des deux ment."""
    g = sr.grille(intervalle="4h", actifs=["BTC"])
    assert len(g) == S.DENOMINATEUR
    assert len({(c.strategie, c.saison) for c in g}) == S.DENOMINATEUR


def test_les_cellules_maigres_comptent_au_denominateur():
    """Les retirer rendrait la correction plus laxiste : elles ont bien été
    testées, elles sont juste ininterprétables."""
    g = sr.grille(intervalle="4h", actifs=["BTC"])
    maigres = [c for c in g if not c.interpretable]
    assert maigres, "la grille en a forcément"
    assert len(g) == S.DENOMINATEUR


def test_le_nul_est_le_meme_pour_toutes_les_cellules():
    """Deux jeux de décalages différents rendraient des p qui ne se comparent
    plus, et Benjamini-Hochberg porterait sur des choses différentes."""
    a = {(c.strategie, c.saison): c.p for c in sr.grille(intervalle="4h", actifs=["BTC"])}
    b = {(c.strategie, c.saison): c.p for c in sr.grille(intervalle="4h", actifs=["BTC"])}
    assert a == b, "la grille doit être reproductible d'une exécution à l'autre"


def test_la_mise_en_commun_multiplie_les_trades_sans_toucher_au_denominateur():
    """LE test de la version 3.

    Le dénominateur reste à trente-trois — une cellule par actif en ferait
    858 et rendrait le criblage aveugle. C'est le nombre de trades PAR cellule
    qui monte, et c'est exactement ce qui manquait : quinze cellules lisibles
    sur BTC seul, trente en mettant l'univers en commun.
    """
    seul = sr.grille(intervalle="4h", actifs=["BTC"])
    commun = sr.grille(intervalle="4h", actifs=["BTC", "ETH", "SOL"])
    assert len(seul) == len(commun) == S.DENOMINATEUR

    par_cle = {(c.strategie, c.saison): c for c in seul}
    plus = [c for c in commun
            if c.trades > par_cle[(c.strategie, c.saison)].trades]
    assert plus, "mettre trois actifs en commun doit augmenter des cellules"
    lisibles = lambda g: sum(1 for c in g if c.interpretable)
    assert lisibles(commun) > lisibles(seul)


def test_le_panier_rend_deux_nombres_qui_ne_se_remplacent_pas():
    """Le compte d'actifs dit combien de backtests alimentent une cellule ; le
    nombre de marchés dit combien d'information il y a derrière. N'afficher
    que le premier ferait passer le volume pour de la puissance."""
    pan = sr.panier()
    d = pan.en_dict()
    assert d["nombre"] == S.UNIVERS_AU_GEL
    assert d["marches"] is not None
    assert d["minimum"] == S.MARCHES_EFFECTIFS_MIN
    assert d["tient_la_precondition"] == (d["marches"] >= d["minimum"])


def test_vingt_six_perps_ne_font_pas_deux_marches():
    """La précondition déclarée AVANT la mesure, et son verdict.

    Elle échoue, et ce n'est pas un test à corriger : c'est le résultat. Cinq,
    dix, quinze ou vingt-six perps donnent tous entre 1,6 et 1,9 marché
    effectif, sur fenêtre courte comme sur cinq mille barres. Ajouter des
    actifs crypto n'ajoute pas de marchés — la mise en commun achète des
    trades, pas de l'information.
    """
    pan = sr.panier()
    assert pan.marches < S.MARCHES_EFFECTIFS_MIN
    assert not pan.tient_la_precondition


def test_la_grille_refuse_un_univers_vide(tmp_path):
    (tmp_path / "data").mkdir()
    with pytest.raises(ValueError, match="univers vide"):
        sr.grille(serie=sr.serie_de_reference(), dossier=tmp_path / "data")


def test_la_grille_refuse_une_plage_de_decalages_vide():
    vide = sr.Serie(horodatages=[], etiquettes=[])
    with pytest.raises(ValueError, match="inerte"):
        sr.grille(serie=vide)
