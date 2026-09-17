"""Le ticket normé, la carte, et la bibliothèque commune.

Trois objets, et leur séparation est le sujet.

**Le TICKET** est la description canonique d'une recette : indicateurs,
paramètres, stop, cible, échelle de temps, actif, sens du signal, provenance.
C'est ce qui s'échange. Il ne porte AUCUN résultat — un ticket est une
recette, pas une performance.

**La CARTE** est la projection d'un ticket et de ses mesures, dans les colonnes
que l'écran affiche. Elle porte les résultats, et elle est donc toujours
relative à un desk : la même recette donne deux cartes différentes chez deux
personnes qui ne tradent pas la même taille.

**La BIBLIOTHÈQUE** est une collection de tickets, en ajout seul, échangeable.
Elle n'est le desk de personne.

────────────────────────────────────────────────────────────────────────────
  CE QUE LA BIBLIOTHÈQUE NE DOIT SURTOUT PAS FAIRE
────────────────────────────────────────────────────────────────────────────

**Fusionner les dénominateurs.** Importer trente recettes d'un autre desk et
les corriger avec les siennes est faux dans les deux sens : ça punit ses
propres idées, qui porteraient le poids statistique de trente essais qu'elles
n'ont pas demandés, et ça absout les trente, noyées dans un dénominateur où le
seuil au rang 1 devient si laxiste qu'il ne rejette plus rien.

Un ticket importé entre donc au registre avec `origine="externe"`, et la
correction de Benjamini-Hochberg porte PAR ORIGINE. C'est ce qui rend
l'échange possible sans casser la statistique de personne.

**Fusionner les desks.** Deux personnes qui partagent une bibliothèque ne
partagent pas un bot. Chacune garde son registre, ses règles figées, son
journal hors échantillon et sa taille de position. La bibliothèque transporte
des recettes ; elle ne transporte ni capital, ni décision, ni résultat.

────────────────────────────────────────────────────────────────────────────
  LA RARETÉ, ET POURQUOI ELLE N'EST PAS TIRÉE AU SORT
────────────────────────────────────────────────────────────────────────────

L'idée vient du vocabulaire des cartes à collectionner, et elle est bonne : un
rang lisible d'un coup d'œil vaut mieux qu'une colonne de décimales. Mais une
rareté tirée au hasard serait une décoration qui ment.

Celle-ci est **dérivée de ce qui a été mesuré**, et entièrement explicable :
elle combine le verdict de l'épreuve, le relief, et le nombre d'actifs
indépendants sur lesquels la recette tient. Une carte rare est une carte qui a
survécu à plus de choses — pas une carte qui a eu de la chance au tirage.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

RACINE = Path(__file__).resolve().parents[2]
DONNEES = RACINE / "data"
BIBLIO = DONNEES / "biblio.jsonl"

# Les rangs de rareté, du plus commun au plus rare. L'ordre est celui de la
# liste, et il est utilise tel quel : un rang ajoute au milieu deplacerait
# tous les suivants, donc on ajoute a la fin.
RARETES = ("commune", "peu commune", "rare", "très rare", "légendaire")


@dataclass(frozen=True)
class Ticket:
    """Une recette, sans aucun résultat. C'est ce qui s'échange."""

    # --- l'identité ---
    cle: str
    strategie: str
    actif: str
    intervalle: str
    parametres: dict[str, Any]

    # --- ce que la recette DIT, en clair ---
    # Le briefing demande « indicateurs, params, SL/TP, TF, ticker, signal ».
    # Les trois derniers champs sont en prose parce qu'ils décrivent une
    # intention, et qu'une intention encodée en drapeaux se relit mal deux
    # mois plus tard.
    indicateurs: tuple[str, ...] = ()
    signal: str = ""
    stop: str = ""
    cible: str = ""

    # --- d'où elle vient ---
    # `origine` est la même énumération que celle du registre de l'atelier :
    # c'est elle qui décide du dénominateur, et deux vocabulaires divergeraient.
    origine: str = "main"
    auteur: str = ""
    inscrit_ms: int = 0
    note_libre: str = ""

    def empreinte(self) -> str:
        """L'identité de la RECETTE, indépendante de qui la détient.

        Deux desks qui écrivent la même recette produisent la même empreinte,
        ce qui permet de reconnaître un doublon à l'import. L'auteur et la
        date n'y entrent pas : ils disent qui l'a écrite, pas ce qu'elle est.
        """
        return hashlib.sha256(json.dumps({
            "s": self.strategie, "a": self.actif, "i": self.intervalle,
            "p": {k: self.parametres[k] for k in sorted(self.parametres)},
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]

    def en_dict(self) -> dict[str, Any]:
        return {
            "cle": self.cle, "empreinte": self.empreinte(),
            "strategie": self.strategie, "actif": self.actif,
            "intervalle": self.intervalle, "parametres": self.parametres,
            "indicateurs": list(self.indicateurs), "signal": self.signal,
            "stop": self.stop, "cible": self.cible,
            "origine": self.origine, "auteur": self.auteur,
            "inscrit_ms": self.inscrit_ms, "note_libre": self.note_libre,
        }

    @staticmethod
    def de_dict(d: dict[str, Any]) -> "Ticket":
        return Ticket(
            cle=str(d.get("cle") or ""), strategie=str(d.get("strategie") or ""),
            actif=str(d.get("actif") or ""),
            intervalle=str(d.get("intervalle") or ""),
            parametres=dict(d.get("parametres") or {}),
            indicateurs=tuple(d.get("indicateurs") or ()),
            signal=str(d.get("signal") or ""), stop=str(d.get("stop") or ""),
            cible=str(d.get("cible") or ""),
            origine=str(d.get("origine") or "main"),
            auteur=str(d.get("auteur") or ""),
            inscrit_ms=int(d.get("inscrit_ms") or 0),
            note_libre=str(d.get("note_libre") or ""),
        )


def ticket_depuis_essai(essai: dict[str, Any], *, auteur: str = "",
                        signal: str = "", stop: str = "",
                        cible: str = "") -> Ticket:
    """Fabrique un ticket à partir d'une ligne du registre de l'atelier.

    Les champs en prose ne sont pas devinés : une description inventée est
    pire qu'une case vide, parce qu'elle a l'air d'avoir été écrite par
    quelqu'un.
    """
    from .backtest.strategies import BASELINES

    nom = str(essai.get("strategie") or "")
    cls = BASELINES.get(nom)
    indicateurs = tuple(sorted({
        k.split("_")[0] for k in (essai.get("parametres") or {})
        if any(m in k for m in ("atr", "rsi", "adx", "ema", "period", "mult"))
    }))
    return Ticket(
        cle=f"{nom}_{str(essai.get('actif','')).lower()}_"
            f"{essai.get('intervalle','')}",
        strategie=nom, actif=str(essai.get("actif") or ""),
        intervalle=str(essai.get("intervalle") or ""),
        parametres=dict(essai.get("parametres") or {}),
        indicateurs=indicateurs,
        signal=signal or ((cls.__doc__ or "").strip().splitlines() or [""])[0],
        stop=stop, cible=cible,
        origine=str(essai.get("origine") or "main"),
        auteur=auteur, inscrit_ms=int(essai.get("essai_ms") or 0),
    )


# ──────────────────────────────────────────────────────────── la rareté

def rarete(*, retenue_par_l_epreuve: bool, relief: float | None,
           actifs_independants: int, deployable: bool) -> tuple[str, str]:
    """Le rang, et la phrase qui l'explique.

    **Dérivée, jamais tirée.** Une rareté au hasard serait une décoration qui
    ment : elle donnerait le frisson d'une trouvaille à une carte qui n'a rien
    prouvé. Celle-ci compte ce à quoi la recette a survécu.

    Rend aussi le motif, parce qu'un rang sans motif se lit comme un verdict
    alors que c'est un résumé.
    """
    points = 0
    motifs = []
    if deployable:
        points += 1
        motifs.append("franchit les deux portes")
    if retenue_par_l_epreuve:
        points += 2
        motifs.append("retenue par l'épreuve")
    if relief is not None and relief >= 0.75:
        points += 1
        motifs.append(f"plateau ({relief:.0%} des voisins gagnent)")
    if actifs_independants >= 2:
        points += 1
        motifs.append(f"tient sur {actifs_independants} actifs")

    rang = RARETES[min(points, len(RARETES) - 1)]
    return rang, " · ".join(motifs) or "rien de mesuré ne la distingue"


# ──────────────────────────────────────────────────────────── la carte

# Les colonnes demandées par le briefing, dans l'ordre. Elles sont déclarées
# ICI et lues par l'écran : deux listes de colonnes divergeraient, et la
# divergence se verrait comme une carte incomplète plutôt que comme un bug.
COLONNES = (
    ("note", "Note"), ("rarete", "Rareté"), ("xp_live", "XP live"),
    ("annualise_pct", "%/an"), ("trades", "Trades"), ("duree_j", "Durée"),
    ("regimes", "Saisons"), ("origine", "Provenance"),
    ("paper_pnl_usd", "PnL paper"), ("live_pnl_usd", "PnL live"),
    ("relief", "Relief"), ("vs_buy_hold", "vs B&H"),
    ("annualise_usd", "Annualisé $"),
)


def carte(ticket: Ticket, essai: dict[str, Any], verdict_etat: str, *,
          actifs_independants: int = 1, xp_live: int = 0,
          live_pnl_usd: float | None = None,
          regimes: str = "") -> dict[str, Any]:
    """Le ticket plus ses mesures, dans les colonnes de l'écran.

    `live_pnl_usd` vaut `None` tant qu'aucun ordre réel n'a été passé, et
    **None n'est pas zéro** : zéro dirait « tradé, sans résultat », None dit
    « jamais tradé ». Le desk est en PAPER, donc c'est None partout, et c'est
    une information.
    """
    note = essai.get("note") or {}
    rang, motif = rarete(
        retenue_par_l_epreuve=(verdict_etat == "RETENUE"),
        relief=note.get("relief"),
        actifs_independants=actifs_independants,
        deployable=bool(note.get("deployable")),
    )
    return {
        "cle": ticket.cle, "empreinte": ticket.empreinte(),
        "strategie": ticket.strategie, "actif": ticket.actif,
        "intervalle": ticket.intervalle, "parametres": ticket.parametres,
        "indicateurs": list(ticket.indicateurs),
        "note": note.get("note_sur_10"),
        "deployable": bool(note.get("deployable")),
        "epreuve": verdict_etat,
        "rarete": rang, "rarete_motif": motif,
        "xp_live": xp_live,
        "annualise_pct": note.get("annualise_pct"),
        "annualise_usd": note.get("annualise_usd"),
        "vs_buy_hold": (
            None if note.get("annualise_pct") is None
            else round(note["annualise_pct"] - (note.get("buy_hold_annualise_pct") or 0), 2)),
        "trades": essai.get("trades"),
        "duree_j": note.get("jours"),
        "regimes": regimes,
        "origine": ticket.origine,
        "auteur": ticket.auteur,
        "paper_pnl_usd": essai.get("net_usd"),
        "live_pnl_usd": live_pnl_usd,
        "relief": note.get("relief"),
        "p": essai.get("p"),
    }


# ─────────────────────────────────────────────────────── la bibliothèque

def inscrire(ticket: Ticket, chemin: Path | None = None) -> Path:
    """Ajoute un ticket. En ajout seul, comme le registre et pour la même
    raison : une bibliothèque qu'on peut nettoyer ne documente plus que les
    recettes dont on se souvient avec plaisir."""
    p = chemin or BIBLIO
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ticket.en_dict(), ensure_ascii=False) + "\n")
    return p


def lire(chemin: Path | None = None) -> list[Ticket]:
    """La bibliothèque, une entrée par EMPREINTE, la plus récente.

    Une ligne illisible est sautée, pas fatale : un fichier en ajout seul peut
    se terminer par une ligne tronquée si le processus est tué en écriture.
    """
    p = chemin or BIBLIO
    if not p.exists():
        return []
    par_empreinte: dict[str, Ticket] = {}
    for ligne in p.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            d = json.loads(ligne)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("strategie"):
            t = Ticket.de_dict(d)
            par_empreinte[t.empreinte()] = t
    return list(par_empreinte.values())


def importer(tickets: list[Ticket], chemin: Path | None = None,
             *, origine: str = "externe") -> tuple[int, int]:
    """Importe des tickets d'un autre desk. Rend (importés, doublons ignorés).

    **L'origine est FORCÉE à `externe`.** Un ticket qui arriverait avec
    `origine="main"` se mélangerait au dénominateur des idées du desk, et
    trente recettes importées feraient porter à trois idées réfléchies le
    poids statistique de trente essais qu'elles n'ont pas demandés.

    C'est la seule ligne de ce module qui empêche l'échange de casser la
    statistique des deux côtés.
    """
    connus = {t.empreinte() for t in lire(chemin)}
    importes = doublons = 0
    for t in tickets:
        if t.empreinte() in connus:
            doublons += 1
            continue
        inscrire(Ticket(**{**t.__dict__, "origine": origine}), chemin)
        connus.add(t.empreinte())
        importes += 1
    return importes, doublons


# ────────────────────────────────────────────────────────── la recherche

def chercher(cartes: list[dict[str, Any]], *, texte: str = "",
             origine: str = "", rarete_min: str = "",
             deployable: bool | None = None, epreuve: str = "",
             note_min: float | None = None, actif: str = "",
             intervalle: str = "", trie_par: str = "rarete"
             ) -> list[dict[str, Any]]:
    """Filtre et trie les cartes. Tous les criteres se cumulent.

    **Le tri par defaut n'est PAS le rendement.** C'est le piege permanent
    d'un tableau de strategies : la colonne qui donne envie est celle qui ne
    doit pas decider. Le defaut est la rarete, qui incorpore le verdict de
    l'epreuve ; le rendement reste triable, explicitement.

    Le texte libre cherche dans la strategie, l'actif, l'auteur et les
    indicateurs — pas dans les parametres. Chercher « 20 » ramenerait toutes
    les recettes qui ont un vingt quelque part, ce qui n'est pas une
    recherche, c'est du bruit.
    """
    t = texte.strip().lower()
    rang = {r: i for i, r in enumerate(RARETES)}
    seuil_rarete = rang.get(rarete_min, -1) if rarete_min else -1

    out = []
    for c in cartes:
        if t:
            champs = " ".join(str(c.get(k) or "") for k in
                              ("strategie", "actif", "auteur", "cle",
                               "intervalle", "origine")).lower()
            champs += " " + " ".join(str(x) for x in (c.get("indicateurs") or []))
            if t not in champs.lower():
                continue
        if origine and c.get("origine") != origine:
            continue
        if actif and c.get("actif") != actif:
            continue
        if intervalle and c.get("intervalle") != intervalle:
            continue
        if epreuve and c.get("epreuve") != epreuve:
            continue
        if deployable is not None and bool(c.get("deployable")) is not deployable:
            continue
        if seuil_rarete >= 0 and rang.get(str(c.get("rarete")), -1) < seuil_rarete:
            continue
        if note_min is not None and (c.get("note") or 0) < note_min:
            continue
        out.append(c)

    if trie_par == "note":
        out.sort(key=lambda c: -(c.get("note") or 0))
    elif trie_par == "rendement":
        out.sort(key=lambda c: -(c.get("annualise_pct") or -999))
    elif trie_par == "vs_buy_hold":
        out.sort(key=lambda c: -(c.get("vs_buy_hold") or -999))
    else:
        out.sort(key=lambda c: (-rang.get(str(c.get("rarete")), -1),
                                -(c.get("note") or 0)))
    return out


def facettes(cartes: list[dict[str, Any]]) -> dict[str, list]:
    """Les valeurs presentes, pour peupler les filtres de l'ecran.

    Lues depuis les cartes plutot que codees en dur : une liste figee
    proposerait des filtres qui ne ramenent rien, et en cacherait qui
    existent.
    """
    def uniques(cle):
        return sorted({str(c.get(cle)) for c in cartes if c.get(cle)})
    return {
        "origines": uniques("origine"), "actifs": uniques("actif"),
        "intervalles": uniques("intervalle"), "epreuves": uniques("epreuve"),
        "raretes": [r for r in RARETES
                    if any(c.get("rarete") == r for c in cartes)],
    }
