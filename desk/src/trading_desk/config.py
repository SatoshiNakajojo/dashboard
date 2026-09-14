"""Configuration typee du desk.

Deux precautions valent d'etre soulignees :

- **Le mode par defaut est SHADOW.** Passer en LIVE doit etre un acte
  volontaire et explicite, jamais la consequence d'une variable oubliee.
- **Aucune cle privee n'est lue ici.** La cle de l'agent wallet appartient au
  processus signer, isole. Ce module ne connait que son adresse publique, ce
  qui suffit a verifier l'invariant I12 sans jamais manipuler de secret dans
  le processus qui parle aux LLM.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from .contracts.common import DeskMode
from .risk.limits import RiskLimits


def racine_projet() -> Path | None:
    """Le repertoire du depot, ou None si le paquet est installe en dur.

    Sert a une seule chose : que `desk` marche depuis n'importe ou. Sans
    elle, `.env` et `data/journal_unlocks.jsonl` se resolvent contre le
    repertoire COURANT, donc lancer le desk depuis ailleurs echoue sur un
    « journal absent » qui ne dit pas la vraie cause — on croit que le
    journal manque alors qu'on est juste au mauvais endroit.

    On remonte depuis le fichier du paquet jusqu'a trouver le `pyproject.toml`
    du desk. En installation editable il est la ; en installation figee il ne
    l'est pas, et on rend None plutot que de deviner.
    """
    for parent in Path(__file__).resolve().parents:
        marqueur = parent / "pyproject.toml"
        if marqueur.exists():
            try:
                if 'name = "trading-desk"' in marqueur.read_text(encoding="utf-8"):
                    return parent
            except OSError:
                return None
    return None


def _fichiers_env() -> tuple[str, ...]:
    """`.env` du depot puis celui du repertoire courant.

    L'ordre compte : pydantic-settings donne la priorite au DERNIER. Un
    `.env` pose la ou l'on travaille l'emporte donc sur celui du depot, ce
    qui est le sens attendu — le plus proche gagne.
    """
    racine = racine_projet()
    if racine is None:
        return (".env",)
    return (str(racine / ".env"), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DESK_",
        env_file=_fichiers_env(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- posture ---
    mode: DeskMode = DeskMode.SHADOW
    testnet: bool = True
    # `NoDecode` n'est pas une precaution de style : sans lui,
    # pydantic-settings tente de decoder `DESK_ASSETS` en JSON AVANT que le
    # validateur ci-dessous ne le voie, et `BTC,ETH` — la valeur que
    # `.env.example` documente — fait echouer le demarrage sur un
    # `SettingsError` qui ne nomme meme pas la cause.
    #
    # Le bug etait la depuis l'origine et ne se declenchait que pour qui
    # copiait `.env.example` en `.env`, c'est-a-dire tout le monde au premier
    # demarrage. Trouve le 9 septembre 2026 en lancant le mode PAPER.
    assets: Annotated[tuple[str, ...], NoDecode] = ("BTC", "ETH")

    # --- persistance ---
    db_path: str = "desk.db"
    postgres_dsn: str | None = None

    # --- supervision ---
    api_host: str = "127.0.0.1"
    api_port: int = 8787
    # Ou l'enregistreur ecrit ses Parquet. Vide sur une machine de
    # developpement : la collecte tourne sur le VPS, et l'interface doit dire
    # « ailleurs » plutot que d'afficher zero fichier comme si le collecteur
    # etait en panne.
    enregistreur_racine: str | None = None

    # --- mode PAPER ---
    # L'equite de depart du simulateur. Volontairement petite : une equite
    # papier genereuse produit des tailles qu'aucun carnet d'alt n'absorbe, et
    # le moteur les tronque — on mesure alors la troncature, pas la strategie.
    paper_equity_usd: Decimal = Decimal("1000")
    # Le fichier que le pilote de deblocages lit. Ses positions ont ete
    # inscrites AVANT les faits ; le desk ne trade que celles-la.
    paper_journal: str = "data/journal_unlocks.jsonl"

    # --- signer (adresses publiques uniquement) ---
    agent_wallet_address: str | None = None
    master_wallet_address: str | None = None
    signer_can_withdraw: bool = False

    # --- garde-fous operationnels ---
    prompt_isolation_enabled: bool = True
    max_daily_loss_pct: Decimal = Decimal("2")
    max_gross_notional_usd: Decimal = Decimal("1000")
    max_position_notional_usd: Decimal = Decimal("500")
    risk_per_trade_pct: Decimal = Decimal("0.5")
    max_effective_leverage: Decimal = Decimal("3")

    # La bande de distance de stop, en points de base. Le defaut [30, 500] a
    # ete calibre pour du BTC intraday, ou 5 % est deja tres large.
    #
    # Il ne convient PAS a tout : la regle des deblocages tient des alts six
    # jours, et un stop a 5 % sur un jeton dont la volatilite quotidienne
    # depasse 5 % se fait balayer par le bruit avant la fin de la fenetre.
    # Le desserrer globalement affaiblirait le garde-fou pour tout le monde ;
    # le rendre configurable laisse chaque deploiement declarer l'horizon
    # qu'il trade, et la fourchette du mandat reste le controle FIN,
    # decision par decision.
    #
    # Le plafond absolu reste 5000 bps : c'est le maximum que `StopBand`
    # autorise, et il n'est pas negociable ici.
    min_stop_distance_bps: Decimal = Decimal("30")
    # Voir `risk/limits.py` : 500 refusait toutes les entrees de la seule
    # strategie livree, qui pose son stop a 1500 bps. Elargir ne change pas
    # le risque par trade — le dimensionnement est fonde sur le risque.
    max_stop_distance_bps: Decimal = Decimal("1600")

    @field_validator("assets", mode="before")
    @classmethod
    def _split(cls, v: object) -> object:
        if isinstance(v, str):
            return tuple(a.strip().upper() for a in v.split(",") if a.strip())
        return v

    @model_validator(mode="after")
    def _resoudre_les_chemins(self) -> Settings:
        """Un chemin relatif se resout d'abord ici, ensuite dans le depot.

        Le repertoire courant d'abord : c'est le plus specifique, et
        quelqu'un qui pose un `data/` a cote de lui veut le sien. Le depot
        ensuite, pour que `desk` lance depuis la maison trouve quand meme le
        journal.

        On ne resout QUE si le fichier existe a l'arrivee. Un chemin qui
        n'existe nulle part reste tel quel : le message d'erreur doit parler
        de ce que l'utilisateur a ecrit, pas d'un chemin absolu qu'il n'a
        jamais tape.
        """
        racine = racine_projet()
        if racine is None:
            return self
        for champ in ("paper_journal",):
            valeur = getattr(self, champ)
            if not valeur or Path(valeur).is_absolute():
                continue
            if Path(valeur).exists():
                continue                      # trouve ici : on ne touche a rien
            depuis_depot = racine / valeur
            if depuis_depot.exists():
                object.__setattr__(self, champ, str(depuis_depot))
        return self

    @model_validator(mode="after")
    def _live_requires_proof(self) -> Settings:
        """On refuse de demarrer en LIVE sans les preuves d'isolation.

        Le controle est ici, au demarrage, plutot qu'a la premiere signature :
        un desk mal configure doit refuser de se lancer, pas decouvrir le
        probleme avec une position ouverte.
        """
        if self.mode is DeskMode.TESTNET:
            # TESTNET signe de vrais ordres. Aucun argent n'est en jeu, mais
            # tout le reste est reel — et c'est le mode qui doit prouver que
            # la configuration tient AVANT qu'on parle de LIVE. Le refus est
            # ici, au demarrage : un desk mal configure doit refuser de se
            # lancer, pas le decouvrir avec une position ouverte.
            if not self.testnet:
                raise ValueError(
                    "mode TESTNET avec testnet=False : le desk enverrait des "
                    "ordres sur le mainnet en croyant etre en bac a sable."
                )
            if not self.agent_wallet_address:
                raise ValueError(
                    "mode TESTNET : agent_wallet_address est obligatoire. "
                    "Sans elle, la reconciliation lit le compte de personne "
                    "et l'invariant I01 passerait au vert a tort."
                )

        if self.mode is DeskMode.LIVE:
            if self.testnet:
                raise ValueError("mode LIVE incompatible avec testnet=True")
            if not self.agent_wallet_address:
                raise ValueError("mode LIVE : agent_wallet_address est obligatoire")
            if self.signer_can_withdraw:
                raise ValueError(
                    "mode LIVE : la cle en ligne ne doit pas avoir le droit de retrait. "
                    "Utiliser un agent wallet Hyperliquid approuve par le master."
                )
            if self.agent_wallet_address == self.master_wallet_address:
                raise ValueError(
                    "mode LIVE : le signer utilise le master wallet. "
                    "Approuver un agent wallet dedie."
                )
        return self

    def risk_limits(self) -> RiskLimits:
        limites = dict(
            max_daily_loss_pct=self.max_daily_loss_pct,
            max_gross_notional_usd=self.max_gross_notional_usd,
            max_position_notional_usd=self.max_position_notional_usd,
            risk_per_trade_pct=self.risk_per_trade_pct,
            max_effective_leverage=self.max_effective_leverage,
            min_stop_distance_bps=self.min_stop_distance_bps,
            max_stop_distance_bps=self.max_stop_distance_bps,
        )
        if self.testnet:
            limites["max_price_divergence_bps"] = DIVERGENCE_TESTNET_BPS
        return RiskLimits(**limites)


# LA DIVERGENCE MARK / ORACLE N'A PAS LA MEME ECHELLE SUR LES DEUX RESEAUX.
#
# Mesure du 12 septembre 2026, sur tout l'univers des perpetuels :
#
#                       mediane   p75    BTC    ETH    SOL   > 50 bps
#     mainnet             7,2    17,7    4,9    4,3    4,3    26 / 234
#     testnet            16,9   144,1   26,2   96,5   22,1    68 / 212
#
# La limite de 50 bps est juste en mainnet — les majeures y tiennent sous
# 5 bps. Sur le testnet, ETH depasse 50 a lui seul, en permanence : le desk
# s'arretait en STALE_FEED sans qu'aucun rearmement puisse rien y faire,
# puisque la cause est structurelle et non transitoire.
#
# Ce seuil elargi NE PEUT PAS ATTEINDRE L'ARGENT REEL : le mode LIVE refuse
# de demarrer avec `testnet=True` (voir la validation plus haut), donc les
# deux conditions s'excluent par construction.
DIVERGENCE_TESTNET_BPS = Decimal("250")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
