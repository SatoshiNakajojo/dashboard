"""Le seuil de rentabilite : a partir de quel capital une couche d'IA se paie.

Cadrage repris d'une conversation du 15 septembre 2026 avec un ami qui
developpe un bot de trading. Il a la discipline que ce depot n'avait pas : il
connait son cout mensuel et son seuil.

    « Si tous mes agents tournaient en IA […] c'etait 800 boules par mois. Et
      avec le modele que j'ai la, ca me coute 54 dollars par mois. […] Faut
      que je gagne plus de 50 boules pour etre rentable. »

    « En deux jours j'ai crame 20 dollars. C'est pas possible, c'est trop cher
      comme processus. »

    « Ca deviendrait rentable qu'a partir de grosses sommes a lui confier. »

Cette derniere phrase est une question, et elle a une reponse chiffrable. Ce
module la calcule.

────────────────────────────────────────────────────────────────────────────
  CE QUE LE DESK SAIT DEJA, ET QUI REND LE CALCUL SOBRE
────────────────────────────────────────────────────────────────────────────

Les agents LLM de ce depot coutent 0,1335 $ par cycle et ont emis ZERO mandat
sur toute la campagne du 8 septembre 2026. Ils ne tournent pas dans la boucle
principale : ils ne coutent que lorsqu'on les lance. La question n'est donc
pas « combien ca coute », c'est « a partir de quand ca vaudrait le coup de les
brancher en continu ».

**Le calcul est brutal et c'est pour ca qu'il faut l'afficher.** A la taille
deployee — 3,3 % du capital, soit environ 5 %/an sur mille dollars — le desk
gagne quatre dollars et des poussieres par mois. Une couche d'IA a cinquante
dollars par mois coute treize fois ce que le desk rapporte. Meme a la taille
VALIDEE, 25 % du capital et environ 48 %/an, il gagne quarante dollars par
mois : toujours moins que sa facture.

Le seuil de rentabilite n'est pas une opinion sur l'utilite des agents. C'est
une division.
"""

from __future__ import annotations

from dataclasses import dataclass

# Ce que la campagne du 8 septembre 2026 a mesure. Inscrit ici plutot que
# saisi a chaque appel : un chiffre qu'on retape est un chiffre qui derive.
COUT_PAR_CYCLE_USD = 0.1335

# Les deux rendements annuels que le depot a mesures pour la regle des
# deblocages, a deux tailles de position. Ce ne sont pas des projections :
# c'est ce que la periode mesuree a rendu, compose.
RENDEMENT_DEPLOYE = 0.05      # 3,3 % du capital par position
RENDEMENT_VALIDE = 0.48       # 25 % du capital, la taille de la validation

MOIS_PAR_AN = 12
JOURS_PAR_MOIS = 30.44        # 365,25 / 12


@dataclass(frozen=True)
class Verdict:
    cout_mensuel_usd: float
    gain_mensuel_usd: float
    capital_usd: float
    rendement_annuel: float

    @property
    def marge_usd(self) -> float:
        return self.gain_mensuel_usd - self.cout_mensuel_usd

    @property
    def rentable(self) -> bool:
        return self.marge_usd > 0

    @property
    def rapport(self) -> float | None:
        """Combien de fois le cout depasse le gain. None si le gain est nul."""
        if self.gain_mensuel_usd <= 0:
            return None
        return self.cout_mensuel_usd / self.gain_mensuel_usd

    def resume(self) -> str:
        if self.rentable:
            return (f"rentable : {self.gain_mensuel_usd:.2f} $/mois de gain "
                    f"contre {self.cout_mensuel_usd:.2f} $ de facture, marge "
                    f"{self.marge_usd:+.2f} $")
        r = self.rapport
        combien = f", soit {r:.1f} fois le gain" if r is not None else ""
        return (f"déficitaire : {self.cout_mensuel_usd:.2f} $/mois de facture "
                f"pour {self.gain_mensuel_usd:.2f} $ de gain{combien}")


