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


def test_sans_horizon_le_rituel_inscrit_tout_l_avenir():
    """La pré-inscription ne doit pas dépendre de la régularité du rituel.

    Avec un horizon de trente jours, trois semaines d'arrêt — ce qui est
    arrivé, le service n'ayant jamais été installé sur le VPS — laissaient
    les positions de ces trois semaines inscrites nulle part. C'est
    exactement ce que le journal existe pour empêcher.
    """
    assert etapes()[1].args == ()
    assert etapes(45)[1].args == ("--horizon", "45"), (
        "borner reste possible, mais ce n'est plus le défaut")


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


# ────────────────────────────────────────────────── l'installateur du VPS

def _installateur() -> str:
    return (RACINE / "deploy" / "installer.sh").read_text(encoding="utf-8")


def test_l_installateur_connait_toutes_les_unites_livrees():
    """Ajouter une unité systemd sans l'ajouter à l'installateur donnerait un
    VPS qui tourne l'ancienne configuration après une mise à jour — et rien
    ne le dirait, puisque les autres unités, elles, redémarrent."""
    texte = _installateur()
    unites = sorted(p.name for p in (RACINE / "deploy").glob("*.service"))
    unites += sorted(p.name for p in (RACINE / "deploy").glob("*.timer"))
    for u in unites:
        assert u in texte, f"{u} est livrée mais absente de l'installateur"


def test_l_installateur_active_les_timers_et_pas_les_oneshot():
    """Activer un service `oneshot` le lancerait à chaque démarrage, hors de
    sa cadence — et un rituel hebdomadaire qui tourne à chaque reboot n'est
    plus hebdomadaire."""
    texte = _installateur()
    assert "rituel-deblocages.timer" in texte and "regles-figees.timer" in texte
    for ligne in texte.splitlines():
        if "enable --now" in ligne and "$t" not in ligne:
            assert "enregistreur" in ligne, (
                f"seul le service continu s'active directement : {ligne.strip()}")


def test_l_installateur_refuse_d_ecraser_des_modifications_locales():
    """Quelqu'un a peut-être corrigé quelque chose à la main, en urgence. Un
    installateur qui écrase en silence détruit ce correctif et la trace de la
    raison pour laquelle il existait."""
    texte = _installateur()
    assert "diff --quiet HEAD" in texte
    assert "modifications locales" in texte


def test_l_installateur_s_arrete_a_la_premiere_erreur():
    """Un installateur qui continue après un échec laisse une machine dans un
    état que personne ne sait décrire."""
    assert "set -euo pipefail" in _installateur()


def test_l_installateur_cree_les_dossiers_declares_en_ReadWritePaths():
    """Un chemin déclaré `ReadWritePaths` qui n'existe pas fait échouer le
    démarrage de l'unité — avec un message qui ne dit pas lequel."""
    texte = _installateur()
    declares = set()
    for u in (RACINE / "deploy").glob("*.service"):
        for ligne in u.read_text(encoding="utf-8").splitlines():
            if ligne.startswith("ReadWritePaths="):
                declares.update(ligne.split("=", 1)[1].split())
    assert declares, "les unités doivent déclarer leurs chemins d'écriture"
    for chemin in declares:
        court = chemin.replace("/opt/desk/src/desk", "$RACINE")
        assert court in texte or chemin in texte, (
            f"{chemin} est déclaré par une unité mais jamais créé")
