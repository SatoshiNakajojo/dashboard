"""Le rituel hebdomadaire : l'ordre des étapes, et l'arrêt à la première panne.

Ce fichier ne teste pas la collecte — elle demande le réseau. Il teste la
seule chose qui, en cassant, produirait un dégât irréversible : **inscrire
des positions depuis un calendrier périmé**. Le journal est en ajout seul ;
une inscription fautive ne se retire pas.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pytest
from rituel_hebdomadaire import etapes, main

RACINE = Path(__file__).resolve().parents[1]


def test_le_calendrier_vient_avant_l_inscription():
    """L'ordre n'est pas cosmétique : inscrire avant de rafraîchir le
    calendrier produirait des positions calculées sur des dates périmées."""
    noms = [(e.script, e.args) for e in etapes(30)]
    assert noms[0][0] == "fetch_unlocks.py"
    assert noms[1][0] == "journal_unlocks.py"
    assert "--resoudre" not in noms[1][1], "l'étape 2 INSCRIT"
    assert noms[2] == ("journal_unlocks.py", ("--resoudre",))


def test_l_horizon_est_transmis_a_l_inscription():
    inscription = etapes(45)[1]
    assert inscription.args == ("--horizon", "45")


def test_le_releve_n_est_pas_fatal_mais_la_collecte_l_est():
    """Un jeton délisté rend une ligne du relevé incalculable — pas la
    semaine entière ratée. Un calendrier non téléchargé, si."""
    e = etapes(30)
    assert e[0].fatale, "sans calendrier, on n'inscrit rien"
    assert e[1].fatale
    assert not e[2].fatale, "le relevé ne doit pas faire échouer le rituel"


def test_une_collecte_en_echec_n_inscrit_rien(monkeypatch):
    """LE test de ce fichier.

    On fait échouer la première étape et on vérifie qu'aucune autre n'est
    lancée, et que le code de sortie est non nul — sans quoi systemd
    marquerait « réussi » une semaine où rien n'a été collecté.
    """
    lancees: list[str] = []

    def faux_call(cmd, **_kw):
        lancees.append(Path(cmd[1]).name)
        return 1 if lancees[-1] == "fetch_unlocks.py" else 0

    monkeypatch.setattr(subprocess, "call", faux_call)
    monkeypatch.setattr(sys, "argv", ["rituel_hebdomadaire.py"])
    assert main() != 0
    assert lancees == ["fetch_unlocks.py"], (
        "rien ne doit être inscrit après une collecte ratée")


def test_un_releve_en_echec_ne_fait_pas_echouer_le_rituel(monkeypatch):
    lancees: list[str] = []

    def faux_call(cmd, **_kw):
        lancees.append(tuple(Path(x).name if i == 1 else x
                             for i, x in enumerate(cmd))[1:])
        return 3 if "--resoudre" in cmd else 0

    monkeypatch.setattr(subprocess, "call", faux_call)
    monkeypatch.setattr(sys, "argv", ["rituel_hebdomadaire.py"])
    assert main() == 0
    assert len(lancees) == 3, "les trois étapes doivent avoir tourné"


def test_sans_calendrier_saute_la_collecte_et_le_dit(monkeypatch, capsys):
    """L'option existe pour rejouer une étape à la main. Elle doit être
    bruyante : c'est la seule façon d'inscrire depuis un calendrier périmé."""
    monkeypatch.setattr(subprocess, "call", lambda cmd, **_kw: 0)
    monkeypatch.setattr(sys, "argv", ["rituel_hebdomadaire.py", "--sans-calendrier"])
    assert main() == 0
    assert "ATTENTION" in capsys.readouterr().out


@pytest.mark.parametrize("fichier", ["rituel-deblocages.service",
                                     "rituel-deblocages.timer"])
def test_les_unites_systemd_sont_livrees(fichier):
    """Un rituel automatisé dont les unités ne sont pas dans le dépôt n'est
    pas automatisé : il vit sur une machine et meurt avec elle."""
    texte = (RACINE / "deploy" / fichier).read_text(encoding="utf-8")
    assert "rituel_hebdomadaire.py" in texte or "OnCalendar" in texte


def test_le_timer_rattrape_une_execution_manquee():
    """`Persistent=true` est LA ligne qui rend le rituel oubliable.

    Sans elle, une semaine où le VPS était éteint est une semaine perdue, et
    rien ne le signale — exactement le mode de panne silencieuse que ce
    dépôt cherche à rendre impossible.
    """
    timer = (RACINE / "deploy" / "rituel-deblocages.timer").read_text(encoding="utf-8")
    assert "Persistent=true" in timer
    assert "OnCalendar=" in timer


def test_le_service_ne_se_relance_pas_tout_seul():
    """Un oneshot qui échoue doit RESTER en échec.

    `Restart=` sur un service de collecte effacerait la trace de la panne :
    `systemctl status` afficherait « actif » sur un rituel qui n'a rien
    collecté depuis un mois.
    """
    service = (RACINE / "deploy" / "rituel-deblocages.service").read_text(encoding="utf-8")
    assert "Type=oneshot" in service
    assert "\nRestart=" not in service
