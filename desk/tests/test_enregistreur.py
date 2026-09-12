"""L'enregistreur : ce qui doit tenir pendant des semaines sans surveillance.

Ces tests ne vérifient pas que le code « marche ». Ils vérifient les quatre
promesses sur lesquelles repose une collecte de plusieurs semaines, et dont
la rupture ne se verrait qu'au moment de l'analyse — trop tard :

- **fidélité** : le message brut passe entier, `users` et `tid` compris ;
- **survie à la coupure** : un segment déjà écrit reste lisible même si le
  processus meurt à l'instant suivant ;
- **compactage sans perte** : la fusion ne supprime les segments qu'après
  avoir relu ce qu'elle a écrit ;
- **le disque ne bloque jamais le socket**, et ce qui est perdu est compté.
"""

from __future__ import annotations

import json

import pyarrow.parquet as pq
import pytest

from trading_desk.enregistreur.compactage import compacter, segments_par_jour
from trading_desk.enregistreur.ecrivain import EcrivainParquet, jour_utc
from trading_desk.enregistreur.schemas import lignes

# Messages capturés en direct sur api.hyperliquid.xyz le 6 septembre 2026.
# Pas inventés : un schéma deviné est la façon la plus sûre de perdre des
# semaines de collecte sans s'en apercevoir.
TRADE = json.loads('''{"channel":"trades","data":[{"coin":"BTC","side":"A",
  "px":"79889.0","sz":"0.00054","time":1788658198628,
  "hash":"0x176d4acec02dfa3c18e70443c6e66601ac0062b45b21190ebb35f6217f21d426",
  "tid":226388921035269,
  "users":["0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00",
           "0x4d2a7e458a9091cf678b3a4a21d4be019870ebaa"]}]}''')
BOOK = json.loads('''{"channel":"l2Book","data":{"coin":"BTC","time":1788658200000,
  "levels":[[{"px":"79889.0","sz":"7.85045","n":22},{"px":"79885.0","sz":"1.2","n":3}],
            [{"px":"79890.0","sz":"4.16384","n":20}]]}}''')
CTX = json.loads('''{"channel":"activeAssetCtx","data":{"coin":"BTC","ctx":{
  "funding":"0.0000125","openInterest":"35409.41702","prevDayPx":"79666.0",
  "dayNtlVlm":"845822222.75","premium":"-0.0004003904","oraclePx":"79922.0",
  "markPx":"79890.0","midPx":"79889.5","impactPxs":["79889.0","79890.0"],
  "dayBaseVlm":"10601.61339"}}}''')
BBO = json.loads('''{"channel":"bbo","data":{"coin":"BTC","time":1788658262104,
  "bbo":[{"px":"79889.0","sz":"7.34976","n":21},{"px":"79890.0","sz":"4.16384","n":20}]}}''')


# --------------------------------------------------------------------------
#  Fidélité
# --------------------------------------------------------------------------

def test_le_trade_conserve_les_adresses_et_son_identifiant():
    """`users` est ce qui rendra détectables les liquidations ET les
    portefeuilles suivis. Les contrats du desk le jettent ; ici il reste."""
    flux, rows = lignes("trades", TRADE["data"], recu_ms=1788658198700)
    assert flux == "trades" and len(rows) == 1
    r = rows[0]
    assert r["acheteur"] == "0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00"
    assert r["vendeur"] == "0x4d2a7e458a9091cf678b3a4a21d4be019870ebaa"
    assert r["tid"] == 226388921035269
    assert r["px"] == 79889.0 and r["sz"] == 0.00054
    assert r["ts_ms"] == 1788658198628 and r["recu_ms"] == 1788658198700


def test_le_carnet_devient_une_ligne_par_niveau_avec_son_rang():
    flux, rows = lignes("l2Book", BOOK["data"], recu_ms=1)
    assert flux == "book" and len(rows) == 3      # 2 bids + 1 ask
    bids = [r for r in rows if r["cote"] == 0]
    assert [r["niveau"] for r in bids] == [0, 1]
    assert bids[0]["px"] == 79889.0 and bids[0]["n"] == 22
    assert [r["cote"] for r in rows if r["px"] == 79890.0] == [1]


