"""Le ticket, la carte, la bibliothèque — et la ligne qui protège les deux desks.

L'idée vient du briefing : une bibliothèque commune de recettes, des desks
individuels séparés. Ce module de test protège exactement la frontière entre
les deux, parce qu'elle est facile à franchir par accident et coûteuse à
réparer après coup.

**Le danger précis.** Importer trente recettes d'un autre desk et les corriger
avec les siennes est faux dans les DEUX sens : ça punit ses propres idées, qui
porteraient le poids statistique de trente essais qu'elles n'ont pas demandés,
et ça absout les trente, noyées dans un dénominateur où le seuil au rang 1
devient si laxiste qu'il ne rejette plus rien.
"""

from __future__ import annotations

import json

import pytest

from trading_desk import atelier, biblio, transversal


def _ticket(actif="BTC", strategie="ema_cross", origine="main", **kw):
    return biblio.Ticket(
        cle=f"{strategie}_{actif.lower()}_1d", strategie=strategie,
        actif=actif, intervalle="1d",
        parametres={"fast": 20, "slow": 50}, origine=origine, **kw)


# ────────────────────────── la ligne qui protège la statistique

def test_l_import_FORCE_l_origine_a_externe(tmp_path):
    """**La seule ligne de tout le module qui empêche l'échange de casser la
    statistique des deux côtés.**

    Un ticket qui arriverait en `main` se mélangerait au dénominateur des
    idées du desk.
    """
    fichier = tmp_path / "biblio.jsonl"
    entrant = _ticket(actif="SOL", origine="main", auteur="flo")
    importes, doublons = biblio.importer([entrant], fichier)

    assert (importes, doublons) == (1, 0)
    dedans = biblio.lire(fichier)
    assert len(dedans) == 1
    assert dedans[0].origine == "externe", (
        "même arrivé en « main », un ticket importé est externe")
    assert dedans[0].auteur == "flo", "l'auteur, lui, est conservé"


def test_l_origine_importee_est_une_origine_CONNUE_du_registre():
    """Deux vocabulaires d'origine divergeraient, et la divergence se verrait
    comme un dénominateur qui ne compte pas les bonnes lignes."""
    assert "externe" in atelier.ORIGINES
    for t in (_ticket(origine=o) for o in atelier.ORIGINES):
        assert t.origine in atelier.ORIGINES


def test_un_doublon_n_est_pas_reimporte(tmp_path):
    """Réimporter la même recette gonflerait le dénominateur externe sans
    ajouter d'hypothèse — la correction deviendrait plus sévère qu'elle ne
    doit l'être."""
    fichier = tmp_path / "biblio.jsonl"
    t = _ticket(actif="SOL")
    biblio.importer([t], fichier)
    importes, doublons = biblio.importer([t], fichier)
    assert (importes, doublons) == (0, 1)
    assert len(biblio.lire(fichier)) == 1


# ─────────────────────────────────────── le ticket ne porte pas de résultat

def test_un_ticket_ne_porte_AUCUN_resultat():
    """Un ticket est une recette, pas une performance.

    La même recette donne deux résultats différents chez deux personnes qui ne
    tradent pas la même taille ; y coller un PnL ferait voyager un chiffre qui
    ne veut rien dire chez l'autre.
    """
    champs = set(_ticket().en_dict())
    interdits = {"net_usd", "pnl", "note", "annualise_pct", "p", "trades",
                 "profit_factor", "equite"}
    assert not (champs & interdits), f"un résultat a fuité : {champs & interdits}"


def test_l_empreinte_ignore_l_auteur_et_la_date():
    """Deux desks qui écrivent la même recette produisent la même empreinte —
    c'est ce qui permet de reconnaître un doublon à l'import."""
    a = _ticket(auteur="jojo", inscrit_ms=1)
    b = _ticket(auteur="flo", inscrit_ms=999)
    assert a.empreinte() == b.empreinte()


def test_l_empreinte_distingue_deux_parametrages():
    a = _ticket()
    b = biblio.Ticket(cle=a.cle, strategie=a.strategie, actif=a.actif,
                      intervalle=a.intervalle, parametres={"fast": 21, "slow": 50})
    assert a.empreinte() != b.empreinte()


# ────────────────────────────────────────────────────────── la rareté

def test_la_rarete_est_DERIVEE_pas_tiree():
    """Une rareté au hasard donnerait le frisson d'une trouvaille à une carte
    qui n'a rien prouvé. Celle-ci compte ce à quoi la recette a survécu, et
    elle est reproductible."""
    kw = dict(retenue_par_l_epreuve=True, relief=0.9, deployable=True,
              tenue=transversal.Tenue(essayes=("BTC", "ETH", "SOL"),
                                      retenus=("BTC", "ETH", "SOL"),
                                      effectifs=2.4))
    assert biblio.rarete(**kw) == biblio.rarete(**kw), "déterministe"
    rang, motif = biblio.rarete(**kw)
    assert rang == "légendaire"
    assert "épreuve" in motif and "plateau" in motif


