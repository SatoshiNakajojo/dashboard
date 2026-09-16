"""La poussee : le PnL realise, converti en distance parcourue.

L'idee vient de la conversation du 15 septembre 2026 :

    « Tes profits generent la poussee de ton vaisseau, du coup tu parcours une
      distance. […] Ce serait genial d'avoir un onglet dans le cockpit ou tu
      cliques et tu as ta position GPS en direct. »

Ca peut passer pour de la decoration. Ca n'en est pas, pour une raison
precise : **la partie la plus dure de la discipline des regles figees est de
ne pas y toucher pendant trois mois.** Un tableau de p qui ne bouge pas ne
donne envie de rien. Une distance qui avance, si.

────────────────────────────────────────────────────────────────────────────
  CE QUE CE MODULE NE FAIT PAS
────────────────────────────────────────────────────────────────────────────

Aucune taille virtuelle, aucune projection, aucun « ce que ca aurait donne ».
**La distance est le PnL realise, et rien d'autre.** Un compteur qui
afficherait ce que le desk aurait parcouru a pleine taille serait un jeu
video : il donnerait la satisfaction sans le resultat, ce qui est exactement
l'inverse de ce qu'on veut d'un instrument.

Le PnL realise n'est d'ailleurs pas toujours disponible : position ouverte, le
cumul de tresorerie melange du realise et du cout d'entree. Le panneau des
vols le dit deja ; ce module rend `None` plutot qu'un chiffre approchant.

────────────────────────────────────────────────────────────────────────────
  POURQUOI L'UNITE EST CE QU'ELLE EST
────────────────────────────────────────────────────────────────────────────

Un kilometre par dollar serait arbitraire. L'echelle est donc calee sur une
grandeur qui a un sens pour ce desk : **un tour de Terre = une annee a la
taille VALIDEE.**

    40 075 km / 480 $ par an (48 %/an sur 1 000 $) = 83,49 km par dollar

Consequence, et c'est elle qui rend le compteur utile plutot que joli : a la
taille DEPLOYEE — 3,3 % du capital, environ 5 %/an, soit 50 $ par an — une
annee entiere fait 4 175 km, c'est-a-dire **un dixieme de tour**. L'ecart de
taille cesse d'etre une ligne dans un tableau et devient quelque chose qu'on
voit avancer, ou ne pas avancer.

Le desk ne passe aucun ordre depuis cette interface, et ce module n'en passe
evidemment pas non plus : il lit un cumul et le divise.
"""

from __future__ import annotations

from dataclasses import dataclass

# Le tour de Terre a l'equateur.
CIRCONFERENCE_KM = 40_075.0

# Le capital de reference et les deux rendements MESURES pour la regle des
# deblocages, a deux tailles de position. Ils vivent aussi dans
# `rentabilite.py` ; ici ils servent a caler une echelle, la-bas a decider
# d'une depense.
CAPITAL_REFERENCE_USD = 1_000.0
RENDEMENT_VALIDE = 0.48
RENDEMENT_DEPLOYE = 0.05

# Un tour de Terre par an a la taille validee. Voir l'en-tete.
KM_PAR_DOLLAR = CIRCONFERENCE_KM / (CAPITAL_REFERENCE_USD * RENDEMENT_VALIDE)

JOURS_PAR_AN = 365.25


@dataclass(frozen=True)
class Etat:
    pnl_realise_usd: float
    distance_km: float
    tours: int
    fraction_tour: float
    jours_ecoules: float
    km_par_jour: float

    @property
    def jours_avant_le_prochain_tour(self) -> float | None:
        """None quand le vaisseau n'avance pas — et c'est une information.

        Rendre un tres grand nombre laisserait croire a une progression lente ;
        un desk a l'arret n'arrivera jamais, ce qui n'est pas la meme chose.
        """
        if self.km_par_jour <= 0:
            return None
        restant = CIRCONFERENCE_KM * (1 - self.fraction_tour)
        return restant / self.km_par_jour


def distance_km(pnl_usd: float) -> float:
    """Le PnL realise, en kilometres. Une perte recule le vaisseau."""
    return pnl_usd * KM_PAR_DOLLAR


def etat(pnl_realise_usd: float | None, jours_ecoules: float) -> Etat | None:
    """L'etat du vaisseau, ou None si le PnL realise n'est pas disponible.

    `None` plutot qu'un zero : position ouverte, le cumul de tresorerie
    melange du realise et du cout d'entree, et afficher ce melange comme une
    distance ferait reculer le vaisseau a chaque ouverture.
    """
    if pnl_realise_usd is None:
        return None
    d = distance_km(pnl_realise_usd)
    tours = int(abs(d) // CIRCONFERENCE_KM) * (1 if d >= 0 else -1)
    fraction = (abs(d) % CIRCONFERENCE_KM) / CIRCONFERENCE_KM
    return Etat(
        pnl_realise_usd=pnl_realise_usd,
        distance_km=d,
        tours=tours,
        fraction_tour=fraction,
        jours_ecoules=jours_ecoules,
        km_par_jour=d / jours_ecoules if jours_ecoules > 0 else 0.0,
    )


def rythme_attendu_km_par_an(rendement_annuel: float,
                             capital_usd: float = CAPITAL_REFERENCE_USD
                             ) -> float:
    """Ce qu'une annee rapporte en kilometres, a un rendement donne.

    Sert a poser les deux reperes de l'ecran : ce que fait le desk tel qu'il
    est regle, et ce qu'il ferait a la taille sur laquelle sa regle a ete
    validee. **Ce sont des reperes, pas une projection du vaisseau** — la
    distance affichee reste le PnL realise.
    """
    return capital_usd * rendement_annuel * KM_PAR_DOLLAR


def reperes() -> dict[str, float]:
    return {
        "km_par_dollar": KM_PAR_DOLLAR,
        "circonference_km": CIRCONFERENCE_KM,
        "an_taille_deployee_km": rythme_attendu_km_par_an(RENDEMENT_DEPLOYE),
        "an_taille_validee_km": rythme_attendu_km_par_an(RENDEMENT_VALIDE),
        "tours_par_an_deployee": rythme_attendu_km_par_an(RENDEMENT_DEPLOYE)
        / CIRCONFERENCE_KM,
        "tours_par_an_validee": rythme_attendu_km_par_an(RENDEMENT_VALIDE)
        / CIRCONFERENCE_KM,
    }