def test_le_contexte_porte_open_interest_et_funding():
    """Les deux entrées du déclencheur n°5, qui n'existent nulle part en
    historique — c'est la seule raison d'enregistrer ce flux."""
    flux, rows = lignes("activeAssetCtx", CTX["data"], recu_ms=42)
    assert flux == "ctx" and rows[0]["open_interest"] == 35409.41702
    assert rows[0]["funding"] == 0.0000125
    assert rows[0]["ts_ms"] == 42, "ce flux n'a pas d'horodatage propre"


def test_le_bbo_separe_bien_les_deux_cotes():
    flux, rows = lignes("bbo", BBO["data"], recu_ms=1)
    assert flux == "bbo"
    assert rows[0]["bid_px"] == 79889.0 and rows[0]["ask_px"] == 79890.0


@pytest.mark.parametrize("canal,data", [
    ("inconnu", {"x": 1}), ("trades", "pas une liste"), ("l2Book", []),
    ("activeAssetCtx", {"coin": "BTC"}),
])
def test_un_message_malforme_ne_leve_jamais(canal, data):
    """Un canal inconnu ou un message tordu ne doit pas interrompre
    l'enregistrement des autres flux."""
    _flux, rows = lignes(canal, data, recu_ms=1)
    assert rows == []


def test_un_champ_illisible_devient_un_trou_pas_un_zero():
    """Un zéro silencieux se mêlerait aux vraies valeurs et fausserait toute
    moyenne calculée dessus des semaines plus tard."""
    casse = {"coin": "BTC", "ctx": {"funding": "n/a", "openInterest": None,
                                    "markPx": "79890.0"}}
    _, rows = lignes("activeAssetCtx", casse, recu_ms=1)
    assert rows[0]["funding"] is None
    assert rows[0]["open_interest"] is None
    assert rows[0]["mark_px"] == 79890.0


# --------------------------------------------------------------------------
#  Écriture : survivre à la coupure
# --------------------------------------------------------------------------

def _lignes_trades(n: int, ts: int = 1788658198628) -> list[dict]:
    _, base = lignes("trades", TRADE["data"], recu_ms=ts)
    out = []
    for i in range(n):
        r = dict(base[0])
        r["ts_ms"] = ts + i
        r["tid"] = base[0]["tid"] + i
        out.append(r)
    return out


def test_un_segment_ecrit_est_relisible_immediatement(tmp_path):
    """La propriété centrale. Un `ParquetWriter` gardé ouvert 24 h laisse un
    fichier SANS pied de page si le processus est tué — illisible en entier,
    pas tronqué. Ici chaque segment est clos, donc lisible."""
    e = EcrivainParquet(tmp_path, max_lignes=10)
    e.ajouter("trades", "BTC", _lignes_trades(10))
    assert e.segments_ecrits == 1

    fichiers = list((tmp_path / "BTC" / "partiel").glob("*.parquet"))
    assert len(fichiers) == 1
    table = pq.read_table(fichiers[0])
    assert table.num_rows == 10
    assert table.column("acheteur")[0].as_py().startswith("0xecb")


def test_le_seuil_de_lignes_declenche_l_ecriture(tmp_path):
    e = EcrivainParquet(tmp_path, max_lignes=5)
    e.ajouter("trades", "BTC", _lignes_trades(4))
    assert e.segments_ecrits == 0 and e.en_attente == 4
    e.ajouter("trades", "BTC", _lignes_trades(1))
    assert e.segments_ecrits == 1 and e.en_attente == 0


def test_le_seuil_de_temps_vide_un_flux_peu_bavard(tmp_path):
    """`ctx` publie une poignée de lignes par minute : sans expiration, elles
    resteraient en mémoire des heures et un incident les perdrait toutes."""
    e = EcrivainParquet(tmp_path, max_lignes=10_000, max_secondes=0.0)
    e.ajouter("trades", "BTC", _lignes_trades(3))
    assert e.segments_ecrits == 0
    e.vider_expires()
    assert e.segments_ecrits == 1


