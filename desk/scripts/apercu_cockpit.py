"""Fabrique un aperçu partageable À PARTIR DE L'APPLICATION QUI TOURNE.

Usage : lancer le desk (`python -m trading_desk --demo`), puis

    python scripts/apercu_cockpit.py --out /tmp/apercu.html

Le fichier produit est autonome : la photo y voyage en base64 et les réponses
du serveur y sont gelées. Il s'ouvre sans desk derrière.


On ne réécrit pas le cockpit pour la démo : on prend les mêmes fichiers, les
mêmes coordonnées, le même JavaScript, et on gèle les réponses du serveur.
Une maquette réécrite diverge de l'app au premier changement, et c'est celle
qu'on regarde le moins qui finit par mentir.

Ce que l'aperçu ne peut pas faire, il le dit : il ne coupe rien, ne lance
aucune campagne, ne rejoue aucun backtest — il n'y a pas de desk derrière.
"""
import argparse
import base64
import json
import re
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
UI = RACINE / "src/trading_desk/ui"

pa = argparse.ArgumentParser(description=__doc__)
pa.add_argument("--desk", default="http://127.0.0.1:8787",
                help="le desk qui tourne, dont on gèle les réponses")
pa.add_argument("--out", default="apercu-cockpit.html")
args = pa.parse_args()
BASE = args.desk

def get(chemin):
    with urllib.request.urlopen(BASE + chemin, timeout=20) as r:
        return r.read().decode("utf-8")

# --- les réponses réelles du desk, gelées -------------------------------
TABLE = {
    "/api/snapshot":  get("/api/snapshot"),
    "/api/journal":   get("/api/journal?limit=12"),
    "/api/recherche": get("/api/recherche"),
    "/api/campagnes": get("/api/campagnes"),
    "hotspots.json":  (UI / "cockpit/hotspots.json").read_text(encoding="utf-8"),
}
for strat in ("ema_cross", "tsmom", "turtle_breakout", "trend_follower_atr"):
    for actif in ("BTC", "ETH"):
        cle = f"/api/courbe?strategie={strat}&actif={actif}"
        try:
            TABLE[cle] = get(cle + "&intervalle=1h")
        except Exception:
            pass

photo = base64.b64encode((UI / "cockpit/assets/cockpit.jpg").read_bytes()).decode()
PHOTO = "data:image/jpeg;base64," + photo

def js(nom):
    return (UI / nom).read_text(encoding="utf-8")

shell = js("cockpit/shell.js")
# La photo voyage dans la page : pas de serveur derrière, et le canvas qui
# échantillonne le métal a besoin d'une source non « taintée ».
shell = shell.replace('CHEMIN + "assets/cockpit.jpg"', "window.__PHOTO")
# La vidéo fait 27 Mo : au-delà du plafond d'une page. On coupe sa source ;
# le champ d'étoiles reste, c'est exactement le rôle pour lequel il existe.
avant = shell
shell = shell.replace('v.src = CHEMIN + "assets/space-loop.mp4";',
                      'v.src = "";   /* pas de vidéo dans l\'aperçu */')
assert shell != avant, "la ligne de la vidéo a changé de forme"

brut = (UI / "cockpit.html").read_text(encoding="utf-8")
# Le <head> porte le style du tiroir. L'oublier laissait les panneaux
# classiques apparaître PAR-DESSUS le cockpit — trouvé en regardant le rendu.
tete = brut[brut.index("<head>"):brut.index("</head>")]
STYLES_TETE = "\n".join(re.findall(r"<style>.*?</style>", tete, re.S))
corps = brut[brut.index("<body"):]
corps = corps[corps.index(">") + 1:corps.rindex("</body>")]
# Chaque <script src> est remplacé PAR SON CODE, À SA PLACE. Les déplacer
# tous à la fin casse l'ordre : le script en ligne du tiroir enveloppe
# `Desk.montrer`, et s'exécuterait avant que `desk.js` ne l'ait défini.
def enligne(m):
    chemin = m.group(1).replace("/ui/", "")
    code = shell if chemin.endswith("shell.js") else js(chemin)
    return "<script>%s</script>" % code
