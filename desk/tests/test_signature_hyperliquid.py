"""La signature Hyperliquid, confrontee a l'implementation de reference.

C'est le test le plus consequent du depot : il est la seule chose qui separe
« notre code croit signer correctement » de « notre code signe comme ce qui
tourne en production chez tout le monde ». Une signature fausse ne fait pas
planter le desk — elle fait refuser un ordre, parfois, avec de l'argent
engage et rien pour reproduire.

Il a deja servi. Nous emettions `r` et `s` sur trente-deux octets pleins,
zeros de tete compris, la ou le SDK emet le minimum : `0x4bce…` contre
`0x04bce…`. Meme entier, encodage different — et sur 2 000 signatures les
deux formes divergent dans **16,3 %** des cas. Le pire profil de panne
possible : cinq ordres sur six passent, le sixieme est refuse.

Les vecteurs sont figes (`tests/vecteurs_signature.json`) et rejoues
inconditionnellement. Le SDK, lorsqu'il est installe, est confronte en plus.
Un test qui se met en `skip` faute de paquet ne garde rien le jour ou il
compte — c'est pour ca que les vecteurs sont versionnes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from trading_desk.execution.hyperliquid_wire import (
    action_hash,
    l1_payload,
    sign_l1_action,
)

VECTEURS = json.loads(
    (Path(__file__).parent / "vecteurs_signature.json").read_text(encoding="utf-8"))
CAS = VECTEURS["vecteurs"]
CLE = VECTEURS["cle"]


def _ids() -> list[str]:
    return [v["nom"] for v in CAS]


@pytest.mark.parametrize("v", CAS, ids=_ids())
def test_le_hash_d_action_est_celui_du_sdk(v):
    """msgpack → nonce → marqueur de coffre → expiration, puis keccak.

    Toute permutation de cette concatenation donne un hash different, donc
    une signature refusee par l'exchange sans autre explication.
    """
    calcule = action_hash(v["action"], v["nonce"],
                          vault_address=v["vault"],
                          expires_after_ms=v["expires_after_ms"])
    assert calcule.hex() == v["action_hash"], v["nom"]


@pytest.mark.parametrize("v", CAS, ids=_ids())
def test_la_signature_est_celle_du_sdk(v):
    """Y compris l'ENCODAGE, pas seulement la valeur.

    Comparer `int(r, 16)` laisserait passer exactement le defaut qu'on a
    trouve. C'est la chaine qui part sur le reseau ; c'est elle qu'on compare.
    """
    signe = sign_l1_action(CLE, v["action"], v["nonce"],
                           is_mainnet=v["is_mainnet"],
                           vault_address=v["vault"],
                           expires_after_ms=v["expires_after_ms"])
    assert signe == v["signature"], v["nom"]


def test_les_vecteurs_couvrent_ce_qui_compte():
    """Un jeu de vecteurs qui ne couvre qu'un ordre limite ne prouve rien."""
    noms = " ".join(v["nom"] for v in CAS)
    for attendu in ("limite", "Ioc", "stop declencheur", "annulation",
                    "coffre", "expiration", "groupes", "nonce maximal"):
        assert attendu in noms, f"aucun vecteur pour : {attendu}"
    assert any(v["is_mainnet"] for v in CAS)
    assert any(not v["is_mainnet"] for v in CAS)


def test_le_reseau_ne_change_que_la_source_de_l_agent():
    """chainId reste 1337 des deux cotes ; seul `source` distingue les reseaux.

    Signer une action de testnet avec l'identifiant de chaine d'Arbitrum est
    l'erreur classique : la requete est par ailleurs impeccable et revient en
    INVALID_SIGNATURE, ce qui envoie chercher le defaut partout ailleurs.
    """
    digest = b"\x11" * 32
    principal = l1_payload(digest, is_mainnet=True)
    secondaire = l1_payload(digest, is_mainnet=False)
    assert principal["domain"]["chainId"] == 1337
    assert secondaire["domain"]["chainId"] == 1337
    assert principal["message"]["source"] == "a"
    assert secondaire["message"]["source"] == "b"
    assert principal["domain"] == secondaire["domain"]


def test_un_meme_vecteur_donne_deux_signatures_selon_le_reseau():
    """Sinon `source` ne serait pas dans le message signe, et un ordre de
    testnet serait rejouable sur le mainnet."""
    paires = {}
    for v in CAS:
        cle = (json.dumps(v["action"], sort_keys=True), v["nonce"],
               v["vault"], v["expires_after_ms"])
        paires.setdefault(cle, []).append(v["signature"]["r"])
    communs = [r for r in paires.values() if len(r) == 2]
    assert communs, "aucun cas n'est present sur les deux reseaux"
    for mainnet, testnet in communs:
        assert mainnet != testnet


@pytest.mark.parametrize("v", CAS[:6], ids=_ids()[:6])
def test_confrontation_directe_au_sdk_quand_il_est_installe(v):
    """Detecte une evolution de l'implementation de reference.

    Les vecteurs figes prouvent que nous n'avons pas derive ; celui-ci
    prouve que la reference n'a pas derive non plus.
    """
    sdk = pytest.importorskip("hyperliquid.utils.signing",
                              reason="hyperliquid-python-sdk non installe")
    eth_account = pytest.importorskip("eth_account")

    portefeuille = eth_account.Account.from_key(CLE)
    attendu = sdk.sign_l1_action(portefeuille, v["action"], v["vault"],
                                 v["nonce"], v["expires_after_ms"],
                                 v["is_mainnet"])
    obtenu = sign_l1_action(CLE, v["action"], v["nonce"],
                            is_mainnet=v["is_mainnet"],
                            vault_address=v["vault"],
                            expires_after_ms=v["expires_after_ms"])
    assert obtenu == attendu, (
        f"{v['nom']} : divergence avec le SDK installe. Si le SDK a change, "
        "regenerer les vecteurs avec scripts/vecteurs_signature.py et lire "
        "le diff AVANT de le committer.")