def test_un_tampon_a_cheval_sur_minuit_produit_deux_segments(tmp_path):
    """Sinon une ligne du 7 finirait dans le fichier journalier du 6, et le
    compactage produirait des journées qui se chevauchent."""
    e = EcrivainParquet(tmp_path, max_lignes=10_000)
    minuit = 1788652800000          # 2026-09-07T00:00:00Z
    avant = _lignes_trades(2, ts=minuit - 2000)
    apres = _lignes_trades(2, ts=minuit + 1000)
    assert jour_utc(avant[0]["ts_ms"]) != jour_utc(apres[0]["ts_ms"])
    e.ajouter("trades", "BTC", avant + apres)
    e.vider_tout()
    jours = {f.stem.split("_")[2] for f in (tmp_path / "BTC" / "partiel").glob("*.parquet")}
    assert len(jours) == 2


def test_le_disque_plein_arrete_les_ecritures_et_compte_les_pertes(tmp_path):
    """Écrire jusqu'à saturation ferait tomber le VPS entier, pas seulement
    l'enregistreur. Et une perte silencieuse laisserait croire à un marché
    calme là où il y a eu une rafale."""
    e = EcrivainParquet(tmp_path, max_lignes=2, min_libre_mo=10**9)
    e.ajouter("trades", "BTC", _lignes_trades(2))
    assert e.segments_ecrits == 0
    assert e.lignes_perdues_disque == 2
    e.ajouter("trades", "BTC", _lignes_trades(3))
    assert e.lignes_perdues_disque == 5, "les pertes suivantes comptent aussi"


def test_une_erreur_d_ecriture_est_comptee_pas_levee(tmp_path, monkeypatch):
    """L'enregistreur doit survivre à son disque."""
    import pyarrow.parquet as vrai
    e = EcrivainParquet(tmp_path, max_lignes=1)
    monkeypatch.setattr(vrai, "write_table",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("disque")))
    e.ajouter("trades", "BTC", _lignes_trades(1))
    assert e.erreurs == 1 and e.segments_ecrits == 0


# --------------------------------------------------------------------------
#  Compactage
# --------------------------------------------------------------------------

def _semer(tmp_path, jour: str, n_segments: int, par_segment: int = 4) -> None:
    e = EcrivainParquet(tmp_path, max_lignes=par_segment)
    base = int(__import__("datetime").datetime.strptime(
        jour, "%Y-%m-%d").replace(tzinfo=__import__("datetime").UTC).timestamp() * 1000)
    for s in range(n_segments):
        e.ajouter("trades", "BTC", _lignes_trades(par_segment, ts=base + s * 1000))


def test_des_segments_rapproches_ne_s_ecrasent_pas(tmp_path):
    """Aucune ligne perdue, meme si tout est ecrit dans la meme milliseconde.

    Le nom de segment n'a qu'une resolution de la milliseconde. Sans numero
    d'ordre, deux vidages rapproches du meme flux portaient le meme nom et
    le second ecrasait le premier — silencieusement. Le seul symptome etait
    un fichier journalier plus court que prevu, ce qui se lit comme un
    marche calme et non comme une perte.

    C'est ce qui rendait le test de compactage ci-dessous intermittent :
    douze lignes attendues, huit obtenues quand la machine allait vite.
    """
    e = EcrivainParquet(tmp_path, max_lignes=2)
    for i in range(25):
        e.ajouter("trades", "BTC", _lignes_trades(2, ts=1_757_000_000_000 + i))
    e.vider_tout()

    segments = list((tmp_path / "BTC" / "partiel").glob("*.parquet"))
    assert len(segments) == 25, f"{len(segments)} segments au lieu de 25"
    total = sum(pq.read_table(f).num_rows for f in segments)
    assert total == 50, f"{total} lignes au lieu de 50 : des segments se sont écrasés"
    assert e.lignes_ecrites == 50


def test_le_compactage_fusionne_et_supprime_les_segments(tmp_path):
    _semer(tmp_path, "2026-09-06", n_segments=3)
    assert len(segments_par_jour(tmp_path)) == 1

    faits = compacter(tmp_path, jour_courant="2026-09-07")
    assert faits == [("BTC_trades_2026-09-06.parquet", 12)]
    fusionne = tmp_path / "BTC" / "BTC_trades_2026-09-06.parquet"
    assert pq.read_table(fusionne).num_rows == 12
    assert list((tmp_path / "BTC" / "partiel").glob("*.parquet")) == []


