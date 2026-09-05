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

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .contracts.common import DeskMode
from .risk.limits import RiskLimits


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DESK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- posture ---
    mode: DeskMode = DeskMode.SHADOW
    testnet: bool = True
    assets: tuple[str, ...] = ("BTC", "ETH")

    # --- persistance ---
    db_path: str = "desk.db"
    postgres_dsn: str | None = None

    # --- supervision ---
    api_host: str = "127.0.0.1"
    api_port: int = 8787

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

    @field_validator("assets", mode="before")
    @classmethod
    def _split(cls, v: object) -> object:
        if isinstance(v, str):
            return tuple(a.strip().upper() for a in v.split(",") if a.strip())
        return v

    @model_validator(mode="after")
    def _live_requires_proof(self) -> Settings:
        """On refuse de demarrer en LIVE sans les preuves d'isolation.

        Le controle est ici, au demarrage, plutot qu'a la premiere signature :
        un desk mal configure doit refuser de se lancer, pas decouvrir le
        probleme avec une position ouverte.
        """
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
        return RiskLimits(
            max_daily_loss_pct=self.max_daily_loss_pct,
            max_gross_notional_usd=self.max_gross_notional_usd,
            max_position_notional_usd=self.max_position_notional_usd,
            risk_per_trade_pct=self.risk_per_trade_pct,
            max_effective_leverage=self.max_effective_leverage,
        )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