def cout_mensuel_usd(cycles_par_jour: float,
                     cout_par_cycle_usd: float = COUT_PAR_CYCLE_USD) -> float:
    """Ce que couterait une couche d'IA tournant a cette cadence.

    La cadence est un PARAMETRE et non une constante, parce que c'est la seule
    variable que l'on choisit vraiment. Le cout par cycle, lui, est mesure.
    """
    if cycles_par_jour < 0 or cout_par_cycle_usd < 0:
        raise ValueError("une cadence et un cout sont positifs")
    return cycles_par_jour * JOURS_PAR_MOIS * cout_par_cycle_usd


def gain_mensuel_usd(capital_usd: float, rendement_annuel: float) -> float:
    """Le gain mensuel, au taux GEOMETRIQUE.

    La division naive `rendement / 12` est fausse, et elle est fausse du
    mauvais cote. A 48 %/an elle rend 4,00 % par mois ; le taux qui compose
    reellement a 48 % sur douze mois vaut `1,48^(1/12) - 1`, soit 3,32 %. La
    division naive surestime donc le gain de vingt pour cent, et rend le
    seuil de rentabilite d'autant plus optimiste.

    Ce module sert a decider s'il faut payer une couche d'IA. Quand une
    approximation doit pencher, elle penche du cote qui ne fait pas depenser
    — donc du cote du taux compose, meme s'il est moins flatteur.
    """
    if rendement_annuel <= -1:
        raise ValueError("un rendement annuel ne peut pas effacer plus que tout")
    taux_mensuel = (1.0 + rendement_annuel) ** (1.0 / MOIS_PAR_AN) - 1.0
    return capital_usd * taux_mensuel


def juger(capital_usd: float, *, cycles_par_jour: float,
          rendement_annuel: float = RENDEMENT_DEPLOYE,
          cout_par_cycle_usd: float = COUT_PAR_CYCLE_USD) -> Verdict:
    return Verdict(
        cout_mensuel_usd=cout_mensuel_usd(cycles_par_jour, cout_par_cycle_usd),
        gain_mensuel_usd=gain_mensuel_usd(capital_usd, rendement_annuel),
        capital_usd=capital_usd,
        rendement_annuel=rendement_annuel,
    )


def capital_seuil_usd(cycles_par_jour: float,
                      rendement_annuel: float = RENDEMENT_DEPLOYE,
                      cout_par_cycle_usd: float = COUT_PAR_CYCLE_USD
                      ) -> float | None:
    """**Le chiffre de la conversation** : a partir de quel capital ca se paie.

    `capital x taux_mensuel = cout mensuel`, donc
    `capital = cout mensuel / taux_mensuel`, avec le taux GEOMETRIQUE et non
    `rendement / 12` — voir `gain_mensuel_usd` pour le sens de l'ecart.

    Rend None quand le rendement est nul ou negatif : aucun capital ne rend
    rentable une strategie qui ne gagne rien, et rendre un tres grand nombre
    laisserait croire le contraire.
    """
    if rendement_annuel <= 0:
        return None
    taux_mensuel = (1.0 + rendement_annuel) ** (1.0 / MOIS_PAR_AN) - 1.0
    return cout_mensuel_usd(cycles_par_jour, cout_par_cycle_usd) / taux_mensuel


def agents_muets(agents, *, cycles: int, minimum_cycles: int = 50
                 ) -> list[dict]:
    """Les agents qui ont coute sans jamais rien emettre.

    **La regle proposee est mecanique, et c'est le point.** Un agent sans
    mandat apres `minimum_cycles` cycles est debranche, pas debattu : tant
    que la decision reste une discussion, elle se reporte, et la facture
    continue. Le seuil existe pour qu'un agent branche la veille ne soit pas
    juge sur trois cycles.

    Rend la liste de ceux qui remplissent la condition, avec ce qu'ils ont
    coute. Ne debranche rien : couper un agent est une action, et ce module
    ne fait que chiffrer.
    """
    if cycles < minimum_cycles:
        return []
    muets = []
    for nom, a in sorted((agents or {}).items()):
        appels = int(a.get("appels") or 0)
        emis = int(a.get("emis") or 0)
        if appels > 0 and emis == 0:
            cout = float(a.get("cout_par_appel") or 0.0) * appels
            muets.append({"agent": nom, "appels": appels, "cout_usd": cout,
                          "motif": f"{appels} appels, aucun mandat émis sur "
                                   f"{cycles} cycles"})
    return muets