def test_le_jour_en_cours_nest_jamais_compacte(tmp_path):
    """Ses segments arrivent encore : le fusionner reviendrait à trancher la
    journée en deux fichiers dont l'un serait écrasé à l'heure suivante."""
    _semer(tmp_path, "2026-09-06", n_segments=2)
    assert compacter(tmp_path, jour_courant="2026-09-06") == []
    assert len(list((tmp_path / "BTC" / "partiel").glob("*.parquet"))) == 2


def test_une_reprise_reintegre_le_fichier_deja_compacte(tmp_path):
    """Sans ça, une deuxième passe écraserait la première fusion et
    perdrait tout ce qu'elle contenait."""
    _semer(tmp_path, "2026-09-06", n_segments=2)
    compacter(tmp_path, jour_courant="2026-09-07")
    _semer(tmp_path, "2026-09-06", n_segments=1)       # segments tardifs
    compacter(tmp_path, jour_courant="2026-09-07")
    total = pq.read_table(tmp_path / "BTC" / "BTC_trades_2026-09-06.parquet").num_rows
    assert total == 12, "8 de la première passe + 4 tardifs"


def test_une_fusion_qui_ne_se_relit_pas_garde_les_segments(tmp_path, monkeypatch):
    """L'ordre qui compte : relire AVANT de supprimer. Une fusion qui
    écrirait puis effacerait détruirait les données le jour où le disque se
    remplit en cours d'écriture."""
    import trading_desk.enregistreur.compactage as mod
    _semer(tmp_path, "2026-09-06", n_segments=2)
    monkeypatch.setattr(mod.pq, "read_metadata",
                        lambda *a, **k: type("M", (), {"num_rows": 0})())
    assert compacter(tmp_path, jour_courant="2026-09-07") == []
    assert len(list((tmp_path / "BTC" / "partiel").glob("*.parquet"))) == 2
    assert not (tmp_path / "BTC" / "BTC_trades_2026-09-06.parquet").exists()


def test_le_compactage_trie_par_horodatage(tmp_path):
    """Un segment à cheval sur minuit peut être écrit après un plus récent."""
    _semer(tmp_path, "2026-09-06", n_segments=3)
    compacter(tmp_path, jour_courant="2026-09-07")
    ts = pq.read_table(tmp_path / "BTC" / "BTC_trades_2026-09-06.parquet") \
           .column("ts_ms").to_pylist()
    assert ts == sorted(ts)


# --------------------------------------------------------------------------
#  Le collecteur : le disque ne freine jamais le socket
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_une_file_pleine_perd_des_lignes_et_les_compte(tmp_path):
    """Le contraire serait une file non bornée, qui ne perd rien jusqu'à ce
    que la mémoire du VPS soit pleine et que l'OOM killer prenne tout.

    Perdre cent lignes en le sachant vaut mieux que perdre trois semaines
    sans le savoir.
    """
    from trading_desk.enregistreur.collecte import Collecteur

    c = Collecteur(["BTC"], tmp_path, taille_file=2)
    for _ in range(5):
        await c._sur_message(TRADE)
    assert c.file.qsize() == 2
    assert c.lignes_perdues_file == 3
    assert c.messages == 5, "les messages restent comptés même perdus"


@pytest.mark.asyncio
async def test_le_gestionnaire_de_message_n_ecrit_jamais_sur_disque(tmp_path):
    """S'il écrivait, la latence disque deviendrait une latence réseau — et
    c'est en pleine cascade de liquidations que ça coûterait le plus cher."""
    from trading_desk.enregistreur.collecte import Collecteur

    c = Collecteur(["BTC"], tmp_path)
    await c._sur_message(TRADE)
    assert c.ecrivain.segments_ecrits == 0
    assert c.ecrivain.en_attente == 0
    assert c.file.qsize() == 1


@pytest.mark.asyncio
async def test_les_messages_de_service_ne_sont_pas_enregistres(tmp_path):
    from trading_desk.enregistreur.collecte import Collecteur

    c = Collecteur(["BTC"], tmp_path)
    for msg in ({"channel": "pong"}, {"channel": "subscriptionResponse"},
                {"channel": "error", "data": "rate limited"}):
        await c._sur_message(msg)
    assert c.file.qsize() == 0 and c.messages == 0


# --------------------------------------------------------------------------
#  Le chien de garde
# --------------------------------------------------------------------------