def test_une_carte_sans_rien_de_mesure_reste_commune():
    rang, motif = biblio.rarete(retenue_par_l_epreuve=False, relief=None,
                                deployable=False)
    assert rang == "commune"
    assert "rien de mesuré" in motif


def test_l_epreuve_pese_plus_que_les_portes():
    """Survivre au hasard est plus rare que d'être économiquement viable, et
    le rang doit le refléter — sinon la rareté récompenserait le rendement."""
    portes_seules = biblio.rarete(retenue_par_l_epreuve=False, relief=None,
                                  deployable=True)[0]
    epreuve_seule = biblio.rarete(retenue_par_l_epreuve=True, relief=None,
                                  deployable=False)[0]
    ordre = list(biblio.RARETES)
    assert ordre.index(epreuve_seule) > ordre.index(portes_seules)


# ─────────────────────────────────────────────────────────── la carte

def test_le_PnL_live_absent_vaut_None_et_non_zero():
    """Zéro dirait « tradé, sans résultat » ; None dit « jamais tradé ». Le
    desk est en PAPER, donc c'est None partout — et c'est une information."""
    c = biblio.carte(_ticket(), {"net_usd": 12.0, "note": {}}, "REFUSEE")
    assert c["live_pnl_usd"] is None
    assert c["paper_pnl_usd"] == 12.0


def test_la_carte_porte_toutes_les_colonnes_du_briefing():
    c = biblio.carte(_ticket(), {"note": {}}, "REFUSEE")
    for cle, _titre in biblio.COLONNES:
        assert cle in c, f"colonne manquante : {cle}"


def test_vs_buy_hold_est_un_ECART_pas_un_rendement():
    """La colonne demandée est « vs B&H ». Y mettre le rendement de la
    stratégie ferait lire une avance là où il n'y en a pas."""
    note = {"annualise_pct": 5.0, "buy_hold_annualise_pct": 37.0}
    c = biblio.carte(_ticket(), {"note": note}, "REFUSEE")
    assert c["vs_buy_hold"] == pytest.approx(-32.0)


# ────────────────────────────────────────────── l'aller-retour d'échange

def test_un_aller_retour_d_echange_conserve_la_recette(tmp_path):
    """Exporter puis réimporter ne doit rien perdre de la recette — c'est tout
    l'objet d'un format d'échange."""
    origine = tmp_path / "a.jsonl"
    t = _ticket(actif="SOL", auteur="flo")
    biblio.inscrire(t, origine)

    export = tmp_path / "export.jsonl"
    export.write_text("".join(
        json.dumps(x.en_dict(), ensure_ascii=False) + "\n"
        for x in biblio.lire(origine)), encoding="utf-8")

    cible = tmp_path / "b.jsonl"
    entrants = [biblio.Ticket.de_dict(json.loads(l))
                for l in export.read_text(encoding="utf-8").splitlines() if l.strip()]
    biblio.importer(entrants, cible)

    recu = biblio.lire(cible)[0]
    assert recu.strategie == t.strategie
    assert recu.parametres == t.parametres
    assert recu.empreinte() == t.empreinte()
    assert recu.origine == "externe", "et l'origine a bien été forcée"


def test_une_recette_refusee_partout_ne_gagne_aucun_point_de_marche():
    """LE test de la correction du 17 septembre 2026.

    Le rang lisait `len(actifs sur lesquels la recette a ete ESSAYEE)`. Une
    recette lancee sur BTC, ETH et SOL et refusee sur les trois affichait
    « tient sur 3 actifs » et montait d'un rang — quinze cartes sur
    quarante-quatre portaient cette phrase, dont des REFUSEES. La mesure
    decrivait l'effort et s'affichait comme un resultat.
    """
    refusee_partout = transversal.Tenue(
        essayes=("BTC", "ETH", "SOL"), retenus=(), effectifs=None)
    rang, motif = biblio.rarete(retenue_par_l_epreuve=False, relief=None,
                                deployable=False, tenue=refusee_partout)
    assert rang == "commune"
    assert "tient sur" not in motif


def test_trois_actifs_correles_ne_font_pas_trois_marches():
    """Essayer sur trois actifs crypto et reussir sur les trois ne suffit pas.

    Le point se gagne sur les marches INDEPENDANTS : BTC, ETH et SOL en font
    1,5 sur l'historique reel, donc sous le seuil.
    """
    correles = transversal.Tenue(essayes=("BTC", "ETH", "SOL"),
                                 retenus=("BTC", "ETH", "SOL"),
                                 effectifs=1.52)
    _, motif = biblio.rarete(retenue_par_l_epreuve=True, relief=None,
                             deployable=False, tenue=correles)
    assert "tient sur" not in motif

    disjoints = transversal.Tenue(essayes=("BTC", "ETH", "SOL"),
                                  retenus=("BTC", "ETH", "SOL"),
                                  effectifs=2.4)
    _, motif = biblio.rarete(retenue_par_l_epreuve=True, relief=None,
                             deployable=False, tenue=disjoints)
    assert "tient sur 3 actif(s) sur 3 essayé(s)" in motif
    assert "2.4 marché(s) indépendant(s)" in motif
