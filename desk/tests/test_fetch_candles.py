"""Tests du script de collecte autonome.

Ce script tourne sur la machine de l'utilisateur, pas ici : c'est justement
pour ca qu'il merite des tests. Un bug dedans ne se voit pas au moment ou il
se produit — il se voit des semaines plus tard, dans un backtest dont on ne
comprend pas pourquoi la periode est trop courte.

Le cas reel qu'ils encodent : une demande de 365 jours en 1 h a renvoye
208 jours. La cause n'etait pas la pagination mais la **retention** de l'API —
`candleSnapshot` ne conserve qu'environ 5000 bougies par intervalle, soit
208 jours en 1 h. Le defaut du script n'etait donc pas de ramener une serie
courte, c'etait de ne pas le dire.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "fetch_candles", Path(__file__).resolve().parents[1] / "scripts" / "fetch_candles.py"
)
fetch_candles = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(fetch_candles)

HOUR = 3_600_000
RETENTION = 5_000        # bougies conservees par intervalle, cote Hyperliquid


class FakeApi:
    """Reproduit le comportement reel de `candleSnapshot`.

    Deux limites distinctes, souvent confondues :

    - la **retention** (`kept`) : les bougies plus anciennes n'existent pas,
      aucune pagination ne les fera apparaitre ;
    - le **plafond de reponse** (`cap`) : un seul appel ne renvoie jamais plus
      de `cap` bougies, celles-la se recuperent en plusieurs appels.

    C'est la premiere qui a produit les 208 jours, et c'est celle qu'on ne
    peut pas contourner.
    """

    def __init__(self, *, now: int, kept: int = RETENTION, cap: int = 5_000,
                 step: int = HOUR):
        self.now, self.kept, self.cap, self.step = now, kept, cap, step
        self.calls: list[tuple[int, int]] = []

    @property
    def first_ts(self) -> int:
        return self.now - (self.kept - 1) * self.step

    def __call__(self, url, coin, interval, start, end):
        self.calls.append((start, end))
        step = fetch_candles.INTERVAL_MS[interval]
        lo = max(self.first_ts, start)
        lo += (-lo) % step
        hi = min(self.now, end)
        if hi < lo:
            return []
        ts = list(range(lo, hi + 1, step))[-self.cap:]
        return [{"t": t, "T": t + step - 1, "s": coin, "i": interval,
                 "o": "100", "h": "101", "l": "99", "c": "100",
                 "v": "1", "n": 1} for t in ts]


@pytest.fixture()
def api(monkeypatch, tmp_path):
    now = 1_800_000_000_000 - 1_800_000_000_000 % HOUR
    fake = FakeApi(now=now)
    monkeypatch.setattr(fetch_candles, "fetch", fake)
    monkeypatch.setattr(fetch_candles.time, "time", lambda: now / 1000)
    monkeypatch.setattr(fetch_candles.time, "sleep", lambda *_: None)
    monkeypatch.chdir(tmp_path)
    return fake


def _run(*argv: str) -> int:
    monkey = ["fetch_candles", *argv]
    old, sys.argv = sys.argv, monkey
    try:
        return fetch_candles.main()
    finally:
        sys.argv = old


def _rows(tmp_path, name):
    import json
    return json.loads((tmp_path / name).read_text(encoding="utf-8"))


def test_la_retention_limite_la_periode_et_c_est_annonce(api, tmp_path, capsys):
    """Le cas reellement rencontre.

    365 jours demandes en 1 h, 208 obtenus. Le fichier reste utilisable ;
    ce qui ne l'est pas, c'est de croire qu'il couvre un an.
    """
    assert _run("--days", "365") == 0
    rows = _rows(tmp_path, "BTC_1h_365d.json")
    assert len(rows) == pytest.approx(RETENTION, abs=2)

    jours = (rows[-1]["t"] - rows[0]["t"]) / 86_400_000
    assert jours == pytest.approx(208, abs=1)

    sortie = capsys.readouterr().out
    assert "ATTENTION" in sortie
    assert "208 jours obtenus sur 365" in sortie
    assert "l'historique n'existe pas" in sortie


def test_un_intervalle_plus_large_est_propose_et_il_suffit(api, tmp_path, capsys):
    """Un avertissement qui ne dit pas quoi faire n'aide personne. Et le
    conseil doit etre juste : 4 h x 5000 = 833 jours, donc il couvre l'annee."""
    assert _run("--days", "365") == 0
    assert "--interval 4h --days 365" in capsys.readouterr().out

    api.step = 4 * HOUR
    api.calls.clear()
    assert _run("--days", "365", "--interval", "4h") == 0
    rows = _rows(tmp_path, "BTC_4h_365d.json")
    jours = (rows[-1]["t"] - rows[0]["t"]) / 86_400_000
    assert jours == pytest.approx(365, abs=1), "le conseil donne doit marcher"
    assert "ATTENTION" not in capsys.readouterr().out


def test_le_plafond_de_reponse_lui_est_bien_contourne(api, tmp_path):
    """A distinguer de la retention : quand l'historique existe, plusieurs
    appels doivent le ramener entierement."""
    api.cap = 1_000                       # plafond serre, retention intacte
    assert _run("--days", "365") == 0
    rows = _rows(tmp_path, "BTC_1h_365d.json")
    assert len(rows) == pytest.approx(RETENTION, abs=2)
    assert len(api.calls) >= 5, "un plafond serre impose plusieurs appels"


def test_la_serie_est_triee_sans_doublon(api, tmp_path):
    """Les fenetres se chevauchent volontiers ; sans deduplication, une bougie
    comptee deux fois donne un backtest qui trade deux fois le meme instant."""
    api.cap = 800
    assert _run("--days", "400") == 0
    ts = [r["t"] for r in _rows(tmp_path, "BTC_1h_400d.json")]
    assert ts == sorted(ts)
    assert len(ts) == len(set(ts))


def test_pas_de_boucle_infinie_si_l_api_stagne(api, tmp_path):
    """Une API qui renvoie toujours la meme fenetre ne doit pas faire tourner
    le script indefiniment sur la machine de quelqu'un d'autre."""
    api.kept = 10
    assert _run("--days", "365") == 0
    assert len(api.calls) < 50


def test_reseau_injoignable_ne_produit_pas_de_fichier(monkeypatch, tmp_path):
    """Aucun fichier vaut mieux qu'un fichier partiel qu'on croira complet."""
    import urllib.error

    def boom(*_a, **_k):
        raise urllib.error.URLError("proxy")

    monkeypatch.setattr(fetch_candles, "fetch", boom)
    monkeypatch.setattr(fetch_candles.time, "sleep", lambda *_: None)
    monkeypatch.chdir(tmp_path)
    assert _run("--days", "30") == 2
    assert not list(tmp_path.glob("*.json"))