class _ClientFactice:
    """Double minimal : seul `connected` compte desormais.

    La fraicheur n'est plus lue sur le client mais suivie par le collecteur
    lui-meme, depuis `on_raw`. C'est ce qui rend la surveillance exhaustive :
    le `_dispatch` du client P0 ignore le canal `bbo`, donc ses souscriptions
    restaient eternellement NEVER_CONNECTED et le chien de garde etait
    aveugle sur un flux pourtant enregistre — constate au premier essai reel,
    « flux vivants 9/12 » alors que les douze recevaient des donnees.
    """

    def __init__(self, connecte=True):
        self.connected = connecte
        self.fermetures: list[str] = []
        self.feeds = ()

    async def force_reconnect(self, motif=""):
        self.fermetures.append(motif)
        return True


async def _collecteur_vu(tmp_path, ages_s: dict[str, float], connecte=True):
    """Un collecteur dont chaque flux a ete vu il y a `age` secondes."""
    import time as _t

    from trading_desk.enregistreur.collecte import Collecteur
    c = Collecteur(["BTC"], tmp_path)
    c.client = _ClientFactice(connecte)
    maintenant = _t.monotonic()
    c._dernier_vu = {nom: maintenant - age for nom, age in ages_s.items()}
    return c


@pytest.mark.asyncio
async def test_un_seul_flux_recent_suffit_a_ne_pas_reconnecter(tmp_path):
    """Un actif peut legitimement ne rien echanger pendant des minutes, et
    `activeAssetCtx` publie par a-coups. C'est le silence SIMULTANE de tout
    qui signale une connexion morte plutot qu'un marche calme."""
    c = await _collecteur_vu(tmp_path, {"trades:BTC": 1.0, "book:BTC": 500.0,
                                        "ctx:BTC": 500.0})
    assert not c._tout_gele()
    assert c.flux_vivants == 1


@pytest.mark.asyncio
async def test_tout_muet_depuis_trop_longtemps_declenche_le_gel(tmp_path):
    c = await _collecteur_vu(tmp_path, {"trades:BTC": 500.0, "book:BTC": 500.0})
    assert c._tout_gele()
    assert c.flux_vivants == 0


@pytest.mark.asyncio
async def test_le_demarrage_a_froid_ne_declenche_pas_le_chien_de_garde(tmp_path):
    """Rien n'est jamais arrive : un forcage a froid boucle sans jamais
    rien recevoir."""
    c = await _collecteur_vu(tmp_path, {})
    assert not c._tout_gele()


@pytest.mark.asyncio
async def test_une_deconnexion_franche_nest_pas_traitee_comme_un_gel(tmp_path):
    """Elle a son propre chemin : le backoff de `run()`. Forcer par-dessus
    ne compterait que des reconnexions imaginaires."""
    c = await _collecteur_vu(tmp_path, {"trades:BTC": 500.0}, connecte=False)
    assert not c._tout_gele()


@pytest.mark.asyncio
async def test_tout_flux_enregistre_est_surveille(tmp_path):
    """Le defaut trouve au premier essai reel : `bbo` etait enregistre mais
    invisible du chien de garde."""
    from trading_desk.enregistreur.collecte import Collecteur

    c = Collecteur(["BTC"], tmp_path)
    for msg in (TRADE, BOOK, BBO, CTX):
        await c._sur_message(msg)
    assert set(c._dernier_vu) == {"trades:BTC", "book:BTC", "bbo:BTC", "ctx:BTC"}
    assert c.flux_vivants == 4


@pytest.mark.asyncio
async def test_le_journal_detat_fonctionne_contre_le_VRAI_client(tmp_path):
    """Le bug que les doubles ne pouvaient pas attraper.

    `feeds` est une propriete du vrai client ; le double la declarait en
    methode. Tout passait, et le chemin reel levait `TypeError` au premier
    journal d'etat — cinq minutes apres le demarrage du service, donc bien
    apres tout controle manuel. Ce test s'adresse au vrai objet, sans reseau.
    """
    from trading_desk.enregistreur.collecte import Collecteur

    c = Collecteur(["BTC", "ETH"], tmp_path)
    c.journaliser_etat()          # doit passer sans connexion
    assert c._tout_gele() is False
