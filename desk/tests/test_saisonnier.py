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
    """None dit « je ne sais pas » ; une étiquette dirait « je sais »."""
    s = sr.etiqueter(serie([100.0] * 100))
    assert all(e is None for e in s.etiquettes)
    assert s.etiquetees == 0


def test_l_etiquette_ne_lit_jamais_la_barre_qu_elle_explique():
    """LE test de ce module.

    On construit une série plate puis un saut violent sur la DERNIÈRE barre.
    Avec un retard d'une barre, ce saut ne peut pas avoir change l'étiquette
    de cette barre-là — il ne sera lu qu'à la suivante, qui n'existe pas.
    """
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES + 5
    montante = [100.0 * (1.003 ** i) for i in range(besoin)]
    a = sr.etiqueter(serie(montante))
    b = sr.etiqueter(serie(montante[:-1] + [montante[-1] * 0.4]))
    assert a.etiquettes[-1] == b.etiquettes[-1], (
        "l'étiquette de la dernière barre a bougé alors que seule sa propre "
        "clôture a changé : le découpage regarde la barre qu'il explique")


def test_une_montee_franche_est_un_bull_et_une_chute_un_bear():
    besoin = S.MOYENNE_BARRES + S.PENTE_BARRES + 60
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
