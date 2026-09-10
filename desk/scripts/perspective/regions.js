/* Relever les faces planes du cockpit sur le DESSIN AU TRAIT.
 *
 * Sur la photo, un bord de panneau est un chanfrein de six pixels avec un
 * gradient dessus : chaque mesure y attrapait un point different du biseau
 * et les droites ajustees partaient dans tous les sens (+10,8 deg d'un
 * cote, -7,5 de l'autre, sur deux panneaux symetriques). Le dessin, lui,
 * donne UN trait par arete. C'est la seule raison de s'en servir.
 *
 * Methode : les faces sont les regions blanches closes par les traits. On
 * etiquette les composantes connexes du fond clair, puis pour chaque
 * region on ajuste ses quatre aretes par Theil-Sen (mediane des pentes
 * deux a deux) — insensible aux coins arrondis et aux traits parasites,
 * la ou les moindres carres suivent la premiere bavure venue.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PLAN = process.argv[2];
const SEUIL = Number(process.argv[3] || 165);
const AIRE_MIN = Number(process.argv[4] || 2500);

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  const uri = "data:image/jpeg;base64," + fs.readFileSync(PLAN).toString("base64");
  await pg.setContent("<canvas id=c></canvas>");
  const out = await pg.evaluate(async ({ uri, SEUIL, AIRE_MIN }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = uri; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.getElementById("c");
    cv.width = W; cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;

    // clair = fond de la face ; sombre = trait
    const clair = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const l = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
      clair[i] = l >= SEUIL ? 1 : 0;
    }

    // composantes connexes 4-voisins du fond clair
    const lab = new Int32Array(W * H).fill(-1);
    const regions = [];
    const pile = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (!clair[s] || lab[s] !== -1) continue;
      const id = regions.length;
      let n = 0, aire = 0;
      let x0 = W, x1 = -1, y0 = H, y1 = -1;
      pile[n++] = s; lab[s] = id;
      while (n) {
        const q = pile[--n];
        const qx = q % W, qy = (q / W) | 0;
        aire++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (qx > 0 && clair[q - 1] && lab[q - 1] === -1) { lab[q - 1] = id; pile[n++] = q - 1; }
        if (qx < W - 1 && clair[q + 1] && lab[q + 1] === -1) { lab[q + 1] = id; pile[n++] = q + 1; }
        if (qy > 0 && clair[q - W] && lab[q - W] === -1) { lab[q - W] = id; pile[n++] = q - W; }
        if (qy < H - 1 && clair[q + W] && lab[q + W] === -1) { lab[q + W] = id; pile[n++] = q + W; }
      }
      regions.push({ id, aire, x0, x1, y0, y1 });
    }

    // Theil-Sen : mediane des pentes de toutes les paires de points.
    function theilSen(pts) {
      if (pts.length < 4) return null;
      const p = [];
      const pas = Math.max(1, Math.floor(pts.length / 90));
      for (let i = 0; i < pts.length; i += pas) p.push(pts[i]);
      const pentes = [];
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) {
          const du = p[j][0] - p[i][0];
          if (Math.abs(du) < 12) continue;
          pentes.push((p[j][1] - p[i][1]) / du);
        }
      if (!pentes.length) return null;
      pentes.sort((a, z) => a - z);
      const m = pentes[pentes.length >> 1];
      const ord = p.map(([u, v]) => v - m * u).sort((a, z) => a - z);
      return { m, b: ord[ord.length >> 1], n: p.length };
    }

    const mesures = [];
    for (const r of regions) {
      if (r.aire < AIRE_MIN) continue;
      const lw = r.x1 - r.x0, lh = r.y1 - r.y0;
      if (lw < 40 || lh < 25) continue;
      // extremes par ligne et par colonne, sur la composante seulement
      const minX = new Int32Array(H).fill(-1), maxX = new Int32Array(H).fill(-1);
      const minY = new Int32Array(W).fill(-1), maxY = new Int32Array(W).fill(-1);
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          if (lab[y * W + x] !== r.id) continue;
          if (minX[y] < 0) minX[y] = x;
          maxX[y] = x;
          if (minY[x] < 0) minY[x] = y;
          maxY[x] = y;
        }
      // rogner les coins : arrondis et raccords y mentent sur la pente
      const rx = Math.round(lw * 0.18), ry = Math.round(lh * 0.18);
      const haut = [], bas = [], gauche = [], droite = [];
      for (let x = r.x0 + rx; x <= r.x1 - rx; x++) {
        if (minY[x] >= 0) haut.push([x, minY[x]]);
        if (maxY[x] >= 0) bas.push([x, maxY[x]]);
      }
      for (let y = r.y0 + ry; y <= r.y1 - ry; y++) {
        if (minX[y] >= 0) gauche.push([y, minX[y]]);
        if (maxX[y] >= 0) droite.push([y, maxX[y]]);
      }
      const H_ = theilSen(haut), B_ = theilSen(bas);
      const G_ = theilSen(gauche), D_ = theilSen(droite);
      if (!H_ || !B_ || !G_ || !D_) continue;
      // y = m x + b (haut/bas) ; x = m y + b (gauche/droite)
      const coin = (hb, gd) => {
        const x = (gd.m * hb.b + gd.b) / (1 - gd.m * hb.m);
        return [x, hb.m * x + hb.b];
      };
      const quad = [coin(H_, G_), coin(H_, D_), coin(B_, D_), coin(B_, G_)];
      mesures.push({
        aire: r.aire,
        bbox: [r.x0, r.y0, r.x1, r.y1],
        penteHaut: Math.atan(H_.m) * 180 / Math.PI,
        penteBas: Math.atan(B_.m) * 180 / Math.PI,
        penteGauche: Math.atan(G_.m) * 180 / Math.PI,
        penteDroite: Math.atan(D_.m) * 180 / Math.PI,
        quad: quad.map(([x, y]) => [x / W * 100, y / H * 100]),
      });
    }
    mesures.sort((a, z) => z.aire - a.aire);
    return { W, H, nregions: regions.length, mesures };
  }, { uri, SEUIL, AIRE_MIN });
  await b.close();
  fs.writeFileSync(path.join(path.dirname(PLAN), "regions.json"), JSON.stringify(out, null, 1));
  console.log(`  ${out.W}x${out.H}  ${out.nregions} regions, ${out.mesures.length} retenues`);
  for (const m of out.mesures.slice(0, 26)) {
    const [x0, y0, x1, y1] = m.bbox;
    console.log(
      `  aire ${String(m.aire).padStart(7)}  bbox ${String(x0).padStart(4)},${String(y0).padStart(4)} ${String(x1).padStart(4)},${String(y1).padStart(4)}` +
      `   haut ${m.penteHaut.toFixed(2).padStart(6)}  bas ${m.penteBas.toFixed(2).padStart(6)}` +
      `   g ${m.penteGauche.toFixed(3).padStart(7)}  d ${m.penteDroite.toFixed(3).padStart(7)}`);
  }
})();