corps = re.sub(r'<script src="([^"]+)"></script>', enligne, corps)

SHIM = """
/* Le poste est sombre. La page hôte enveloppe ce fichier dans son propre
   <html>, donc l'attribut posé sur celui de `cockpit.html` ne survit pas au
   voyage : sans cette ligne, les secteurs s'affichaient en BLANC dans une
   vitre de bord. `desk.js` remettra la préférence de l'utilisateur ensuite. */
document.documentElement.setAttribute("data-theme", "dark");

window.__PHOTO = %s;
window.__FIGE = %s;

/* L'aperçu n'a pas de desk derrière lui. Plutôt que de laisser chaque appel
   échouer en silence — ce qui donnerait une page à moitié vide sans qu'on
   sache pourquoi — on sert les réponses réelles du desk, gelées à l'instant
   de la capture, et on refuse les écritures en le disant. */
const VRAI_FETCH = window.fetch.bind(window);
window.fetch = function (url, opts) {
  const u = String(url);
  if (u.startsWith("data:")) return VRAI_FETCH(url, opts);
  const ecriture = opts && opts.method && opts.method.toUpperCase() !== "GET";
  const rendre = (o) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(o),
    text: () => Promise.resolve(JSON.stringify(o)),
  });
  if (ecriture) {
    return rendre({ ok: false, lance: false, arrete: false,
      raison: "Aperçu figé : aucun desk derrière cette page." });
  }
  const T = window.__FIGE;
  if (u.indexOf("hotspots.json") >= 0) return rendre(T["hotspots.json"]);
  for (const cle of Object.keys(T)) {
    if (cle.charAt(0) === "/" && u.indexOf(cle) >= 0) return rendre(T[cle]);
  }
  const courbe = Object.keys(T).find((c) => c.indexOf("/api/courbe") === 0);
  if (u.indexOf("/api/courbe") >= 0 && courbe) return rendre(T[courbe]);
  return rendre({});
};
/* Le flux temps réel n'existe pas ici : on laisse le code retomber sur son
   scrutin, qui lit la même réponse gelée. */
window.EventSource = function () { throw new Error("aperçu figé"); };
""" % (json.dumps(PHOTO), json.dumps({k: json.loads(v) for k, v in TABLE.items()}))

BANDEAU = """
<div id="apercu-note">Aperçu figé — le desk réel tourne sur 127.0.0.1.
Double-clic&nbsp;: loupe · <b>`</b>&nbsp;: HUD · <b>D</b>&nbsp;: calibrage</div>
<style>
#apercu-note {
  position: fixed; left: 12px; bottom: 12px; z-index: 40;
  font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace;
  color: #9fb4bb; background: rgba(4,10,13,.86);
  border: 1px solid rgba(120,160,175,.24); border-radius: 3px;
  padding: 6px 10px; max-width: 46ch;
}
#apercu-note b { color: #e2a54a }
@media (max-width: 700px) { #apercu-note { position: static; margin: 8px } }
</style>
"""

page = ["<title>Poste de pilotage orbital</title>",
        "<style>%s</style>" % (UI / "desk.css").read_text(encoding="utf-8"),
        "<style>%s</style>" % (UI / "cockpit/cockpit.css").read_text(encoding="utf-8"),
        STYLES_TETE, BANDEAU,
        "<script>%s</script>" % SHIM,
        corps]
assert corps.count("<script>") >= 6, "des scripts n'ont pas été mis en ligne"

sortie = Path(args.out)
sortie.write_text("\n".join(page), encoding="utf-8")
print(sortie, round(sortie.stat().st_size / 1e6, 2), "Mo")
