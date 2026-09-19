"""Le protocole du pari, et le journal qui l'applique.

Ces tests portent sur la seule chose que le depot ne peut pas obtenir en
relisant l'historique : une prediction ecrite avant les faits, et notee selon
une regle ecrite elle aussi avant les faits.

Le defaut qu'ils verrouillent est toujours le meme — un chiffre qui a l'air
d'un resultat et qui mesure autre chose. Ici ce serait : comparer la moyenne
du journal a zero, ce qui mesure la derive des altcoins.
"""

from __future__ import annotations

import importlib.util
import json
import random
import re
from pathlib import Path

from trading_desk import pronostic

_racine = Path(__file__).resolve().parents[1]


def _module(nom: str):
    spec = importlib.util.spec_from_file_location(nom, _racine / "scripts" / f"{nom}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


journal = _module("journal_unlocks")
JOUR_MS = 86_400_000


# --------------------------------------------------------------------------
#  La declaration
# --------------------------------------------------------------------------

def test_l_empreinte_du_protocole_est_verrouillee():
    """Changer un seuil doit casser ce test, donc obliger a incrementer VERSION.

    Sans ce verrou, « ajuster legerement » la facon de noter un pari deja
    engage serait possible sans que rien ne le signale — et c'est exactement
    la liberte que le hors echantillon existe pour retirer.
    """
    assert pronostic.empreinte() == "f0cc1203cf3bb0d5", (
        "la declaration a change. Si c'est voulu, incrementez VERSION et "
        "mettez cette empreinte a jour dans le meme commit.")


def test_la_mesure_primaire_est_choisie_avant_et_pas_apres():
    """Deux mesures sont relevees, une seule decide.

    Les afficher toutes les deux sans dire laquelle tranche laisserait le
    choix ouvert au moment du verdict — donc le choix de la plus flatteuse.
    """
    assert pronostic.MESURE_PRIMAIRE == pronostic.NET
    assert set(pronostic.EN_ECHANTILLON) == {pronostic.BRUT, pronostic.NET}


def test_le_repere_en_echantillon_n_est_pas_zero():
    """Le point du fichier : vendre au hasard rapportait deja de l'argent.

    Si ce hasard etait nul, comparer le journal a zero serait legitime et
    tout le protocole serait inutile. Il ne l'est pas.
    """
    for mesure, ref in pronostic.EN_ECHANTILLON.items():
        assert ref["hasard_bps"] > 50, (
            f"{mesure} : un bras de hasard a {ref['hasard_bps']:.0f} bps ne "
            "justifierait plus de le calculer")
        assert abs(ref["exces_bps"] - (ref["observe_bps"] - ref["hasard_bps"])) < 0.2


def test_le_nombre_de_positions_requis_repond_a_la_bonne_question():
    """« Cinquante » repondait a une question a 50 % de chance de conclure.

    Le chiffre affiche doit distinguer les deux, sinon on promet une
    conclusion la ou l'on n'a qu'une piece a pile ou face.
    """
    a = pronostic.attendu()
    assert a["n_pour_80"] > a["n_pour_50"] > 0
    assert a["n_pour_50"] == 103 and a["n_pour_80"] == 210


def test_une_puissance_non_declaree_est_refusee():
    """Pas de z interpole a la volee : une puissance non declaree se voit."""
    try:
        pronostic.n_requis(200.0, 1000.0, 0.63)
    except ValueError:
        return
    raise AssertionError("une puissance inconnue doit lever, pas inventer un z")


# --------------------------------------------------------------------------
#  Le rendement et le bras de hasard
# --------------------------------------------------------------------------

def test_une_cotation_manquante_rend_None_jamais_la_plus_proche():
    """Decaler la fenetre d'un jour detruit precisement ce qu'on mesure."""
    prix = {10: 100.0, 12: 90.0}          # le jour 16 n'existe pas
    assert pronostic.rendement(prix, 10, duree=6) is None
    assert pronostic.rendement(prix, 10, duree=2) is not None


def test_le_sens_est_court_une_baisse_rapporte():
    prix = {0: 100.0, 6: 90.0}
    assert pronostic.rendement(prix, 0) > 0
    prix = {0: 100.0, 6: 110.0}
    assert pronostic.rendement(prix, 0) < 0


def test_la_couverture_retire_le_mouvement_de_la_reference():
    """Un jeton qui suit exactement BTC ne doit rien rapporter, couvert."""
    prix = {0: 100.0, 6: 80.0}
    ref = {0: 50.0, 6: 40.0}              # -20 % des deux cotes
    assert pronostic.rendement(prix, 0) > 1900
    assert abs(pronostic.rendement(prix, 0, reference=ref)) < 1


def test_les_bornes_limitent_le_hasard_a_la_periode_traversee():
    """Tirer dans toute l'histoire du jeton comparerait a un autre marche."""
    prix = {j: 100.0 for j in range(0, 100)}
    assert len(pronostic.jours_eligibles(prix)) == 94        # 100 - duree
    assert pronostic.jours_eligibles(prix, bornes=(50, 60)) == list(range(50, 61))


def test_le_bras_de_hasard_a_le_meme_effectif_que_l_observe():
    """Un bras plus large aurait une dispersion plus petite, donc un p flatte."""
    alea = random.Random(7)
    prix = {j: 100 * (1 + alea.gauss(0, 0.05)) for j in range(200)}
    elig = pronostic.jours_eligibles(prix)
    nuls = pronostic.bras_de_hasard([(prix, elig)] * 12, tirages=200)
    assert len(nuls) == 200
    large = pronostic.bras_de_hasard([(prix, elig)] * 120, tirages=200)
    import statistics as st
    assert st.stdev(large) < st.stdev(nuls), (
        "un bras de 120 positions doit etre moins disperse qu'un bras de 12 ; "
        "sinon l'effectif n'est pas respecte")


def test_le_p_ne_peut_pas_valoir_zero():
    """2000 tirages ne fournissent pas une certitude."""
    assert pronostic.p_unilateral(10**9, [0.0] * 2000) == 1 / 2001


# --------------------------------------------------------------------------
#  L'inscription
# --------------------------------------------------------------------------

def _calendrier(symbole: str, jours: list[int], part: float = 0.03) -> dict:
    return {symbole: [{"ts_ms": j * JOUR_MS, "part_offre": part,
                       "debloque": 1.0, "lineaire": 0.0, "categories": []}
                      for j in jours]}


def test_une_fenetre_deja_ouverte_n_est_jamais_inscrite():
    """Le coeur du dispositif : pas de prediction ecrite apres coup.

    Le deblocage est a J+3, donc son entree — sept jours avant — est deja
    passee. L'inscrire serait une prediction sur une fenetre dont le debut
    est connu.
    """
    maintenant = 1000 * JOUR_MS
    cal = _calendrier("AAA", [1003, 1030])
    pris = journal.a_prendre(cal, maintenant, None, {"AAA"})
    assert [x["deblocage_ms"] // JOUR_MS for x in pris] == [1030]


def test_sans_horizon_tout_l_avenir_est_inscrit():
    """La v3 ne depend plus de la regularite du rituel hebdomadaire."""
    maintenant = 1000 * JOUR_MS
    cal = _calendrier("AAA", [1020, 1200, 2000])
    assert len(journal.a_prendre(cal, maintenant, None, {"AAA"})) == 3
    assert len(journal.a_prendre(cal, maintenant, 300, {"AAA"})) == 2


def test_chaque_ligne_porte_le_protocole_le_calendrier_et_le_preavis():
    """Sans ces trois champs, on ne pourrait pas verifier apres coup ce qui
    a ete promis, depuis quel calendrier, et avec combien de preavis."""
    cal = _calendrier("AAA", [1100])
    ligne = journal.a_prendre(cal, 1000 * JOUR_MS, None, {"AAA"})[0]
    assert ligne["protocole"] == pronostic.empreinte()
    assert ligne["calendrier"] == journal.empreinte_calendrier(cal)
    assert ligne["horizon_j"] == 93            # 1100 - 7 - 1000
    assert ligne["version"] == journal.VERSION


def test_un_jeton_non_cote_n_est_pas_inscrit():
    """Une position imprenable gonflerait le journal d'un portefeuille
    imaginaire, et le score porterait sur des trades que personne n'aurait
    pu passer."""
    cal = {**_calendrier("AAA", [1100]), **_calendrier("ZZZ", [1100])}
    pris = journal.a_prendre(cal, 1000 * JOUR_MS, None, {"AAA"})
    assert {x["symbole"] for x in pris} == {"AAA"}


def test_relancer_n_ajoute_rien(tmp_path):
    cal = _calendrier("AAA", [1100, 1200])
    pris = journal.a_prendre(cal, 1000 * JOUR_MS, None, {"AAA"})
    f = tmp_path / "j.jsonl"
    assert journal.inscrire(pris, f) == 2
    assert journal.inscrire(pris, f) == 0
    assert len(journal.lire(f)) == 2


def test_un_deblocage_reporte_s_ajoute_sans_effacer_l_ancien(tmp_path):
    """Retirer la ligne devenue caduque supposerait de decider, apres avoir
    vu le prix, laquelle des deux dates etait la bonne."""
    f = tmp_path / "j.jsonl"
    journal.inscrire(journal.a_prendre(_calendrier("AAA", [1100]),
                                       1000 * JOUR_MS, None, {"AAA"}), f)
    journal.inscrire(journal.a_prendre(_calendrier("AAA", [1130]),
                                       1000 * JOUR_MS, None, {"AAA"}), f)
    assert len(journal.lire(f)) == 2


def test_purger_refuse_des_qu_une_fenetre_est_close(tmp_path):
    """Le refus doit etre structurel, pas une promesse."""
    f = tmp_path / "j.jsonl"
    f.write_text(json.dumps({"version": 3, "symbole": "AAA",
                             "deblocage_ms": 0, "sortie_ms": 1}) + "\n")
    ok, message = journal.purger_version(f, 3)
    assert not ok and "REFUS" in message
    assert len(journal.lire(f)) == 1


# --------------------------------------------------------------------------
#  La notation
# --------------------------------------------------------------------------

def _monde(pente_par_jour: float, choc_avant: float, entrees: list[int],
           jours: int = 200, graine: int = 11):
    """Un jeton qui derive, et qui chute en plus avant certaines dates.

    `pente_par_jour` est la derive de fond — celle qu'un bras de hasard doit
    absorber. `choc_avant` ne s'applique qu'aux six jours qui suivent une
    entree inscrite.
    """
    alea = random.Random(graine)
    marques = {j for e in entrees for j in range(e, e + 6)}
    px, prix = 100.0, {}
    for j in range(jours):
        prix[j] = px
        px *= 1 + pente_par_jour + alea.gauss(0, 0.01) + (choc_avant if j in marques else 0)
    ref = {j: 50.0 for j in range(jours)}     # reference plate : net == brut
    return prix, ref


def _lignes(entrees: list[int], symbole: str = "AAA") -> list[dict]:
    return [{"version": 3, "symbole": symbole, "deblocage_ms": (j + 7) * JOUR_MS,
             "part_offre": 0.03, "entree_ms": j * JOUR_MS,
             "sortie_ms": (j + 6) * JOUR_MS, "sens": "COURT",
             "reference": "BTC", "inscrit_ms": 0, "horizon_j": 10}
            for j in entrees]


def test_une_derive_de_fond_ne_passe_pas_pour_un_resultat():
    """LE test de ce fichier.

    Le jeton baisse de 0,8 % par jour, tout le temps, et il ne se passe
    RIEN de particulier avant les dates inscrites. Vendre a decouvert
    rapporte donc +365 bps par position — PLUS que les +342 bps mesures en
    echantillon sur les vrais deblocages. Un releve compare a zero
    annoncerait donc un succes eclatant sur un monde ou la regle ne capte
    rien du tout.

    Le bras de hasard gagne exactement autant. L'exces doit etre proche de
    zero et le p loin du seuil.
    """
    entrees = list(range(20, 170, 10))
    prix, ref = _monde(-0.008, 0.0, [])
    carnets = {"AAA": prix, "BTC": ref}
    score = journal.noter(_lignes(entrees), carnets, 10**15)
    net = score["mesures"][pronostic.NET]
    assert net["observe_bps"] > 300, (
        "le fixture ne piege rien : compare a zero, la derive seule doit "
        "produire un gain superieur a l'effet historique")
    assert abs(net["exces_bps"]) < 120, (
        f"la derive n'a pas ete absorbee : exces {net['exces_bps']:+.0f} bps")
    assert net["p"] > 0.05, f"p={net['p']:.4f} sur une derive sans evenement"


def test_un_effet_reel_sur_les_fenetres_inscrites_est_detecte():
    """L'autre sens, sans quoi le test precedent ne vaut rien."""
    entrees = list(range(20, 170, 10))
    prix, ref = _monde(0.0, -0.012, entrees)
    score = journal.noter(_lignes(entrees), {"AAA": prix, "BTC": ref}, 10**15)
    net = score["mesures"][pronostic.NET]
    assert net["exces_bps"] > 300, f"exces {net['exces_bps']:+.0f} bps"
    assert net["p"] <= 0.05, f"p={net['p']:.4f}"


def test_une_periode_trop_courte_ecarte_la_position_des_DEUX_bras():
    """L'ecarter d'un seul comparerait deux portefeuilles differents."""
    prix = {j: 100.0 for j in range(10)}     # bien moins que le minimum
    score = journal.noter(_lignes([0, 1]), {"AAA": prix, "BTC": prix}, 10**15)
    net = score["mesures"][pronostic.NET]
    assert net["n"] == 0 and net["sans_prix"] == 2


def test_une_fenetre_non_close_n_est_jamais_notee():
    prix, ref = _monde(0.0, 0.0, [])
    lignes = _lignes([20, 30])
    lignes[1]["sortie_ms"] = 10**15          # tres loin dans le futur
    score = journal.noter(lignes, {"AAA": prix, "BTC": ref}, 40 * JOUR_MS)
    assert score["closes"] == 1


def test_le_detail_par_preavis_separe_les_horizons():
    obs = [({"horizon_j": 5}, 100.0), ({"horizon_j": 200}, -50.0),
           ({"horizon_j": 900}, 10.0)]
    noms = [x[0] for x in journal._par_horizon(obs)]
    assert noms == ["≤ 30 j", "181-365 j", "> 365 j"]


def test_le_cache_du_releve_est_date():
    """Le cache de `fetch_hyperliquid` n'expire jamais : sa cle est
    (actif, echelle, jours). Un dossier fixe ferait relire indefiniment le
    premier telechargement, et le releve hebdomadaire noterait les positions
    sur les prix du jour ou on l'a lance la premiere fois.
    """
    source = (_racine / "scripts" / "journal_unlocks.py").read_text()
    assert 'f"journal-{jour}"' in source, (
        "le dossier de cache du releve doit porter la date du jour")


# --------------------------------------------------------------------------
#  L'ecran
# --------------------------------------------------------------------------

def _ui(nom: str) -> str:
    return (_racine / "src" / "trading_desk" / "ui" / nom).read_text(encoding="utf-8")


def _bloc_journal(code_seul: bool = False) -> str:
    js = _ui("desk.js")
    bloc = js[js.index("const JN = {"):js.index("/* ---------- SOUFFLERIE ---------- */")]
    # `code_seul` retire les commentaires : un test qui cherche un nombre
    # code en dur ne doit pas se declencher sur une phrase qui EXPLIQUE d'ou
    # vient ce nombre. Sinon la seule facon de le faire passer serait de
    # retirer l'explication, ce qui est exactement le contraire du but.
    return re.sub(r"/\*.*?\*/", "", bloc, flags=re.S) if code_seul else bloc


def test_l_ecran_dit_que_le_repere_n_est_pas_zero():
    """C'est le seul endroit ou l'ecran peut mentir sans qu'on s'en apercoive.

    Une moyenne de journal affichee seule se lit comme un resultat. En marche
    baissier elle confirmerait la regle, en marche haussier elle la
    refuterait, et dans les deux cas elle parlerait des altcoins, pas des
    deblocages.
    """
    bloc = _bloc_journal()
    assert "dates tirées au hasard" in bloc
    assert "hasard_bps" in bloc and "exces_bps" in bloc


def test_l_ecran_ne_code_en_dur_aucun_seuil():
    """Les seuils viennent de la declaration figee. Recopies dans l'ecran,
    ils derivent, et un ecran qui promet un verdict que le script refuse de
    rendre est pire que pas d'ecran du tout."""
    bloc = _bloc_journal(code_seul=True)
    assert "n.seuil_conclusion" in bloc and "n.seuil_confortable" in bloc
    for interdit in ("103", "210", "= 50", "/ 50"):
        assert interdit not in bloc, f"seuil {interdit!r} codé en dur"


def test_l_axe_du_graphe_est_temporel():
    """Espacer les mois a intervalle constant donnait la meme largeur au saut
    de dix-neuf mois entre novembre 2028 et mars 2030 qu'a un mois ordinaire.
    Sur un graphe dont toute la question est « quand est-ce qu'on saura »,
    deformer le temps est le seul mensonge qui compte."""
    bloc = _bloc_journal()
    assert "function jnMois(" in bloc
    assert "jnMois(m) - m0" in bloc, "l'abscisse doit venir du rang du mois"


def test_le_seuil_hors_d_atteinte_reste_visible():
    """Tronquer l'echelle au maximum du calendrier ferait disparaitre le fait
    que 210 positions n'existent pas. C'est precisement l'information."""
    bloc = _bloc_journal()
    assert "Math.max(serie[serie.length - 1].cumul, s80, 1)" in bloc
    assert "hors d’atteinte" in bloc


def test_le_tableau_du_journal_est_borne_en_hauteur():
    """Cent soixante-quinze positions inscrites d'un coup : sans plafond, le
    tableau fait quinze mille pixels et le graphe disparait au-dessus."""
    assert "jn-table" in _bloc_journal()
    css = _ui("desk.css")
    ligne = next(x for x in css.splitlines() if x.strip().startswith(".jn-table"))
    assert "max-height" in ligne and "overflow-y:auto" in ligne
