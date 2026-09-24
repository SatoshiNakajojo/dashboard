"""La part du capital qu'une position prend vraiment. **L'ecart est ferme.**

Ce module est ne d'un constat : le desk prenait 3,3 % du capital par position
la ou la validation de la regle des deblocages en suppose 25 %, et personne
n'avait choisi ce chiffre — il tombait d'une division entre deux reglages
faits pour d'autres raisons.

**Le 24 septembre 2026, l'ecart a ete ferme** : `risk_per_trade_pct` est passe
de 0,5 a 3,75 %, et la fraction deployee vaut desormais les 25 % valides. La
mesure du glissement du 15 septembre avait retire le dernier obstacle — a
200 000 $ sur BTC le cout d'execution vaut encore 1,58 bps, sous les 3,0
supposes par le modele de couts.

Le module ne disparait pas pour autant, et pour deux raisons qui comptent
davantage maintenant que la taille est grande :

- **le quotient peut encore mentir.** Sous un stop de 7,5 %, il reclame plus
  que ce que les plafonds de notionnel autorisent, et c'est le plafond qui
  decide. `fraction_reelle_pct` donne ce que le moteur prend vraiment ;
- **les plafonds sont en dollars, la taille en fraction.** Ils ne mordent pas
  a 1 000 $ d'equite et mordront a 10 000 $. Le jour ou le capital montera,
  c'est ici que ca se verra.

────────────────────────────────────────────────────────────────────────────
  CE QUE CE MODULE REND VISIBLE, ET QUI NE L'ETAIT PAS
────────────────────────────────────────────────────────────────────────────

**Les 3,3 % n'ont jamais ete decides.** Ils tombent d'une division entre deux
reglages choisis pour d'autres raisons :

    fraction du capital = risque par trade / distance au stop
                  3,3 % =          0,5 %    /        15 %

Le budget de risque a ete fixe a 0,5 % parce que c'est une valeur prudente
classique. Le stop a ete pose a 15 % parce que les jetons concernes bougent de
plus de 5 % par jour et qu'un stop serre sortirait au bruit. Ni l'un ni l'autre
n'a ete choisi en pensant a la taille de position, et leur quotient non plus.

C'est la forme la plus courante d'un reglage qui derive : **un nombre que
personne n'a pose et que personne ne relit**, parce qu'il n'apparait nulle
part. Ce module le calcule et l'affiche, avec son inverse — ce qu'il faudrait
regler pour viser une fraction donnee.

Il ne change AUCUNE valeur deployee. Rendre un reglage visible et le modifier
sont deux actes differents, et le second appartient a qui porte le risque.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

# Ce que la validation de la regle des deblocages suppose. Inscrit ici comme
# repere, jamais applique : c'est la reference contre laquelle on lit le
# deploye, pas une valeur cible que le code irait chercher tout seul.
FRACTION_VALIDEE_PCT = Decimal("25")


@dataclass(frozen=True)
class Plafond:
    nom: str
    fraction_max_pct: Decimal

    def mord(self, fraction_pct: Decimal) -> bool:
        return fraction_pct > self.fraction_max_pct


def fraction_par_position_pct(risque_par_trade_pct: Decimal,
                              stop_pct: Decimal) -> Decimal:
    """La part du capital qu'une position prend, en pourcent.

    `taille = budget de risque / distance au stop`, et le budget de risque
    vaut `capital x risque_par_trade`. La fraction du capital est donc
    `risque_par_trade / stop`, independamment du capital — ce qui explique
    qu'elle n'apparaisse dans aucun reglage : elle n'est le reglage de
    personne.
    """
    if stop_pct <= 0:
        raise ValueError("une distance au stop est strictement positive")
    # `risque_par_trade_pct` est en pourcent, `stop_pct` en fraction : leur
    # quotient est donc deja en pourcent, sans conversion.
    return risque_par_trade_pct / stop_pct


def fraction_reelle_pct(limits, stop_pct: Decimal, equity_usd: Decimal) -> Decimal:
    """La fraction que le moteur prend VRAIMENT, plafonds compris.

    `fraction_par_position_pct` donne le quotient du budget de risque par la
    distance au stop. Tant que ce quotient reste sous les plafonds de
    notionnel, il decrit la taille reelle — et c'est ce qui etait vrai a
    0,5 % de risque, ou la fraction valait 3,3 %.

    A 3,75 %, ce n'est plus vrai partout. Un stop de 5 % demanderait 75 % du
    capital, et le plafond de notionnel par position le ramene a 50 %.
    Afficher 75 % serait afficher un chiffre faux avec l'autorite d'une
    mesure — le defaut exact que ce module existe pour empecher.

    Le plafond n'est pas un accident : c'est lui qui rattrape le cas ou un
    stop serre reclamerait une position demesuree. Il fait descendre la perte
    au stop sous le budget de risque, jamais au-dessus.
    """
    brute = fraction_par_position_pct(limits.risk_per_trade_pct, stop_pct)
    bornes = [p.fraction_max_pct for p in plafonds(limits, equity_usd)]
    return min([brute, *bornes]) if bornes else brute


def stop_minimal_sans_plafond_pct(limits, equity_usd: Decimal) -> Decimal | None:
    """En dessous de quelle distance de stop un plafond commence a mordre.

    C'est le chiffre qui manquait pour lire le reglage : au-dessus, le
    dimensionnement est fonde sur le risque et la perte au stop vaut
    exactement le budget ; en dessous, un plafond prend le relais et la perte
    est moindre.
    """
    bornes = [p.fraction_max_pct for p in plafonds(limits, equity_usd)]
    if not bornes:
        return None
    return limits.risk_per_trade_pct / min(bornes)


def risque_pour_fraction_pct(fraction_cible_pct: Decimal,
                             stop_pct: Decimal) -> Decimal:
    """L'inverse : quel risque par trade vise une fraction donnee.

    C'est le chiffre actionnable. Pour 25 % du capital avec un stop a 15 %, il
    faut regler le risque par trade a 3,75 % — sept fois et demie la valeur
    actuelle, ce qui se voit et se discute, contrairement a un quotient qui
    n'apparait nulle part.
    """
    if stop_pct <= 0:
        raise ValueError("une distance au stop est strictement positive")
    return fraction_cible_pct * stop_pct


def plafonds(limits, equity_usd: Decimal) -> list[Plafond]:
    """Les plafonds de notionnel, traduits en fraction du capital.

    Les limites sont exprimees en dollars et la taille en fraction : tant
    qu'on ne les met pas dans la meme unite, on ne peut pas savoir lequel
    mordrait a une taille donnee. C'est la traduction qui manquait pour que
    la question « peut-on monter a 25 % ? » ait une reponse sans essai.
    """
    if equity_usd <= 0:
        return []
    cent = Decimal("100")
    return [
        Plafond("notionnel max par position",
                limits.max_position_notional_usd / equity_usd * cent),
        Plafond("notionnel brut max",
                limits.max_gross_notional_usd / equity_usd * cent),
        Plafond("levier effectif max",
                limits.max_effective_leverage * cent),
    ]


def diagnostic(limits, *, stop_pct: Decimal,
               equity_usd: Decimal = Decimal("1000"),
               cible_pct: Decimal = FRACTION_VALIDEE_PCT) -> dict:
    """Tout ce qu'il faut pour trancher, en un appel.

    Rend le deploye, la cible, le reglage qui y menerait, et les plafonds qui
    mordraient — parce qu'un reglage change sans regarder les plafonds produit
    un desk qui refuse silencieusement ce qu'on croit avoir autorise.
    """
    deployee = fraction_par_position_pct(limits.risk_per_trade_pct, stop_pct)
    reelle = fraction_reelle_pct(limits, stop_pct, equity_usd)
    seuil = stop_minimal_sans_plafond_pct(limits, equity_usd)
    requis = risque_pour_fraction_pct(cible_pct, stop_pct)
    bloquants = [p for p in plafonds(limits, equity_usd) if p.mord(cible_pct)]
    return {
        "fraction_deployee_pct": float(deployee),
        # CE QUE LE MOTEUR PREND VRAIMENT. Les deux ont diverge le jour ou le
        # risque par trade est passe a 3,75 % : sous un stop de 7,5 %, le
        # plafond de notionnel mord et la formule seule mentirait.
        "fraction_reelle_pct": float(reelle),
        "plafonnee": bool(reelle < deployee),
        "stop_min_sans_plafond_pct": (None if seuil is None
                                      else float(seuil * Decimal("100"))),
        "fraction_cible_pct": float(cible_pct),
        "risque_par_trade_actuel_pct": float(limits.risk_per_trade_pct),
        "risque_par_trade_requis_pct": float(requis),
        "stop_pct": float(stop_pct * Decimal("100")),
        "facteur": float(cible_pct / deployee) if deployee > 0 else None,
        "plafonds": [{"nom": p.nom, "fraction_max_pct": float(p.fraction_max_pct)}
                     for p in plafonds(limits, equity_usd)],
        "plafonds_bloquants": [p.nom for p in bloquants],
        # Personne n'a pose ce chiffre : il tombe d'une division entre deux
        # reglages faits pour d'autres raisons. C'est la phrase qui justifie
        # l'existence du panneau.
        "emergente": True,
    }
